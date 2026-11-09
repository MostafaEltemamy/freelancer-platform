import {
  presignImagePreview,
} from './project-media.storage.js';

const PUBLIC_PREVIEW_TTL_SECONDS = 60;

export interface PublicMediaSource {
  previewKey: string | null;
  altText: string | null;
  caption: string | null;
  width: number | null;
  height: number | null;
}

export interface PublicProjectImage {
  url: string;
  altText: string | null;
  caption: string | null;
  width: number | null;
  height: number | null;
}

/**
 * Only call this after the parent query has verified:
 *
 * 1. The freelancer profile is published and completed.
 * 2. The project is PUBLIC.
 * 3. The image is READY and its kind is IMAGE.
 * 4. The previewKey is present.
 *
 * Never expose original filenames, storageKey,
 * previewKey as a separate response field, or
 * internal media IDs.
 */
export async function presentPublicImage(
  source: PublicMediaSource,
): Promise<PublicProjectImage | null> {
  if (!source.previewKey) {
    return null;
  }

  const url = await presignImagePreview(
    source.previewKey,
    PUBLIC_PREVIEW_TTL_SECONDS,
  );

  return {
    url,
    altText: source.altText,
    caption: source.caption,
    width: source.width,
    height: source.height,
  };
}

/**
 * Preserve the gallery's saved order.
 */
export async function presentPublicGallery(
  sources: readonly PublicMediaSource[],
): Promise<PublicProjectImage[]> {
  const results = await Promise.all(
    sources.map(presentPublicImage),
  );

  return results.filter(
    (image): image is PublicProjectImage =>
      image !== null,
  );
}
