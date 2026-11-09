import 'dotenv/config';

import {
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';

function required(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `Missing environment setting: ${name}`,
    );
  }

  return value;
}

const bucket = required('S3_BUCKET');
const endpoint = required('S3_ENDPOINT');

if (bucket !== 'freelancer-media-dev') {
  throw new Error(
    'Diagnostic restricted to development bucket.',
  );
}

const endpointUrl = new URL(endpoint);

if (
  endpointUrl.protocol !== 'https:' ||
  !endpointUrl.hostname.endsWith(
    '.r2.cloudflarestorage.com',
  ) ||
  !['', '/'].includes(endpointUrl.pathname) ||
  endpointUrl.search ||
  endpointUrl.hash
) {
  throw new Error('Invalid R2 S3 API endpoint.');
}

interface Credentials {
  accessKeyId: string;
  secretAccessKey: string;
}

async function probe(
  label: string,
  credentials: Credentials,
  prefix?: string,
): Promise<void> {
  const client = new S3Client({
    region: 'auto',
    endpoint,
    forcePathStyle: true,
    credentials,
    maxAttempts: 1,
  });

  try {
    const result = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        MaxKeys: 1,

        ...(prefix
          ? { Prefix: prefix }
          : {}),
      }),
    );

    console.log({
      test: label,
      success: true,
      httpStatus: result.$metadata.httpStatusCode,
      returnedObjects: result.Contents?.length ?? 0,
    });
  } catch (error) {
    const failure = error as {
      name?: string;
      $metadata?: {
        httpStatusCode?: number;
      };
    };

    console.log({
      test: label,
      success: false,
      errorName: failure.name ?? 'UnknownError',
      httpStatus:
        failure.$metadata?.httpStatusCode ?? null,
    });
  } finally {
    client.destroy();
  }
}

async function main(): Promise<void> {
  const auditCredentials: Credentials = {
    accessKeyId: required(
      'R2_AUDIT_ACCESS_KEY_ID',
    ),
    secretAccessKey: required(
      'R2_AUDIT_SECRET_ACCESS_KEY',
    ),
  };

  const applicationCredentials: Credentials = {
    accessKeyId: required(
      'S3_ACCESS_KEY_ID',
    ),
    secretAccessKey: required(
      'S3_SECRET_ACCESS_KEY',
    ),
  };

  // Test 1: audit token, minimal listing
  await probe(
    'Audit token - minimal listing',
    auditCredentials,
  );

  // Test 2: audit token, project prefix
  await probe(
    'Audit token - projects prefix',
    auditCredentials,
    'projects/',
  );

  // Test 3: application token, minimal listing
  await probe(
    'Application token - minimal listing',
    applicationCredentials,
  );

  // Test 4: application token, project prefix
  await probe(
    'Application token - projects prefix',
    applicationCredentials,
    'projects/',
  );
}

await main();
