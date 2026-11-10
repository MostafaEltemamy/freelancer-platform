import assert from 'node:assert/strict';
import { test } from 'node:test';
import {auditMediaReferences} from '../src/modules/freelancer/media-reference-audit.js';

import type {
  MediaReference,
  MediaReferenceReaders,
  ObjectHead,
} from '../src/modules/freelancer/media-reference-audit.js';

const PROJECT =
  '11111111-1111-4111-8111-111111111111';

const NOW = new Date('2026-11-09T12:00:00.000Z');

function image(
  number: number,
): MediaReference {
  const id =
    `00000000-0000-4000-8000-` +
    number.toString().padStart(12, '0');

  return {
    id,
    version: 2,
    status: 'READY',
    kind: 'IMAGE',
    storageKey: `projects/${PROJECT}/${id}.png`,
    previewKey:
      `projects/${PROJECT}/previews/${id}.webp`,
    fileSizeBytes: 100,
    mimeType: 'image/png',
  };
}

const validOriginal: ObjectHead = {
  exists: true,
  bytes: 100,
  mimeType: 'image/png',
};

const validPreview: ObjectHead = {
  exists: true,
  bytes: 80,
  mimeType: 'image/webp',
};

function mockReaders(
  records: MediaReference[],
  options: {
    heads?: Map<string, ObjectHead>;
    changedIds?: Set<string>;
    headFailure?: boolean;
  } = {},
): MediaReferenceReaders {
  const ordered = [...records].sort(
    (a, b) => a.id.localeCompare(b.id),
  );

  const heads = options.heads ?? new Map();

  return {
    async listPage({ afterId, pageSize }) {
      const remaining = ordered.filter(
        (item) => !afterId || item.id > afterId,
      );

      return {
        items: remaining.slice(0, pageSize),
        hasMore: remaining.length > pageSize,
      };
    },

    async headObject(key) {
      if (options.headFailure) {
        throw new Error('StorageUnavailable');
      }

      const result = heads.get(key);

      if (result) {
        return result;
      }

      return key.includes('/previews/')
        ? validPreview
        : validOriginal;
    },

    async unchanged(record) {
      return !options.changedIds?.has(record.id);
    },
  };
}

test('accepts a complete verified image', async () => {
  const report = await auditMediaReferences(
    mockReaders([image(1)]),
    { now: NOW },
  );

  assert.equal(report.complete, true);
  assert.equal(report.recordsScanned, 1);
  assert.equal(report.headRequests, 2);

  assert.equal(report.ready.healthyRecords, 1);
  assert.equal(report.ready.brokenRecords, 0);
});

test('detects a missing original and preview', async () => {
  const record = image(1);

  const heads = new Map<string, ObjectHead>([
    [record.storageKey, { exists: false }],
    [record.previewKey!, { exists: false }],
  ]);

  const report = await auditMediaReferences(
    mockReaders([record], { heads }),
  );

  assert.equal(report.ready.brokenRecords, 1);
  assert.equal(report.ready.missingOriginal, 1);
  assert.equal(report.ready.missingPreviewObject, 1);
});

test('detects READY images missing preview keys', async () => {
  const record = {
    ...image(1),
    previewKey: null,
  };

  const report = await auditMediaReferences(
    mockReaders([record]),
  );

  assert.equal(report.ready.missingPreviewKey, 1);
  assert.equal(report.ready.brokenRecords, 1);
  assert.equal(report.headRequests, 1);
});

test('detects invalid original and preview metadata', async () => {
  const record = image(1);

  const heads = new Map<string, ObjectHead>([
    [
      record.storageKey,
      {
        exists: true,
        bytes: 95,
        mimeType: 'image/png',
      },
    ],
    [
      record.previewKey!,
      {
        exists: true,
        bytes: 0,
        mimeType: 'image/jpeg',
      },
    ],
  ]);

  const report = await auditMediaReferences(
    mockReaders([record], { heads }),
  );

  assert.equal(
    report.ready.originalMetadataMismatch,
    1,
  );

  assert.equal(
    report.ready.invalidPreviewMetadata,
    1,
  );

  assert.equal(report.ready.brokenRecords, 1);
});

test('does not mark unfinished uploads as broken', async () => {
  const pending = {
    ...image(1),
    status: 'PENDING' as const,
  };

  const failed = {
    ...image(2),
    status: 'FAILED' as const,
  };

  const report = await auditMediaReferences(
    mockReaders([pending, failed], {
      headFailure: true,
    }),
  );

  assert.equal(report.pendingRecords, 1);
  assert.equal(report.failedRecords, 1);
  assert.equal(report.headRequests, 0);
  assert.equal(report.ready.brokenRecords, 0);
});

test('skips findings from records changed during checking', async () => {
  const record = image(1);

  const heads = new Map<string, ObjectHead>([
    [record.storageKey, { exists: false }],
  ]);

  const report = await auditMediaReferences(
    mockReaders([record], {
      heads,
      changedIds: new Set([record.id]),
    }),
  );

  assert.equal(
    report.changedDuringVerification,
    1,
  );

  assert.equal(report.ready.brokenRecords, 0);
  assert.equal(report.ready.records, 0);
});

test('marks a bounded partial scan as incomplete', async () => {
  const report = await auditMediaReferences(
    mockReaders([image(1), image(2)]),
    {
      pageSize: 1,
      maxPages: 1,
    },
  );

  assert.equal(report.complete, false);
  assert.equal(report.pagesScanned, 1);
  assert.equal(report.recordsScanned, 1);
});

test('fails closed when storage is unavailable', async () => {
  await assert.rejects(
    () => auditMediaReferences(
      mockReaders([image(1)], {
        headFailure: true,
      }),
    ),
    /StorageUnavailable/,
  );
});

test('rejects invalid pagination settings', async () => {
  await assert.rejects(
    () => auditMediaReferences(
      mockReaders([]),
      { pageSize: 0 },
    ),
    RangeError,
  );

  await assert.rejects(
    () => auditMediaReferences(
      mockReaders([]),
      { maxPages: 0 },
    ),
    RangeError,
  );
});