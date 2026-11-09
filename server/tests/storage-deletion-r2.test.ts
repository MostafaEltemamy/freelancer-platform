import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { setTimeout as pause } from 'node:timers/promises';

import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import { prisma } from '../src/database/prisma.js';

import {
  processStorageDeletionBatch,
} from '../src/modules/freelancer/storage-deletion.queue.js';

// ---------------------------------------------------------
// Strict safety requirements
// ---------------------------------------------------------

const bucket = process.env.S3_BUCKET;
const endpoint = process.env.S3_ENDPOINT;
const databaseUrl = process.env.DATABASE_URL;

if (
  process.env.MEDIA_CLEANUP_E2E !== '1' ||
  process.env.NODE_ENV === 'production' ||
  bucket !== 'freelancer-media-dev' ||
  !endpoint ||
  new URL(endpoint).protocol !== 'https:' ||
  !new URL(endpoint).hostname.endsWith(
    '.r2.cloudflarestorage.com',
  ) ||
  !databaseUrl ||
  !['localhost', '127.0.0.1'].includes(
    new URL(databaseUrl).hostname,
  ) ||
  !process.env.S3_REGION ||
  !process.env.S3_ACCESS_KEY_ID ||
  !process.env.S3_SECRET_ACCESS_KEY
) {
  throw new Error(
    'This test requires MEDIA_CLEANUP_E2E=1, ' +
    'a local database and the isolated Cloudflare R2 ' +
    'bucket freelancer-media-dev.',
  );
}

// ---------------------------------------------------------
// One unpredictable, test-owned object
// ---------------------------------------------------------

const testProjectId = randomUUID();

const objectKey =
  `projects/${testProjectId}/` +
  `${randomUUID()}.png`;

const content = Buffer.from(
  'Freelancer Platform isolated storage deletion test',
  'utf8',
);

const s3 = new S3Client({
  endpoint,
  region: process.env.S3_REGION,
  forcePathStyle: false,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey:
      process.env.S3_SECRET_ACCESS_KEY,
  },
});

let jobId: string | null = null;
let objectCreated = false;

// ---------------------------------------------------------
// Verify that only the test object was removed
// ---------------------------------------------------------

async function objectExists(): Promise<boolean> {
  try {
    await s3.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: objectKey,
      }),
    );

    return true;
  } catch (error) {
    const response = error as {
      name?: string;
      $metadata?: {
        httpStatusCode?: number;
      };
    };

    if (
      response.$metadata?.httpStatusCode === 404 ||
      response.name === 'NotFound' ||
      response.name === 'NoSuchKey'
    ) {
      return false;
    }

    throw error;
  }
}

// ---------------------------------------------------------
// Clean up ONLY the test's job and object
// ---------------------------------------------------------

after(async () => {
  try {
    if (jobId) {
      await prisma.storageDeletionJob.deleteMany({
        where: {
          id: jobId,
          objectKey,
        },
      });
    }
  } finally {
    try {
      // This is a fallback cleanup for this test-owned
      // key only, even when an assertion failed.
      if (objectCreated) {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: bucket,
            Key: objectKey,
          }),
        );
      }
    } finally {
      s3.destroy();
      await prisma.$disconnect();
    }
  }
});

// ---------------------------------------------------------
// Real storage integration test
// ---------------------------------------------------------

test('isolated R2 deletion and retry', async (t) => {
  await t.test(
    'creates one isolated development object',
    async () => {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey,
          Body: content,
          ContentType: 'application/octet-stream',
        }),
      );

      objectCreated = true;

      assert.equal(
        await objectExists(),
        true,
      );

      const job =
        await prisma.storageDeletionJob.create({
          data: {
            objectKey,
            nextAttemptAt: new Date(
              Date.now() - 1_000,
            ),
          },
        });

      jobId = job.id;

      assert.ok(jobId);
    },
  );

  await t.test(
    'retains the cleanup job after a simulated outage',
    async () => {
      assert.ok(jobId);

      const result =
        await processStorageDeletionBatch(
          1,
          {
            onlyJobId: jobId,

            // Simulate a temporary R2 failure.
            // This callback never contacts R2.
            removeObject: async () => {
              throw new Error(
                'SimulatedTemporaryStorageFailure',
              );
            },
          },
        );

      assert.deepEqual(result, {
        claimed: 1,
        deleted: 0,
        failed: 1,
      });

      const queued =
        await prisma.storageDeletionJob
          .findUniqueOrThrow({
            where: { id: jobId },
          });

      assert.equal(queued.attempts, 1);

      assert.equal(
        queued.leaseToken,
        null,
      );

      assert.ok(
        queued.nextAttemptAt.getTime() >
          Date.now(),
      );

      // The simulated failure must NOT remove
      // the actual R2 object.
      assert.equal(
        await objectExists(),
        true,
      );
    },
  );

  await t.test(
    'retries and deletes the exact isolated object',
    async () => {
      assert.ok(jobId);

      // Advance only THIS test job to be eligible.
      // We do not advance the global cleanup queue.
      await prisma.storageDeletionJob.update({
        where: { id: jobId },
        data: {
          nextAttemptAt: new Date(
            Date.now() - 1_000,
          ),
        },
      });

      const result =
        await processStorageDeletionBatch(
          1,
          {
            onlyJobId: jobId,
          },
        );

      assert.deepEqual(result, {
        claimed: 1,
        deleted: 1,
        failed: 0,
      });

      const job =
        await prisma.storageDeletionJob.findUnique({
          where: { id: jobId },
        });

      assert.equal(job, null);

      // Give the storage endpoint a short opportunity
      // to reflect deletion before asserting absence.
      let stillExists = true;

      for (let attempt = 0; attempt < 10; attempt++) {
        stillExists = await objectExists();

        if (!stillExists) {
          break;
        }

        await pause(200);
      }

      assert.equal(
        stillExists,
        false,
        'Test-owned R2 object must be absent after deletion.',
      );
    },
  );
});
