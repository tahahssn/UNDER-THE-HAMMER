import { BadRequestException } from '@nestjs/common';
import * as sharp from 'sharp';

/**
 * Validates file signatures (magic bytes) and dimensions
 */
export class FileSignatureValidator {
  /**
   * Validate file by magic bytes
   */
  static validateFileSignature(buffer: Buffer, declaredMimeType: string): boolean {
    const magicBytes = buffer.slice(0, 12);

    // PNG: 89 50 4E 47
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    if (magicBytes.slice(0, 4).equals(pngSignature)) {
      if (declaredMimeType === 'image/png') {
        return true;
      }
      throw new BadRequestException('File is PNG but declared MIME type is not image/png');
    }

    // JPEG: FF D8 FF
    const jpegSignature = Buffer.from([0xff, 0xd8, 0xff]);
    if (magicBytes.slice(0, 3).equals(jpegSignature)) {
      if (declaredMimeType === 'image/jpeg' || declaredMimeType === 'image/jpg') {
        return true;
      }
      throw new BadRequestException('File is JPEG but declared MIME type is not image/jpeg');
    }

    throw new BadRequestException(`Unsupported file type. Magic bytes: ${magicBytes.toString('hex')}`);
  }

  /**
   * Validate image dimensions from buffer using sharp library
   * Returns { width, height }
   */
  static async extractImageDimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
    try {
      const metadata = await sharp(buffer).metadata();
      
      if (!metadata.width || !metadata.height) {
        throw new BadRequestException('Could not extract image dimensions');
      }

      return {
        width: metadata.width,
        height: metadata.height,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to extract image dimensions: ${(error as Error).message}`);
    }
  }

  /**
   * Validate dimensions are within bounds
   */
  static validateDimensions(width: number, height: number, minSize: number = 100, maxSize: number = 2000) {
    if (width < minSize || height < minSize) {
      throw new BadRequestException(`Image dimensions must be at least ${minSize}x${minSize}`);
    }

    if (width > maxSize || height > maxSize) {
      throw new BadRequestException(`Image dimensions must not exceed ${maxSize}x${maxSize}`);
    }
  }

  /**
   * Re-encode image for consistency: normalize format, strip metadata, apply quality compression
   * Returns Buffer of optimized image
   */
  static async reencodeImage(buffer: Buffer): Promise<Buffer> {
    try {
      // Auto-rotate based on EXIF, strip metadata, convert to standardized format
      const reencoded = await sharp(buffer)
        .rotate() // Auto-rotate based on EXIF orientation
        .withMetadata(false) // Strip all metadata
        .jpeg({ quality: 85, progressive: true }) // Compress JPEG
        .toBuffer();

      return reencoded;
    } catch (error) {
      throw new BadRequestException(`Failed to re-encode image: ${(error as Error).message}`);
    }
  }
}
