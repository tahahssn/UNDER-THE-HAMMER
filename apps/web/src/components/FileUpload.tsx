'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { FileAssetKind, FileAssetDto } from '@/lib/types';
import { getUploadIntent, confirmUpload, verifyUpload } from '@/lib/api';
import { calculateSHA256 } from '@/lib/crypto';
import Button from './Button';
import Card from './Card';

interface FileUploadProps {
  kind: FileAssetKind;
  teamId?: string;
  onSuccess: (fileAssetId: string) => void;
  onError: (error: string) => void;
  isLoading?: boolean;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'];

function isError(error: unknown): error is Error {
  return error instanceof Error;
}

export default function FileUpload({
  kind,
  teamId,
  onSuccess,
  onError,
  isLoading,
}: FileUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<
    'idle' | 'uploading-to-s3' | 'confirming' | 'verifying' | 'success'
  >('idle');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragOverRef = useRef(false);
  const verifyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (verifyTimeoutRef.current) {
        clearTimeout(verifyTimeoutRef.current);
      }
    };
  }, []);

  const validateFile = (f: File): string | null => {
    if (f.size > MAX_FILE_SIZE) {
      return `File is too large (${(f.size / 1024 / 1024).toFixed(2)}MB). Maximum size is 5MB.`;
    }
    if (!ALLOWED_MIME_TYPES.includes(f.type)) {
      return `Invalid file type. Allowed types: JPEG, PNG`;
    }
    return null;
  };

  const handleFileSelect = useCallback((f: File) => {
    const error = validateFile(f);
    if (error) {
      setUploadError(error);
      setFile(null);
      setPreview(null);
      return;
    }
    setUploadError(null);
    setFile(f);
    
    // Create preview from file immediately
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target?.result as string);
    };
    reader.readAsDataURL(f);
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    dragOverRef.current = true;
  };

  const handleDragLeave = () => {
    dragOverRef.current = false;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragOverRef.current = false;
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const pollFileStatus = async (uploadId: string, attempt: number = 0): Promise<void> => {
    const maxAttempts = 180; // 3 minutes with exponential backoff
    const baseDelay = 1000; // 1 second base delay
    const maxDelay = 10000; // 10 second max delay
    
    // Exponential backoff: 1s, 2s, 4s, 8s, 10s, 10s...
    const delay = Math.min(baseDelay * Math.pow(2, Math.floor(attempt / 10)), maxDelay);

    if (attempt >= maxAttempts) {
      throw new Error(
        'Upload verification timeout. Please refresh the page to check status.'
      );
    }

    try {
      const verifyResponse = await verifyUpload(uploadId);

      if (verifyResponse.success && verifyResponse.data) {
        const fileData = verifyResponse.data;
        if (fileData.status === 'READY') {
          setUploadStatus('success');
          onSuccess(fileData.id);
          return;
        } else if (fileData.status === 'REJECTED' || fileData.status === 'DELETED') {
          throw new Error(`Upload rejected: ${fileData.status}`);
        }
      }

      // Schedule next attempt with backoff
      verifyTimeoutRef.current = setTimeout(() => {
        pollFileStatus(uploadId, attempt + 1);
      }, delay);
    } catch (error: unknown) {
      // Retry on network errors, but surface other errors immediately
      if (attempt < maxAttempts) {
        verifyTimeoutRef.current = setTimeout(() => {
          pollFileStatus(uploadId, attempt + 1);
        }, delay);
      } else {
        throw error;
      }
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    if (!rightsConfirmed) {
      setUploadError('Please confirm you have permission to use this asset');
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      // Step 1: Get upload intent
      setUploadStatus('uploading-to-s3');
      const intentResponse = await getUploadIntent({
        kind,
        teamId: kind === 'TEAM_LOGO' ? teamId : undefined,
        filename: file.name,
        fileSizeBytes: file.size,
        declaredMimeType: file.type,
      });

      if (!intentResponse.success || !intentResponse.data) {
        throw new Error(intentResponse.error || 'Failed to get upload intent');
      }

      const { uploadId, presignedUrl, expiresAt: expiryTime } = intentResponse.data;
      setExpiresAt(expiryTime);

      // Step 2: Upload file directly to S3
      const formData = new FormData();
      formData.append('file', file);

      const uploadXhrResponse = await fetch(presignedUrl, {
        method: 'POST',
        body: formData,
      });

      if (!uploadXhrResponse.ok) {
        // Check if 403 (URL expired)
        if (uploadXhrResponse.status === 403) {
          throw new Error(
            'Upload URL expired. The upload session took too long. Please try again.'
          );
        }
        throw new Error(`S3 upload failed: ${uploadXhrResponse.statusText}`);
      }

      setUploadProgress(100);

      // Step 3: Calculate SHA256 and confirm upload
      setUploadStatus('confirming');
      const sha256Hash = await calculateSHA256(file);

      const confirmResponse = await confirmUpload({
        uploadId,
        sha256Hash,
        actualMimeType: file.type,
      });

      if (!confirmResponse.success || !confirmResponse.data) {
        throw new Error(confirmResponse.error || 'Failed to confirm upload');
      }

      // Step 4: Verify upload and poll for ready status
      setUploadStatus('verifying');
      await pollFileStatus(uploadId);
    } catch (error: unknown) {
      const errorMessage = isError(error) ? error.message : 'Upload failed';
      setUploadError(errorMessage);
      onError(errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  const handleClear = () => {
    setFile(null);
    setPreview(null);
    setUploadError(null);
    setUploadProgress(0);
    setUploadStatus('idle' as const);
    setRightsConfirmed(false);
    setExpiresAt(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getStatusMessage = () => {
    switch (uploadStatus) {
      case 'uploading-to-s3':
        return 'Uploading to S3...';
      case 'confirming':
        return 'Confirming upload...';
      case 'verifying':
        return 'Verifying file...';
      case 'success':
        return '✓ Logo ready';
      default:
        return null;
    }
  };

  const getExpiryWarning = () => {
    if (!expiresAt) return null;
    const expiryDate = new Date(expiresAt);
    const now = new Date();
    const minutesLeft = Math.floor((expiryDate.getTime() - now.getTime()) / 60000);
    
    if (minutesLeft <= 2) {
      return `⚠️ Upload URL expires in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}`;
    }
    return null;
  };

  if (uploadStatus === 'success') {
    return (
      <Card className="border-success bg-success/5 text-center">
        <p className="mb-4 text-lg font-semibold text-success">✓ Logo uploaded successfully</p>
        <p className="mb-4 text-sm text-text-muted">{file?.name}</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClear}
        >
          Upload another file
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card
        className={`border-2 border-dashed p-8 text-center transition-colors ${
          dragOverRef.current ? 'border-primary bg-primary/5' : 'border-border'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png"
          onChange={handleInputChange}
          disabled={isUploading || isLoading}
          className="hidden"
          aria-label="Upload file"
        />

        <div className="pointer-events-none space-y-2">
          <svg
            className="mx-auto h-12 w-12 text-text-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-label="Upload icon"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          <p className="text-sm font-medium text-text">
            {file ? file.name : 'Drag and drop your image here'}
          </p>
          <p className="text-xs text-text-muted">
            or click below to select (JPEG, PNG, max 5MB)
          </p>
        </div>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading || isLoading}
          className="mt-4"
        >
          Select File
        </Button>
      </Card>

      {/* File Info */}
      {file && (
        <Card className="bg-background p-3">
          <p className="text-xs text-text-muted">
            {file.name} ({(file.size / 1024).toFixed(2)} KB)
          </p>
        </Card>
      )}

      {/* File Preview */}
      {preview && !isUploading && uploadStatus === 'idle' && (
        <Card className="p-3">
          <p className="mb-2 text-xs font-medium text-text-muted">Preview</p>
          <img
            src={preview}
            alt="Preview"
            className="h-auto w-full max-w-xs rounded-lg border border-border"
          />
        </Card>
      )}

      {/* URL Expiry Warning */}
      {getExpiryWarning() && (
        <Card className="border-warning bg-warning/10 p-3">
          <p className="text-sm text-warning">{getExpiryWarning()}</p>
        </Card>
      )}

      {/* Upload Progress */}
      {isUploading && uploadProgress > 0 && (
        <Card className="p-4">
          <p className="mb-2 text-xs text-text-muted">{getStatusMessage()}</p>
          <div className="h-2 overflow-hidden rounded-full bg-border">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </Card>
      )}

      {/* Error Message */}
      {uploadError && (
        <Card className="border-error bg-error/10 p-3">
          <p className="text-sm text-error">{uploadError}</p>
        </Card>
      )}

      {/* Rights Confirmation */}
      {file && !isUploading && uploadStatus === 'idle' && (
        <div className="rounded-lg border border-border bg-background p-4">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={rightsConfirmed}
              onChange={(e) => setRightsConfirmed(e.target.checked)}
              className="mt-1"
              required
            />
            <span className="text-sm text-text">
              I confirm that I have permission to use this asset and it does not infringe on any
              copyrights or trademarks.
            </span>
          </label>
        </div>
      )}

      {/* Action Buttons */}
      {file && !isUploading && uploadStatus === 'idle' && (
        <div className="flex gap-3">
          <Button
            onClick={handleUpload}
            disabled={!rightsConfirmed || isLoading}
            className="flex-1"
          >
            Upload Logo
          </Button>
          <Button
            variant="ghost"
            onClick={handleClear}
            disabled={isLoading}
            className="flex-1"
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
