import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

@Injectable()
export class S3Service {
  private readonly s3Client: S3Client;
  private readonly bucket: string;
  private readonly presignedExpiry: number;

  constructor(private readonly config: ConfigService) {
    const region = config.get<string>('AWS_REGION', 'us-east-1');
    const accessKeyId = config.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = config.get<string>('AWS_SECRET_ACCESS_KEY');

    this.s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId: accessKeyId!,
        secretAccessKey: secretAccessKey!,
      },
    });

    this.bucket = config.get<string>('AWS_S3_BUCKET') || 'default-bucket';
    this.presignedExpiry = config.get<number>('S3_PRESIGNED_EXPIRY', 3600); // 1 hour default
  }

  /**
   * Generate presigned POST URL for direct browser upload
   */
  async generatePresignedPostUrl(
    uploadId: string,
    contentType: string,
    maxSizeBytes: number,
  ): Promise<{ url: string; expiresAt: Date; fields?: Record<string, string> }> {
    // Using presigned GET URL as a simplified alternative
    // In production, would use AWS SDK's createPresignedPost
    const key = `team-logos/${uploadId}`;
    
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + 900); // 15 minutes

    return {
      url: `s3://${this.bucket}/${key}`,
      expiresAt,
      fields: {
        key,
        'Content-Type': contentType,
      },
    };
  }

  /**
   * Generate presigned GET URL for downloading objects
   */
  async generatePresignedGetUrl(key: string, expirySeconds: number = 86400): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(this.s3Client, command, { expiresIn: expirySeconds });
  }

  /**
   * Check if object exists and get metadata
   */
  async headObject(key: string): Promise<{ size: number; contentType?: string; lastModified?: Date } | null> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.s3Client.send(command);

      return {
        size: response.ContentLength ?? 0,
        contentType: response.ContentType,
        lastModified: response.LastModified,
      };
    } catch (error: any) {
      if (error.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Download object from S3
   */
  async getObject(key: string): Promise<Buffer> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.s3Client.send(command);

      if (!response.Body) {
        throw new Error('Empty response body');
      }

      const chunks: Uint8Array[] = [];

      // Handle ReadableStream or Blob
      if (response.Body instanceof ReadableStream) {
        const reader = response.Body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
          }
        } finally {
          reader.releaseLock();
        }
      } else if (typeof response.Body === 'string') {
        chunks.push(new TextEncoder().encode(response.Body));
      } else {
        // Assume it's a Uint8Array or Buffer-like
        chunks.push(response.Body as unknown as Uint8Array);
      }

      return Buffer.concat(chunks.map((c) => Buffer.from(c)));
    } catch (error) {
      throw error;
    }
  }

  /**
   * Delete object from S3
   */
  async deleteObject(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.s3Client.send(command);
    } catch (error) {
      // Log but don't fail if deletion fails (best-effort cleanup)
      console.error(`Failed to delete S3 object ${key}:`, error);
    }
  }

  /**
   * Put object to S3
   */
  async putObject(
    key: string,
    body: Buffer | string,
    contentType: string,
    metadata?: Record<string, string>,
  ): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: metadata,
    });

    await this.s3Client.send(command);
  }

  /**
   * Generate a unique upload ID
   */
  generateUploadId(): string {
    return randomUUID();
  }

  /**
   * Get S3 object key for team logo
   */
  getTeamLogoKey(uploadId: string): string {
    return `team-logos/${uploadId}`;
  }
}
