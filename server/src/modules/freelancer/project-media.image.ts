import sharp from 'sharp';

import {
  MediaUploadInvalidError,
} from './project-media.storage.js';

/**
 * Resource limits for untrusted images.
 *
 * Keep these below sharp's general defaults so
 * a single upload cannot consume excessive memory.
 */
const MAX_INPUT_PIXELS = 20_000_000;
const MAX_DIMENSION = 10_000;
const MAX_PREVIEW_DIMENSION = 1_800;

const EXPECTED_FORMATS: Record<string, string> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export interface ProcessedProjectImage {
  buffer: Buffer;
  width: number;
  height: number;
  mimeType: 'image/webp';
}

/**
 * Independently validates uploaded image bytes,
 * decodes the image, corrects orientation, resizes,
 * and re-encodes it without original metadata.
 *
 * No SVG, GIF, PDF or animated WebP are accepted.
 */
export async function processProjectImage(
  input: Buffer,
  declaredMimeType: string,
): Promise<ProcessedProjectImage> {
  const expectedFormat =
    EXPECTED_FORMATS[declaredMimeType];

  if (!expectedFormat || input.length === 0) {
    throw new MediaUploadInvalidError(
      'Please select a supported image format.',
    );
  }

  try {
    const image = sharp(input, {
      limitInputPixels: MAX_INPUT_PIXELS,
      failOn: 'error',
      animated: false,
    });

    const metadata = await image.metadata();

    if (metadata.format !== expectedFormat) {
      throw new MediaUploadInvalidError(
        'The image format does not match the selected file.',
      );
    }

    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width > MAX_DIMENSION ||
      metadata.height > MAX_DIMENSION ||
      metadata.width * metadata.height >
        MAX_INPUT_PIXELS
    ) {
      throw new MediaUploadInvalidError(
        'The image dimensions are not supported.',
      );
    }

    if ((metadata.pages ?? 1) > 1) {
      throw new MediaUploadInvalidError(
        'Animated images are not supported.',
      );
    }

    // Re-encoding removes metadata from the original
    // image, including GPS and other EXIF information.
    const output = await sharp(input, {
      limitInputPixels: MAX_INPUT_PIXELS,
      failOn: 'error',
      animated: false,
    })
      .rotate()
      .resize({
        width: MAX_PREVIEW_DIMENSION,
        height: MAX_PREVIEW_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({
        quality: 82,
        effort: 4,
      })
      .toBuffer({ resolveWithObject: true });

    if (
      output.info.width <= 0 ||
      output.info.height <= 0
    ) {
      throw new MediaUploadInvalidError();
    }

    return {
      buffer: output.data,
      width: output.info.width,
      height: output.info.height,
      mimeType: 'image/webp',
    };
  } catch (error) {
    if (error instanceof MediaUploadInvalidError) {
      throw error;
    }

    throw new MediaUploadInvalidError(
      'We could not process this image. ' +
      'Please try another JPEG, PNG or WebP file.',
    );
  }
}
