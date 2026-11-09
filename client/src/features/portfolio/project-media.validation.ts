const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

const ALLOWED_FORMATS: Record<string, readonly string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
};

/**
 * Fast user-friendly checks before reserving an upload.
 *
 * The backend independently performs its own validation.
 */
export function validateProjectImage(
  file: Pick<File, 'name' | 'size' | 'type'>,
): string | null {
  const extensions = ALLOWED_FORMATS[file.type];

  if (!extensions) {
    return 'Choose a JPEG, PNG or WebP image.';
  }

  const extension = file.name
    .split('.')
    .at(-1)
    ?.toLowerCase();

  if (!extension || !extensions.includes(extension)) {
    return (
      'The filename does not match the image format. ' +
      'Choose another file.'
    );
  }

  if (
    !Number.isSafeInteger(file.size) ||
    file.size <= 0
  ) {
    return 'The selected image is empty or invalid.';
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return 'Images must be 12 MB or smaller.';
  }

  return null;
}