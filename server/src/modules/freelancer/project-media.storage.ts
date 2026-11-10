import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {PROJECT_MEDIA_LIMITS} from './project-media.policy.js';
import {createHash} from 'node:crypto';
import {StorageOperationDeadlineError, withAbortDeadline} from './media-storage.deadline.js';

// ---------------------------------------------------------
// Configuration
// ---------------------------------------------------------

const UPLOAD_EXPIRY_SECONDS = 120;
const PREVIEW_EXPIRY_SECONDS = 300;

let storageClient: S3Client | undefined;

// ---------------------------------------------------------
// Custom errors
// ---------------------------------------------------------

export class MediaStorageError extends Error {
  constructor(
    message = 'Media storage is temporarily unavailable.',
  ) {
    super(message);
    this.name = 'MediaStorageError';
  }
}

export class MediaStorageTimeoutError
  extends MediaStorageError {
  constructor() {
    super('Image storage did not respond in time.');
    this.name = 'MediaStorageTimeoutError';
  }
}

const MEDIA_READ_DEADLINE_MS = 60_000;
const PREVIEW_WRITE_DEADLINE_MS = 20_000;
const PREVIEW_VERIFY_DEADLINE_MS = 8_000;

async function boundedStorage<T>(
  durationMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  try {
    return await withAbortDeadline(
      durationMs,
      operation,
    );
  } catch (error) {
    if (
      error instanceof StorageOperationDeadlineError
    ) {
      throw new MediaStorageTimeoutError();
    }

    throw error;
  }
}

export class MediaUploadMissingError extends Error {
  constructor() {
    super('The image upload has not completed yet.');
    this.name = 'MediaUploadMissingError';
  }
}

export class MediaUploadInvalidError extends Error {
  constructor(
    message = 'The uploaded image is invalid.',
  ) {
    super(message);
    this.name = 'MediaUploadInvalidError';
  }
}

// ---------------------------------------------------------
// Storage configuration
// ---------------------------------------------------------

function bucket(): string {
  const value = process.env.S3_BUCKET?.trim();

  if (!value) {
    throw new MediaStorageError(
      'Media storage is not configured.',
    );
  }

  return value;
}

function client(): S3Client {
  if (storageClient) {
    return storageClient;
  }

  const region = process.env.S3_REGION?.trim();

  if (!region) {
    throw new MediaStorageError(
      'Media storage region is not configured.',
    );
  }

  const endpoint = process.env.S3_ENDPOINT?.trim();

  // Validate custom storage endpoints.
  if (endpoint) {
    let url: URL;

    try {
      url = new URL(endpoint);
    } catch {
      throw new MediaStorageError(
        'Invalid media storage endpoint.',
      );
    }

    if (
      !['http:', 'https:'].includes(url.protocol)
    ) {
      throw new MediaStorageError(
        'Invalid media storage endpoint protocol.',
      );
    }

    if (
      process.env.NODE_ENV === 'production' &&
      url.protocol !== 'https:'
    ) {
      throw new MediaStorageError(
        'Production storage requires HTTPS.',
      );
    }
  }

  const accessKeyId =
    process.env.S3_ACCESS_KEY_ID?.trim();

  const secretAccessKey =
    process.env.S3_SECRET_ACCESS_KEY?.trim();

  if (
    Boolean(accessKeyId) !==
    Boolean(secretAccessKey)
  ) {
    throw new MediaStorageError(
      'Incomplete storage credentials.',
    );
  }

  storageClient = new S3Client({
    region,

    ...(endpoint
      ? { endpoint }
      : {}),

    forcePathStyle:
      process.env.S3_FORCE_PATH_STYLE === 'true',

    ...(accessKeyId && secretAccessKey
      ? {
          credentials: {
            accessKeyId,
            secretAccessKey,
          },
        }
      : {}),
  });

  return storageClient;
}

// ---------------------------------------------------------
// Generate signed upload URL
// ---------------------------------------------------------

/**
 * Generates a short-lived URL permitting one PUT request
 * to a server-generated object key.
 *
 * The request must use the specified Content-Type.
 *
 * The bucket must remain private.
 */
export async function presignImageUpload(
  key: string,
  contentType: string,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: bucket(),
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(
    client(),
    command,
    {
      expiresIn: UPLOAD_EXPIRY_SECONDS,

      signableHeaders: new Set([
        'content-type',
      ]),
    },
  );
}

export function uploadExpirySeconds(): number {
  return UPLOAD_EXPIRY_SECONDS;
}

/**
 * Create a temporary GET URL for a sanitized preview.
 *
 * Owner workspace: default 300 seconds.
 * Public portfolio: explicitly request 60 seconds.
 *
 * The caller must authorize access before invoking this.
 */
export async function presignImagePreview(
  previewKey: string,
  expiresInSeconds = PREVIEW_EXPIRY_SECONDS,
): Promise<string> {
  if (
    !Number.isInteger(expiresInSeconds) ||
    expiresInSeconds < 1 ||
    expiresInSeconds > PREVIEW_EXPIRY_SECONDS
  ) {
    throw new MediaStorageError(
      'Invalid image preview expiration.',
    );
  }

  return getSignedUrl(
    client(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: previewKey,
    }),
    {
      expiresIn: expiresInSeconds,
    },
  );
}

// ---------------------------------------------------------
// Read uploaded image with bounded streaming
// ---------------------------------------------------------

/**
 * Read an uploaded image from private storage.
 *
 * Security protections:
 *
 * 1. Verify the object's declared size and MIME type.
 * 2. Bind GET to the HEAD result using ETag when available.
 * 3. Stream the object instead of loading it blindly.
 * 4. Enforce a byte limit while streaming.
 * 5. Reject incomplete or changed uploads.
 *
 * Actual image format verification is performed
 * separately by project-media.image.ts using Sharp.
 */
async function readUploadedImageWithSignal(
  key: string,
  expectedSize: number,
  expectedMimeType: string,
  signal: AbortSignal,
): Promise<Buffer> {

  // -------------------------------------------------------
  // A. Validate the expected file size
  // -------------------------------------------------------

  if (
    !Number.isSafeInteger(expectedSize) ||
    expectedSize <= 0 ||
    expectedSize >
      PROJECT_MEDIA_LIMITS.maxImageBytes
  ) {
    throw new MediaUploadInvalidError(
      'The uploaded image exceeds its permitted size.',
    );
  }

  const s3 = client();
  const bucketName = bucket();

  // -------------------------------------------------------
  // B. Inspect the object's metadata using HEAD
  // -------------------------------------------------------

  let head;

  try {
    head = await s3.send(
      new HeadObjectCommand({
        Bucket: bucketName,
        Key: key,
      }),
      {
        abortSignal: signal,
      },
    );

  } catch (error) {
    if (
      error instanceof Error &&
      [
        'NotFound',
        'NoSuchKey',
        'NotFoundException',
      ].includes(error.name)
    ) {
      throw new MediaUploadMissingError();
    }

    throw error;
  }

  // Reject unexpected metadata before downloading.
  if (
    head.ContentLength !== expectedSize ||
    head.ContentType !== expectedMimeType
  ) {
    throw new MediaUploadInvalidError(
      'The uploaded file does not match the selected image.',
    );
  }

  // -------------------------------------------------------
  // C. Download the exact object verified by HEAD
  // -------------------------------------------------------

  let result;

  try {
    result = await s3.send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: key,

        ...(head.ETag
          ? { IfMatch: head.ETag }
          : {}),
      }),
      {
        abortSignal: signal,
      },
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === 'PreconditionFailed'
    ) {
      throw new MediaUploadInvalidError(
        'The uploaded file changed during verification.',
      );
    }

    throw error;
  }

  // -------------------------------------------------------
  // D. Verify GET response metadata
  // -------------------------------------------------------

  if (!result.Body) {
    throw new MediaUploadMissingError();
  }

  if (
    result.ContentLength !== expectedSize ||
    result.ContentType !== expectedMimeType
  ) {
    throw new MediaUploadInvalidError(
      'The uploaded file changed during verification.',
    );
  }

  // -------------------------------------------------------
  // E. Convert AWS SDK response to a Web ReadableStream
  // -------------------------------------------------------

  /**
   * AWS SDK v3 uses StreamingBlobPayloadOutputTypes.
   *
   * The type may represent a Node.js or Web stream,
   * so we cannot safely use:
   *
   *   for await (const chunk of result.Body)
   *
   * transformToWebStream() provides a supported
   * stream interface with getReader().
   */
  const stream = result.Body.transformToWebStream();
  const reader = stream.getReader();
  const cancelOnAbort = () => {
    void reader.cancel().catch(() => {
      // Best-effort stream cancellation.
    });
  };

  signal.addEventListener(
    'abort',
    cancelOnAbort,
    { once: true },
  );

  const chunks: Buffer[] = [];

  let total = 0;
  let streamCompleted = false;

  // -------------------------------------------------------
  // F. Read chunks while enforcing byte limits
  // -------------------------------------------------------

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        streamCompleted = true;
        break;
      }

      // Each chunk should contain binary data.
      if (!(value instanceof Uint8Array)) {
        throw new MediaUploadInvalidError(
          'Invalid image data received from storage.',
        );
      }

      const part = Buffer.from(value);

      total += part.length;

      // Stop reading immediately if the stored object
      // exceeds either the declared or allowed size.
      if (
        total > expectedSize ||
        total >
          PROJECT_MEDIA_LIMITS.maxImageBytes
      ) {
        throw new MediaUploadInvalidError(
          'The uploaded image exceeds its permitted size.',
        );
      }

      chunks.push(part);
    }
  } finally {
    // Cancel the stream if reading stopped because
    // of an error or an exceeded limit.
    signal.removeEventListener('abort', cancelOnAbort);
    if (!streamCompleted) {
      try {
        await reader.cancel();
      } catch {
        // Preserve the original validation error.
      }
    }

    reader.releaseLock();
  }

  // -------------------------------------------------------
  // G. Check the total downloaded size
  // -------------------------------------------------------

  if (total !== expectedSize) {
    throw new MediaUploadInvalidError(
      'The uploaded image is incomplete.',
    );
  }

  // -------------------------------------------------------
  // H. Return the complete bounded Buffer
  // -------------------------------------------------------

  return Buffer.concat(chunks, total);
}

export function readUploadedImage(
  key: string,
  expectedSize: number,
  expectedMimeType: string,
): Promise<Buffer> {
  return boundedStorage(
    MEDIA_READ_DEADLINE_MS,
    (signal) =>
      readUploadedImageWithSignal(
        key,
        expectedSize,
        expectedMimeType,
        signal,
      ),
  );
}

// ---------------------------------------------------------
// Write verified image preview
// ---------------------------------------------------------

/**
 * Store a sanitized WebP preview once.
 *
 * If an earlier attempt committed but its response was
 * lost, HEAD verifies the same SHA-256 digest before
 * accepting that existing object as successful.
 *
 * A different object must never be overwritten.
 */
export async function writeImagePreview(
  key: string,
  buffer: Buffer,
): Promise<void> {
  if (
    buffer.length === 0 ||
    buffer.length > PROJECT_MEDIA_LIMITS.maxImageBytes
  ) {
    throw new MediaUploadInvalidError(
      'Invalid processed image preview.',
    );
  }

  const sha256 = createHash('sha256')
    .update(buffer)
    .digest('hex');

  try {
    await boundedStorage(
      PREVIEW_WRITE_DEADLINE_MS,
      async (signal) => {
        await client().send(
          new PutObjectCommand({
            Bucket: bucket(),
            Key: key,
            Body: buffer,
            ContentType: 'image/webp',
            CacheControl: 'private, no-store',

            // Atomic create-once protection.
            IfNoneMatch: '*',

            // Allows verification after an ambiguous
            // previous response.
            Metadata: {
              sha256,
            },
          }),
          {
            abortSignal: signal,
          },
        );
      },
    );

    return;
  } catch (error) {
    const failure = error as {
      $metadata?: {
        httpStatusCode?: number;
      };
    };

    if (
      failure?.$metadata?.httpStatusCode !== 412
    ) {
      throw error;
    }
  }

  // HTTP 412 means an object already occupies the key.
  // It might be the exact same preview committed by an
  // earlier attempt whose response was lost.
  //
  // Verify it; never blindly accept an existing object.
  let existing;

  try {
    existing = await boundedStorage(
      PREVIEW_VERIFY_DEADLINE_MS,
      (signal) =>
        client().send(
          new HeadObjectCommand({
            Bucket: bucket(),
            Key: key,
          }),
          {
            abortSignal: signal,
          },
        ),
    );
  } catch (error) {
    if (error instanceof MediaStorageTimeoutError) {
      throw error;
    }

    throw new MediaStorageError(
      'Unable to verify an existing image preview.',
    );
  }

  if (
    existing.ContentType === 'image/webp' &&
    existing.ContentLength === buffer.length &&
    existing.Metadata?.sha256 === sha256
  ) {
    return;
  }

  throw new MediaUploadInvalidError(
    'This preview conflicts with a previous upload. ' +
    'Remove the image and upload it again.',
  );
}

// ---------------------------------------------------------
// Delete object from private storage
// ---------------------------------------------------------

/**
 * Delete an object by its server-generated storage key.
 *
 * This will be used by:
 * - Image removal
 * - Failed upload cleanup
 * - Abandoned upload reconciliation
 * - Project deletion cleanup
 *
 * Deleting a missing S3 object is normally idempotent.
 */
export async function deleteStoredObject(
  key: string,
): Promise<void> {
  await client().send(
    new DeleteObjectCommand({
      Bucket: bucket(),
      Key: key,
    }),
  );
}
