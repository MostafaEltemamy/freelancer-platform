import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import {
  mediaUploadIntentSchema,
  classifyMedia,
  createProjectMediaStorageKey,
  PROJECT_MEDIA_LIMITS,
} from '../src/modules/freelancer/project-media.policy.js';

const projectId = randomUUID();

function validImage() {
  return {
    projectId,
    originalFilename: 'brand-cover.jpg',
    mimeType: 'image/jpeg',
    fileSizeBytes: 2 * 1024 * 1024,
  };
}

test('accepts supported project images', () => {
  for (const [filename, mimeType] of [
    ['design.jpg', 'image/jpeg'],
    ['design.jpeg', 'image/jpeg'],
    ['design.png', 'image/png'],
    ['design.webp', 'image/webp'],
  ]) {
    const parsed = mediaUploadIntentSchema.safeParse({
      ...validImage(),
      originalFilename: filename,
      mimeType,
    });

    assert.equal(parsed.success, true);
  }
});

test('supports PDF attachments', () => {
  const parsed = mediaUploadIntentSchema.parse({
    projectId,
    originalFilename: 'case-study.pdf',
    mimeType: 'application/pdf',
    fileSizeBytes: 500_000,
  });

  assert.equal(
    classifyMedia(parsed.mimeType),
    'DOCUMENT',
  );
});

test('supports explicitly allowed video formats', () => {
  const parsed = mediaUploadIntentSchema.parse({
    projectId,
    originalFilename: 'project-demo.mp4',
    mimeType: 'video/mp4',
    fileSizeBytes: 5_000_000,
  });

  assert.equal(
    classifyMedia(parsed.mimeType),
    'VIDEO',
  );
});

test('rejects dangerous and unsupported formats', () => {
  for (const [filename, mimeType] of [
    ['drawing.svg', 'image/svg+xml'],
    ['page.html', 'text/html'],
    ['script.js', 'text/javascript'],
    ['program.exe', 'application/octet-stream'],
  ]) {
    assert.equal(
      mediaUploadIntentSchema.safeParse({
        ...validImage(),
        originalFilename: filename,
        mimeType,
      }).success,
      false,
    );
  }
});

test('rejects mismatched extensions and MIME types', () => {
  for (const [filename, mimeType] of [
    ['photo.jpg', 'application/pdf'],
    ['document.pdf', 'image/jpeg'],
    ['movie.mp4', 'image/png'],
  ]) {
    assert.equal(
      mediaUploadIntentSchema.safeParse({
        ...validImage(),
        originalFilename: filename,
        mimeType,
      }).success,
      false,
    );
  }
});

test('rejects files exceeding the limit for their type', () => {
  const image = {
    ...validImage(),
    fileSizeBytes:
      PROJECT_MEDIA_LIMITS.maxImageBytes + 1,
  };

  assert.equal(
    mediaUploadIntentSchema.safeParse(image).success,
    false,
  );

  const document = {
    projectId,
    originalFilename: 'report.pdf',
    mimeType: 'application/pdf',
    fileSizeBytes:
      PROJECT_MEDIA_LIMITS.maxDocumentBytes + 1,
  };

  assert.equal(
    mediaUploadIntentSchema.safeParse(document).success,
    false,
  );
});

test('rejects empty, negative and fractional file sizes', () => {
  for (const fileSizeBytes of [
    0,
    -10,
    1.5,
  ]) {
    assert.equal(
      mediaUploadIntentSchema.safeParse({
        ...validImage(),
        fileSizeBytes,
      }).success,
      false,
    );
  }
});

test('rejects filename path traversal', () => {
  for (const originalFilename of [
    '../photo.jpg',
    '..\\photo.jpg',
    'folder/photo.jpg',
    'folder\\photo.jpg',
  ]) {
    assert.equal(
      mediaUploadIntentSchema.safeParse({
        ...validImage(),
        originalFilename,
      }).success,
      false,
    );
  }
});

test('rejects client-controlled storage properties', () => {
  const result = mediaUploadIntentSchema.safeParse({
    ...validImage(),
    storageKey: 'other-user/private-file.jpg',
    status: 'READY',
    isCover: true,
  });

  assert.equal(result.success, false);
});

test('generates unique server-side storage keys', () => {
  const input = mediaUploadIntentSchema.parse(
    validImage(),
  );

  const first = createProjectMediaStorageKey(input);
  const second = createProjectMediaStorageKey(input);

  assert.notEqual(first, second);

  assert.match(
    first,
    new RegExp(
      `^projects/${projectId}/` +
      '[0-9a-f-]{36}\\.jpg$',
    ),
  );

  assert.ok(!first.includes('brand-cover'));
});
