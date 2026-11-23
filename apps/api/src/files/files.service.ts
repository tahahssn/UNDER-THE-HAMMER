import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { S3Service } from './s3/s3.client';
import { FileSignatureValidator } from './s3/file-signature.validator';
import { FileAssetRepository } from './repositories/file-asset.repository';

export interface UploadIntentRequest {
  kind: string; // TEAM_LOGO, AVATAR, etc.
  teamId?: string;
  filename: string;
  fileSizeBytes: number;
  declaredMimeType: string;
}

export interface ConfirmUploadRequest {
  uploadId: string;
  sha256Hash: string;
  actualMimeType: string;
}

@Injectable()
export class FilesService {
  private readonly maxFileSize = 5 * 1024 * 1024; // 5 MB
  private readonly allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png'];

  constructor(
    private readonly s3: S3Service,
    private readonly fileAssetRepo: FileAssetRepository,
  ) {}

  /**
   * Request an upload intent
   */
  async requestUploadIntent(request: UploadIntentRequest, userId: string) {
    // Validate file size
    if (request.fileSizeBytes > this.maxFileSize) {
      throw new BadRequestException(`File size exceeds ${this.maxFileSize} bytes`);
    }

    // Validate MIME type
    if (!this.allowedMimeTypes.includes(request.declaredMimeType)) {
      throw new BadRequestException(`MIME type not allowed. Allowed: ${this.allowedMimeTypes.join(', ')}`);
    }

    // For TEAM_LOGO, verify team ownership (would need to check with TeamRepository)
    // For now, simplified authorization
    if (request.kind === 'TEAM_LOGO' && !request.teamId) {
      throw new BadRequestException('teamId required for TEAM_LOGO');
    }

    // Generate upload ID
    const uploadId = this.s3.generateUploadId();
    const objectKey = this.s3.getTeamLogoKey(uploadId);

    // Create FileAsset record
    const fileAsset = await this.fileAssetRepo.create({
      kind: request.kind,
      objectKey,
      bucket: 'default-bucket',
      contentType: request.declaredMimeType,
      uploadedById: userId,
    });

    // Generate presigned URL
    const presignedUrlResult = await this.s3.generatePresignedPostUrl(
      uploadId,
      request.declaredMimeType,
      this.maxFileSize,
    );

    return {
      uploadId: fileAsset.id,
      presignedUrl: presignedUrlResult.url,
      expiresAt: presignedUrlResult.expiresAt,
    };
  }

  /**
   * Confirm upload and trigger verification
   */
  async confirmUpload(request: ConfirmUploadRequest, userId: string) {
    // Find the FileAsset
    const fileAsset = await this.fileAssetRepo.findById(request.uploadId);

    if (!fileAsset) {
      throw new NotFoundException('Upload not found');
    }

    if (fileAsset.uploadedById !== userId) {
      throw new ForbiddenException('You do not have permission to confirm this upload');
    }

    if (fileAsset.status !== 'PENDING_UPLOAD') {
      throw new BadRequestException('Upload is not in PENDING_UPLOAD status');
    }

    // Check if file exists in S3
    const s3Metadata = await this.s3.headObject(fileAsset.objectKey);
    if (!s3Metadata) {
      throw new BadRequestException('File not found in S3');
    }

    // Download and validate
    let buffer: Buffer;
    try {
      buffer = await this.s3.getObject(fileAsset.objectKey);
    } catch (error) {
      throw new BadRequestException('Failed to download file from S3');
    }

    // Validate SHA256
    const calculatedHash = createHash('sha256').update(buffer).digest('hex');
    if (calculatedHash.toLowerCase() !== request.sha256Hash.toLowerCase()) {
      await this.fileAssetRepo.updateStatus(request.uploadId, 'REJECTED');
      throw new BadRequestException('SHA256 hash mismatch');
    }

    // Validate file signature
    try {
      FileSignatureValidator.validateFileSignature(buffer, request.actualMimeType);
    } catch (error) {
      await this.fileAssetRepo.updateStatus(request.uploadId, 'REJECTED');
      throw error;
    }

    // Extract and validate dimensions
    let width = 0;
    let height = 0;
    try {
      const dims = await FileSignatureValidator.extractImageDimensions(buffer);
      width = dims.width;
      height = dims.height;
      FileSignatureValidator.validateDimensions(width, height, 100, 2000);
    } catch (error) {
      await this.fileAssetRepo.updateStatus(request.uploadId, 'REJECTED');
      throw error;
    }

    // Update FileAsset with metadata and mark PROCESSING
    await this.fileAssetRepo.markReady(request.uploadId, {
      status: 'PROCESSING',
      contentType: request.actualMimeType,
      sizeBytes: buffer.length,
      sha256: calculatedHash,
      width,
      height,
    });

    // In production, enqueue background job for image re-encoding
    // For MVP, immediately mark as READY
    const updated = await this.fileAssetRepo.markReady(request.uploadId, {
      status: 'READY',
    });

    return this.formatFileAsset(updated);
  }

  /**
   * Get file metadata
   */
  async getFile(id: string, userId?: string) {
    const file = await this.fileAssetRepo.findById(id);

    if (!file) {
      throw new NotFoundException('File not found');
    }

    // Authorization: uploader can see any status; others can see only READY
    if (file.status !== 'READY' && file.uploadedById !== userId) {
      throw new ForbiddenException('You do not have permission to view this file');
    }

    return this.formatFileAsset(file);
  }

  /**
   * Get download URL for file
   */
  async getDownloadUrl(id: string, userId?: string): Promise<{ url: string; expiresAt: string }> {
    const file = await this.fileAssetRepo.findById(id);

    if (!file) {
      throw new NotFoundException('File not found');
    }

    // Authorization
    if (file.status === 'PENDING_UPLOAD' || file.status === 'PROCESSING' || file.status === 'REJECTED') {
      if (file.uploadedById !== userId) {
        throw new ForbiddenException('You do not have permission to download this file');
      }
    }

    if (file.status === 'DISABLED' || file.status === 'DELETED') {
      throw new NotFoundException('File is no longer available');
    }

    // Generate presigned GET URL (24 hours)
    const url = await this.s3.generatePresignedGetUrl(file.objectKey, 86400);

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    return {
      url,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Disable file (uploader or admin)
   */
  async disableFile(id: string, userId: string, reason?: string) {
    const file = await this.fileAssetRepo.findById(id);

    if (!file) {
      throw new NotFoundException('File not found');
    }

    if (file.uploadedById !== userId) {
      throw new ForbiddenException('You do not have permission to disable this file');
    }

    await this.fileAssetRepo.disable(id, reason);
  }

  /**
   * Format FileAsset for response
   */
  private formatFileAsset(file: any) {
    return {
      id: file.id,
      kind: file.kind,
      status: file.status,
      objectKey: file.objectKey,
      bucket: file.bucket,
      contentType: file.contentType,
      width: file.width,
      height: file.height,
      sizeBytes: file.sizeBytes ? Number(file.sizeBytes) : undefined,
      uploadedBy: file.uploadedBy
        ? { displayName: file.uploadedBy.profile?.displayName }
        : undefined,
      rightsConfirmed: !!file.rightsConfirmedAt,
      createdAt: file.createdAt.toISOString(),
      updatedAt: file.updatedAt.toISOString(),
    };
  }

  /**
   * Clean up expired uploads
   * Should be called by a scheduled job (e.g., once per hour)
   * Marks PENDING_UPLOAD records older than 15 minutes as REJECTED
   */
  async cleanupExpiredUploads(): Promise<{ cleanedUpCount: number }> {
    // 15 minutes is the default presigned URL expiry
    const expiredUploadIds = await this.fileAssetRepo.cleanupExpiredPendingUploads(15);

    // For each expired upload, attempt to clean up S3 object (best-effort)
    for (const uploadId of expiredUploadIds) {
      const fileAsset = await this.fileAssetRepo.findById(uploadId);
      if (fileAsset) {
        await this.s3.deleteObject(fileAsset.objectKey);
      }
    }

    return { cleanedUpCount: expiredUploadIds.length };
  }

  /**
   * Check and recover stale PROCESSING uploads
   * Marks very old PROCESSING records as REJECTED if S3 object doesn't exist
   */
  async recoverStaleProcessingUploads(): Promise<{ recoveredCount: number }> {
    const staleUploads = await this.fileAssetRepo.findOrphanedProcessingUploads(30);

    let recoveredCount = 0;
    for (const upload of staleUploads) {
      const s3Metadata = await this.s3.headObject(upload.objectKey);
      if (!s3Metadata) {
        await this.fileAssetRepo.updateStatus(upload.id, 'REJECTED');
        recoveredCount++;
      }
    }

    return { recoveredCount };
  }
}
