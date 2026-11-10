import 'dotenv/config';

import {
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';

import { prisma } from '../src/database/prisma.js';

import {
  auditMediaReferences,
} from '../src/modules/freelancer/media-reference-audit.js';

import type {
  MediaReference,
  MediaReferenceReaders,
  ObjectHead,
} from '../src/modules/freelancer/media-reference-audit.js';

// ---------------------------------------------------------
// Configuration
// ---------------------------------------------------------

function required(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `Missing required configuration: ${name}`,
    );
  }

  return value;
}

function config() {
  const bucket = required('S3_BUCKET');
  const endpoint = required('S3_ENDPOINT');
  const databaseUrl = required('DATABASE_URL');

  const region = required('S3_REGION');

  const accessKeyId = required(
    'R2_AUDIT_ACCESS_KEY_ID',
  );

  const secretAccessKey = required(
    'R2_AUDIT_SECRET_ACCESS_KEY',
  );

  const storage = new URL(endpoint);
  const database = new URL(databaseUrl);

  if (
    process.env.MEDIA_REFERENCE_AUDIT !== '1' ||
    process.env.NODE_ENV === 'production' ||
    bucket !== 'freelancer-media-dev' ||
    !['localhost', '127.0.0.1'].includes(
      database.hostname,
    ) ||
    storage.protocol !== 'https:' ||
    !storage.hostname.endsWith(
      '.r2.cloudflarestorage.com',
    ) ||
    !['', '/'].includes(storage.pathname) ||
    storage.search ||
    storage.hash ||
    accessKeyId === process.env.S3_ACCESS_KEY_ID
  ) {
    throw new Error(
      'Reference audit refused unsafe configuration.',
    );
  }

  return {
    bucket,
    endpoint,
    region,
    accessKeyId,
    secretAccessKey,
  };
}

// ---------------------------------------------------------
// Read-only audit implementation
// ---------------------------------------------------------

async function main(): Promise<void> {
  const settings = config();

  const s3 = new S3Client({
    region: settings.region,
    endpoint: settings.endpoint,
    forcePathStyle:
      process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: {
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
    },
    maxAttempts: 2,
  });

  try {
    // Verify the bucket is accessible before interpreting
    // a HEAD 404 response as a missing object.
    await s3.send(
      new ListObjectsV2Command({
        Bucket: settings.bucket,
        Prefix: 'projects/',
        MaxKeys: 1,
      }),
    );

    const readers: MediaReferenceReaders = {
      async listPage({ afterId, pageSize }) {
        // Fetch one extra record to know whether another
        // page exists, without loading the entire table.
        const rows = await prisma.projectMedia.findMany({
          ...(afterId
            ? {
                cursor: { id: afterId },
                skip: 1,
              }
            : {}),
          orderBy: {
            id: 'asc',
          },
          take: pageSize + 1,
          select: {
            id: true,
            version: true,
            status: true,
            kind: true,
            storageKey: true,
            previewKey: true,
            fileSizeBytes: true,
            mimeType: true,
          },
        });

        return {
          items: rows.slice(0, pageSize),
          hasMore: rows.length > pageSize,
        };
      },

      async headObject(key): Promise<ObjectHead> {
        try {
          const result = await s3.send(
            new HeadObjectCommand({
              Bucket: settings.bucket,
              Key: key,
            }),
          );

          return {
            exists: true,
            bytes: result.ContentLength,
            mimeType: result.ContentType,
          };
        } catch (error) {
          const failure = error as {
            name?: string;
            $metadata?: {
              httpStatusCode?: number;
            };
          };

          // Only a genuine missing-object response
          // is classified as absent.
          //
          // HTTP 400, 403, 429 and 5xx are failures,
          // not evidence that an object is missing.
          if (
            failure.$metadata?.httpStatusCode === 404 &&
            [
              'NotFound',
              'NoSuchKey',
              'NotFoundException',
            ].includes(failure.name ?? '')
          ) {
            return { exists: false };
          }

          throw error;
        }
      },

      async unchanged(record: MediaReference) {
        const current =
          await prisma.projectMedia.findUnique({
            where: {
              id: record.id,
            },
            select: {
              version: true,
              status: true,
              kind: true,
              storageKey: true,
              previewKey: true,
              fileSizeBytes: true,
              mimeType: true,
            },
          });

        return (
          current !== null &&
          current.version === record.version &&
          current.status === record.status &&
          current.kind === record.kind &&
          current.storageKey === record.storageKey &&
          current.previewKey === record.previewKey &&
          current.fileSizeBytes === record.fileSizeBytes &&
          current.mimeType === record.mimeType
        );
      },
    };

    const report = await auditMediaReferences(
      readers,
      {
        pageSize: 50,
        maxPages: 100,
      },
    );

    console.log(JSON.stringify({
      bucket: settings.bucket,
      ...report,
    }, null, 2));

    if (!report.complete) {
      console.error(
        'Audit incomplete: page limit reached.',
      );
      process.exitCode = 2;
    } else if (report.ready.brokenRecords > 0) {
      console.error(
        'Storage integrity findings require review.',
      );
      process.exitCode = 3;
    }
  } finally {
    s3.destroy();
  }
}

try {
  await main();
} catch (error) {
  // Do not print storage keys, signed URLs, or SDK
  // request details containing sensitive information.
  console.error(
    'Media reference audit failed:',
    error instanceof Error
      ? error.name
      : 'UnknownError',
  );

  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}