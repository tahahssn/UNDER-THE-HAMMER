export interface UploadIntentRequest {
  kind: 'TEAM_LOGO' | 'USER_AVATAR' | 'EXPORT_IMAGE';
  teamId?: string;
  filename: string;
  fileSizeBytes: number;
  declaredMimeType: string;
}

export interface UploadIntentResponse {
  uploadId: string;
  presignedUrl: string;
  expiresAt: string;
}

export interface ConfirmUploadRequest {
  uploadId: string;
  sha256Hash: string;
  actualMimeType: string;
}

export interface FileAssetDto {
  id: string;
  kind: string;
  status: string;
  objectKey: string;
  bucket: string;
  contentType?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  uploadedBy?: { displayName: string };
  rightsConfirmed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DownloadUrlResponse {
  url: string;
  expiresAt: string;
}

export interface ModerationCaseDto {
  id: string;
  assetId: string;
  reason: string;
  complaintText?: string;
  complainantEmail?: string;
  status: string;
  outcome?: string;
  resolvedBy?: { displayName: string };
  createdAt: string;
  resolvedAt?: string;
}
