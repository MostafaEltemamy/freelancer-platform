import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  auditProjectMediaStorage,
  classifyMediaObject,
} from '../src/modules/freelancer/media-orphan-audit.js';

import type {
  MediaAuditPage,
  MediaAuditReaders,
} from '../src/modules/freelancer/media-orphan-audit.js';

const NOW = new Date('2026-11-09T10:00:00.000Z');

const PROJECT_ID =
  '11111111-1111-4111-8111-111111111111';

function objectKey(id: string): string {
  return `projects/${PROJECT_ID}/${id}.png`;
}

const KEYS = {
  referenced: objectKey(
    '22222222-2222-4222-8222-222222222222',
  ),
  queued: objectKey(
    '33333333-3333-4333-8333-333333333333',
  ),
  both: objectKey(
    '44444444-4444-4444-8444-444444444444',
  ),
  recent: objectKey(
    '55555555-5555-4555-8555-555555555555',
  ),
  old: objectKey(
    '66666666-6666-4666-8666-666666666666',
  ),
  unknownAge: objectKey(
    '77777777-7777-4777-8777-777777777777',
  ),
};

const OLD = new Date(
  NOW.getTime() - 48 * 60 * 60_000,
);

const RECENT = new Date(
  NOW.getTime() - 60 * 60_000,
);

function readersFor(
  pages: MediaAuditPage[],
  references: {
    activeKeys?: string[];
    queuedKeys?: string[];
  } = {},
): MediaAuditReaders {
  let nextPage = 0;

  return {
    async listPage() {
      const page = pages[nextPage];

      if (!page) {
        throw new Error('Unexpected extra page request.');
      }

      nextPage += 1;
      return page;
    },

    async findReferences(keys) {
      const requested = new Set(keys);

      return {
        activeKeys:
          (references.activeKeys ?? []).filter(
            (key) => requested.has(key),
          ),

        queuedKeys:
          (references.queuedKeys ?? []).filter(
            (key) => requested.has(key),
          ),
      };
    },
  };
}

test('protects active and queued storage objects', () => {
  const record = {
    key: KEYS.referenced,
    lastModified: OLD,
    size: 100,
  };

  assert.equal(
    classifyMediaObject(
      record,
      { active: true, queued: false },
      NOW,
    ),
    'referenced',
  );

  assert.equal(
    classifyMediaObject(
      record,
      { active: false, queued: true },
      NOW,
    ),
    'queuedForDeletion',
  );

  assert.equal(
    classifyMediaObject(
      record,
      { active: true, queued: true },
      NOW,
    ),
    'referencedAndQueued',
  );
});

test('distinguishes recent and aged unreferenced objects', () => {
  assert.equal(
    classifyMediaObject(
      {
        key: KEYS.recent,
        lastModified: RECENT,
      },
      { active: false, queued: false },
      NOW,
    ),
    'recentUnreferenced',
  );

  assert.equal(
    classifyMediaObject(
      {
        key: KEYS.old,
        lastModified: OLD,
      },
      { active: false, queued: false },
      NOW,
    ),
    'agedUnreferenced',
  );
});

test('does not guess the age of malformed objects', () => {
  assert.equal(
    classifyMediaObject(
      {
        key: KEYS.unknownAge,
      },
      { active: false, queued: false },
      NOW,
    ),
    'unknownAge',
  );

  assert.equal(
    classifyMediaObject(
      {
        key: 'projects/unknown-file.txt',
        lastModified: OLD,
      },
      { active: false, queued: false },
      NOW,
    ),
    'unexpectedKey',
  );
});

test('audits multiple pages and aggregates all classifications', async () => {
  const readers = readersFor(
    [
      {
        objects: [
          {
            key: KEYS.referenced,
            lastModified: OLD,
            size: 100,
          },
          {
            key: KEYS.queued,
            lastModified: OLD,
            size: 200,
          },
          {
            key: KEYS.both,
            lastModified: OLD,
            size: 300,
          },
          {
            key: KEYS.recent,
            lastModified: RECENT,
            size: 400,
          },
        ],
        isTruncated: true,
        nextCursor: 'page-2',
      },
      {
        objects: [
          {
            key: KEYS.old,
            lastModified: OLD,
            size: 500,
          },
          {
            key: KEYS.unknownAge,
            size: 600,
          },
          {
            key: 'projects/unrecognized.txt',
            lastModified: OLD,
          },
        ],
        isTruncated: false,
      },
    ],
    {
      activeKeys: [
        KEYS.referenced,
        KEYS.both,
      ],
      queuedKeys: [
        KEYS.queued,
        KEYS.both,
      ],
    },
  );

  const report = await auditProjectMediaStorage(
    readers,
    {
      now: NOW,
      pageSize: 4,
      maxPages: 3,
    },
  );

  assert.equal(report.complete, true);
  assert.equal(report.pagesScanned, 2);
  assert.equal(report.objectsScanned, 7);
  assert.equal(report.objectsWithoutSize, 1);

  assert.equal(
    report.categories.referenced.objects,
    1,
  );

  assert.equal(
    report.categories.queuedForDeletion.objects,
    1,
  );

  assert.equal(
    report.categories.referencedAndQueued.objects,
    1,
  );

  assert.equal(
    report.categories.recentUnreferenced.objects,
    1,
  );

  assert.equal(
    report.categories.agedUnreferenced.objects,
    1,
  );

  assert.equal(
    report.categories.agedUnreferenced.bytes,
    500,
  );

  assert.equal(
    report.categories.unknownAge.objects,
    1,
  );

  assert.equal(
    report.categories.unexpectedKey.objects,
    1,
  );
});

test('marks an inventory as incomplete when page limit is reached', async () => {
  const report = await auditProjectMediaStorage(
    readersFor([
      {
        objects: [{
          key: KEYS.old,
          lastModified: OLD,
          size: 100,
        }],
        isTruncated: true,
        nextCursor: 'next-page',
      },
    ]),
    {
      now: NOW,
      pageSize: 1,
      maxPages: 1,
    },
  );

  assert.equal(report.complete, false);
  assert.equal(report.pagesScanned, 1);
  assert.equal(report.objectsScanned, 1);
});

test('rejects truncated pages without a valid next cursor', async () => {
  await assert.rejects(
    () => auditProjectMediaStorage(
      readersFor([
        {
          objects: [],
          isTruncated: true,
        },
      ]),
      { now: NOW },
    ),
    /pagination token/,
  );
});

test('rejects unsafe pagination configuration', async () => {
  const readers = readersFor([]);

  await assert.rejects(
    () => auditProjectMediaStorage(
      readers,
      { pageSize: 1001 },
    ),
    RangeError,
  );

  await assert.rejects(
    () => auditProjectMediaStorage(
      readers,
      { maxPages: 0 },
    ),
    RangeError,
  );
});
