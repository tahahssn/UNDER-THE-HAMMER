import { BadRequestException } from '@nestjs/common';

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
   * Validate image dimensions from buffer
   * Returns { width, height }
   */
  static extractImageDimensions(buffer: Buffer): { width: number; height: number } {
    const magicBytes = buffer.slice(0, 12);

    // PNG: width and height at bytes 16-24 (big-endian)
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    if (magicBytes.slice(0, 4).equals(pngSignature)) {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      return { width, height };
    }

    // JPEG: more complex; for now, return 0x0 (defer to actual library)
    // In production, use sharp or jimp library
    const jpegSignature = Buffer.from([0xff, 0xd8, 0xff]);
    if (magicBytes.slice(0, 3).equals(jpegSignature)) {
      // Return placeholder; actual dimension extraction requires JPEG parsing
      return { width: 0, height: 0 };
    }

    return { width: 0, height: 0 };
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
}
