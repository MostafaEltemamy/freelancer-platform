import 'dotenv/config';

import {
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';

import { prisma } from '../src/database/prisma.js';

import {
  auditProjectMediaStorage,
} from '../src/modules/freelancer/media-orphan-audit.js';

import type {
  MediaAuditReaders,
} from '../src/modules/freelancer/media-orphan-audit.js';

// ---------------------------------------------------------
// Strict execution guard
// ---------------------------------------------------------

const bucket = process.env.S3_BUCKET;
const endpoint = process.env.S3_ENDPOINT;
const databaseUrl = process.env.DATABASE_URL;

const auditAccessKey =
  process.env.R2_AUDIT_ACCESS_KEY_ID;

const auditSecret =
  process.env.R2_AUDIT_SECRET_ACCESS_KEY;

const region = process.env.S3_REGION;

function requireSafeConfiguration(): void {
  if (
    process.env.MEDIA_ORPHAN_AUDIT !== '1' ||
    process.env.NODE_ENV === 'production' ||
    bucket !== 'freelancer-media-dev' ||
    !endpoint ||
    !databaseUrl ||
    !region ||
    !auditAccessKey ||
    !auditSecret
  ) {
    throw new Error(
      'Orphan audit requires explicit opt-in, ' +
      'a local database and dedicated development ' +
      'R2 read-only credentials.',
    );
  }

  const dbUrl = new URL(databaseUrl);
  const storageUrl = new URL(endpoint);

  if (
    !['localhost', '127.0.0.1'].includes(
      dbUrl.hostname,
    ) ||
    storageUrl.protocol !== 'https:' ||
    !storageUrl.hostname.endsWith(
      '.r2.cloudflarestorage.com',
    )
  ) {
    throw new Error(
      'Orphan audit refused unsafe database ' +
      'or storage endpoint configuration.',
    );
  }

  // Do not silently reuse the application's
  // broader write-capable credentials.
  if (
    auditAccessKey ===
    process.env.S3_ACCESS_KEY_ID
  ) {
    throw new Error(
      'Use a separate R2 Object Read only token.',
    );
  }
}

// ---------------------------------------------------------
// Audit implementation
// ---------------------------------------------------------

async function main(): Promise<void> {
  requireSafeConfiguration();

  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle:
      process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: {
      accessKeyId: auditAccessKey!,
      secretAccessKey: auditSecret!,
    },
  });

  try {
    const readers: MediaAuditReaders = {
      async listPage({
        prefix,
        cursor,
        maxKeys,
      }) {
        const response = await client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            MaxKeys: maxKeys,
            ...(cursor
              ? { ContinuationToken: cursor }
              : {}),
          }),
        );

        return {
          objects: (response.Contents ?? []).map(
            (object) => ({
              key: object.Key,
              lastModified: object.LastModified,
              size: object.Size,
            }),
          ),

          isTruncated:
            response.IsTruncated === true,

          nextCursor:
            response.NextContinuationToken,
        };
      },

      async findReferences(keys) {
        const [media, deletionJobs] =
          await Promise.all([
            prisma.projectMedia.findMany({
              where: {
                OR: [
                  {
                    storageKey: {
                      in: keys,
                    },
                  },
                  {
                    previewKey: {
                      in: keys,
                    },
                  },
                ],
              },
              select: {
                storageKey: true,
                previewKey: true,
              },
            }),

            prisma.storageDeletionJob.findMany({
              where: {
                objectKey: {
                  in: keys,
                },
              },
              select: {
                objectKey: true,
              },
            }),
          ]);

        const requested = new Set(keys);
        const activeKeys = new Set<string>();

        for (const item of media) {
          if (requested.has(item.storageKey)) {
            activeKeys.add(item.storageKey);
          }

          if (
            item.previewKey &&
            requested.has(item.previewKey)
          ) {
            activeKeys.add(item.previewKey);
          }
        }

        return {
          activeKeys: [...activeKeys],
          queuedKeys: deletionJobs.map(
            (job) => job.objectKey,
          ),
        };
      },
    };

    const report = await auditProjectMediaStorage(
      readers,
      {
        pageSize: 500,
        maxPages: 100,
      },
    );

    console.log(JSON.stringify({
      mode: 'READ_ONLY',
      bucket,
      ...report,
    }, null, 2));

    if (!report.complete) {
      console.error(
        'Audit inventory was truncated. ' +
        'Do not interpret the counts as complete.',
      );

      process.exitCode = 2;
    }
  } finally {
    client.destroy();
  }
}

// ---------------------------------------------------------
// No secrets or internal object keys in error output
// ---------------------------------------------------------

try {
  await main();
} catch (error) {
  console.error(
    'Media orphan audit failed:',
    error instanceof Error
      ? error.name
      : 'UnknownError',
  );

  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
