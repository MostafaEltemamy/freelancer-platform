import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import sharp from 'sharp';
import {deleteStoredObject, MediaUploadInvalidError, presignImagePreview, writeImagePreview} from '../src/modules/freelancer/project-media.storage.js';

const ENABLED =
  process.env.MEDIA_E2E_TESTS === '1';

if (ENABLED) {
  const endpoint = new URL(
    process.env.S3_ENDPOINT ?? '',
  );

  if (
    process.env.NODE_ENV === 'production' ||
    process.env.S3_BUCKET !== 'freelancer-media-dev' ||
    endpoint.protocol !== 'https:' ||
    !endpoint.hostname.endsWith(
      '.r2.cloudflarestorage.com',
    )
  ) {
    throw new Error(
      'Conditional preview test requires the ' +
      'dedicated R2 development bucket.',
    );
  }
}

test(
  'R2 preview create-once and idempotent retry',
  { skip: !ENABLED },
  async () => {
    const projectId = randomUUID();
    const mediaId = randomUUID();

    const key =
      `projects/${projectId}/previews/${mediaId}.webp`;

    const original = await sharp({
      create: {
        width: 32,
        height: 32,
        channels: 3,
        background: '#2266aa',
      },
    }).webp().toBuffer();

    const different = await sharp({
      create: {
        width: 48,
        height: 48,
        channels: 3,
        background: '#aa4422',
      },
    }).webp().toBuffer();

    try {
      // First creation.
      await writeImagePreview(key, original);

      // Exact same bytes should verify successfully.
      await writeImagePreview(key, original);

      // Different bytes cannot overwrite the first.
      await assert.rejects(
        () => writeImagePreview(key, different),
        MediaUploadInvalidError,
      );

      // Confirm original bytes remain unchanged.
      const signedUrl = await presignImagePreview(
        key,
        60,
      );

      const response = await fetch(signedUrl);

      assert.equal(response.status, 200);

      const stored = Buffer.from(
        await response.arrayBuffer(),
      );

      assert.deepEqual(stored, original);
    } finally {
      // Remove only this test-generated object.
      await deleteStoredObject(key);
    }
  },
);
