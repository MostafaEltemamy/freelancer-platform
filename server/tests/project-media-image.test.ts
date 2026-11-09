import assert from 'node:assert/strict';
import { test } from 'node:test';

import sharp from 'sharp';

import {
  processProjectImage,
} from '../src/modules/freelancer/project-media.image.js';

import {
  MediaUploadInvalidError,
} from '../src/modules/freelancer/project-media.storage.js';

async function createTestImage(
  width: number,
  height: number,
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: '#336699',
    },
  })
    .png()
    .toBuffer();
}

test('accepts a valid PNG and generates WebP', async () => {
  const input = await createTestImage(320, 180);

  const result = await processProjectImage(
    input,
    'image/png',
  );

  assert.equal(result.mimeType, 'image/webp');
  assert.equal(result.width, 320);
  assert.equal(result.height, 180);

  const metadata = await sharp(result.buffer).metadata();

  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 320);
  assert.equal(metadata.height, 180);
});

test('resizes large images without stretching them', async () => {
  const input = await createTestImage(3000, 1000);

  const result = await processProjectImage(
    input,
    'image/png',
  );

  assert.equal(result.width, 1800);
  assert.equal(result.height, 600);
});

test('rejects mismatched image formats', async () => {
  const input = await createTestImage(100, 100);

  await assert.rejects(
    () => processProjectImage(input, 'image/jpeg'),
    MediaUploadInvalidError,
  );
});

test('rejects invalid image bytes', async () => {
  const input = Buffer.from(
    'This is not an image.',
    'utf8',
  );

  await assert.rejects(
    () => processProjectImage(input, 'image/png'),
    MediaUploadInvalidError,
  );
});

test('rejects excessive image dimensions', async () => {
  const input = await createTestImage(10001, 1);

  await assert.rejects(
    () => processProjectImage(input, 'image/png'),
    MediaUploadInvalidError,
  );
});

test('rejects SVG disguised as PNG', async () => {
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" ' +
    'width="20" height="20"></svg>',
  );

  await assert.rejects(
    () => processProjectImage(svg, 'image/png'),
    MediaUploadInvalidError,
  );
});
