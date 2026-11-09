import 'dotenv/config';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';

import sharp from 'sharp';

import { prisma } from '../src/database/prisma.js';

import {
  generateSessionToken,
} from '../src/modules/auth/session-tokens.js';

import {
  SESSION_COOKIE_NAME,
} from '../src/modules/auth/session-cookie.js';

import {
  deleteStoredObject,
} from '../src/modules/freelancer/project-media.storage.js';

const ENABLED =
  process.env.MEDIA_E2E_TESTS === '1';

const BASE =
  process.env.TEST_API_BASE_URL ??
  'http://localhost:5001';

const databaseUrl = process.env.DATABASE_URL;

if (ENABLED) {
  if (
    process.env.NODE_ENV === 'production' ||
    !databaseUrl ||
    !['localhost', '127.0.0.1'].includes(
      new URL(databaseUrl).hostname,
    ) ||
    !['localhost', '127.0.0.1'].includes(
      new URL(BASE).hostname,
    ) ||
    !process.env.S3_BUCKET ||
    !process.env.S3_BUCKET.endsWith('-dev')
  ) {
    throw new Error(
      'Media E2E tests require a local API, local DB, ' +
      'and an explicitly named development storage bucket.',
    );
  }
}

interface Session {
  id: string;
  cookie: string;
  csrf: string;
}

interface MediaRecord {
  id: string;
  status: string;
  width: number | null;
  height: number | null;
}

interface PreparedUpload {
  media: MediaRecord;
  upload: {
    method: 'PUT';
    url: string;
    headers: {
      'Content-Type': string;
    };
    expiresInSeconds: number;
  };
}

const unique = randomUUID().replace(/-/g, '');
const createdUserIds: string[] = [];
let projectId = '';

async function makeSession(
  label: string,
): Promise<Session> {
  const user = await prisma.user.create({
    data: {
      email: `media-${label}-${unique}@example.com`,
      displayName: `Media Test ${label}`,
      freelancerProfile: {
        create: {
          username:
            `${label}_${unique.slice(0, 12)}`,
          headline: 'Creative Freelancer',
        },
      },
    },
    include: { freelancerProfile: true },
  });

  createdUserIds.push(user.id);

  assert.ok(user.freelancerProfile);

  const { token, tokenHash } =
    generateSessionToken();

  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });

  const cookie = `${SESSION_COOKIE_NAME}=${token}`;

  const csrfResponse = await fetch(
    `${BASE}/api/auth/csrf`,
    {
      headers: { Cookie: cookie },
    },
  );

  assert.equal(csrfResponse.status, 200);

  const csrfData = await csrfResponse.json() as {
    csrfToken: string;
  };

  return {
    id: user.id,
    cookie,
    csrf: csrfData.csrfToken,
  };
}

function request(
  path: string,
  method: 'GET' | 'POST',
  session?: Session,
  body?: unknown,
  includeCsrf = true,
): Promise<Response> {
  const headers = new Headers();

  if (method === 'POST') {
    headers.set('Origin', new URL(BASE).origin);
  }

  if (session) {
    headers.set('Cookie', session.cookie);

    if (method === 'POST' && includeCsrf) {
      headers.set('X-CSRF-Token', session.csrf);
    }
  }

  if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(`${BASE}${path}`, {
    method,
    headers,
    body:
      body === undefined
        ? undefined
        : JSON.stringify(body),
  });
}

after(async () => {
  if (!ENABLED) return;

  try {
    if (projectId) {
      const stored = await prisma.projectMedia.findMany({
        where: { projectId },
        select: {
          storageKey: true,
          previewKey: true,
        },
      });

      for (const item of stored) {
        await deleteStoredObject(item.storageKey);

        if (item.previewKey) {
          await deleteStoredObject(item.previewKey);
        }
      }
    }

    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: {
          id: { in: createdUserIds },
        },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
});

test(
  'Project media upload API',
  { skip: !ENABLED },
  async (t) => {
    let owner!: Session;
    let other!: Session;

    let upload!: PreparedUpload;

    const basePath = () =>
      `/api/freelancer/projects/${projectId}/media`;

    await t.test('creates isolated project accounts', async () => {
      owner = await makeSession('owner');
      other = await makeSession('other');

      const profile =
        await prisma.freelancerProfile.findUniqueOrThrow({
          where: { userId: owner.id },
        });

      const project = await prisma.portfolioProject.create({
        data: {
          profileId: profile.id,
          slug: 'upload-test',
          title: 'Media Upload Test',
        },
      });

      projectId = project.id;
    });

    await t.test('requires authentication', async () => {
      const response = await request(
        basePath(),
        'GET',
      );

      assert.equal(response.status, 401);
    });

    await t.test('requires CSRF protection', async () => {
      const response = await request(
        `${basePath()}/uploads`,
        'POST',
        owner,
        {
          originalFilename: 'test.png',
          mimeType: 'image/png',
          fileSizeBytes: 1000,
        },
        false,
      );

      assert.equal(response.status, 403);
    });

    await t.test('rejects other freelancers', async () => {
      const response = await request(
        `${basePath()}/uploads`,
        'POST',
        other,
        {
          originalFilename: 'test.png',
          mimeType: 'image/png',
          fileSizeBytes: 1000,
        },
      );

      assert.equal(response.status, 404);
    });

    await t.test('rejects unsupported formats', async () => {
      const response = await request(
        `${basePath()}/uploads`,
        'POST',
        owner,
        {
          originalFilename: 'document.svg',
          mimeType: 'image/svg+xml',
          fileSizeBytes: 500,
        },
      );

      assert.equal(response.status, 400);
    });

    await t.test('creates a pending signed upload', async () => {
      const image = await sharp({
        create: {
          width: 320,
          height: 180,
          channels: 3,
          background: '#2277aa',
        },
      })
        .png()
        .toBuffer();

      const response = await request(
        `${basePath()}/uploads`,
        'POST',
        owner,
        {
          originalFilename: 'portfolio-test.png',
          mimeType: 'image/png',
          fileSizeBytes: image.length,
        },
      );

      assert.equal(response.status, 201);

      upload = await response.json() as PreparedUpload;

      assert.equal(upload.media.status, 'PENDING');
      assert.equal(upload.upload.method, 'PUT');

      const safeResponse = JSON.stringify(upload.media);

      assert.ok(!safeResponse.includes('storageKey'));
      assert.ok(!safeResponse.includes('previewKey'));

      // Completing before the actual PUT must fail.
      const early = await request(
        `${basePath()}/uploads/${upload.media.id}/complete`,
        'POST',
        owner,
      );

      assert.equal(early.status, 409);

      // Transfer bytes directly to private storage.
      const putResponse = await fetch(upload.upload.url, {
        method: 'PUT',
        headers: upload.upload.headers,
        body: new Uint8Array(image),
      });

      assert.ok(
        putResponse.ok,
        `Storage rejected the upload: ${putResponse.status}`,
      );
    });

    await t.test('finalizes verified image bytes', async () => {
      const response = await request(
        `${basePath()}/uploads/${upload.media.id}/complete`,
        'POST',
        owner,
      );

      assert.equal(response.status, 200);

      const data = await response.json() as {
        media: MediaRecord;
      };

      assert.equal(data.media.status, 'READY');
      assert.equal(data.media.width, 320);
      assert.equal(data.media.height, 180);

      const saved = await prisma.projectMedia.findUniqueOrThrow({
        where: { id: upload.media.id },
        select: {
          status: true,
          previewKey: true,
          version: true,
        },
      });

      assert.equal(saved.status, 'READY');
      assert.ok(saved.previewKey);
      assert.equal(saved.version, 2);
    });

    await t.test('does not finalize twice', async () => {
      const response = await request(
        `${basePath()}/uploads/${upload.media.id}/complete`,
        'POST',
        owner,
      );

      assert.equal(response.status, 409);
    });

    await t.test('lists only owner media without storage keys', async () => {
      const response = await request(
        basePath(),
        'GET',
        owner,
      );

      assert.equal(response.status, 200);

      const data = await response.json() as {
        media: MediaRecord[];
      };

      assert.equal(data.media.length, 1);
      assert.equal(data.media[0]?.status, 'READY');

      const serialized = JSON.stringify(data);

      assert.ok(!serialized.includes('storageKey'));
      assert.ok(!serialized.includes('previewKey'));

      const foreign = await request(
        basePath(),
        'GET',
        other,
      );

      assert.equal(foreign.status, 404);
    });
    
    await t.test('provides a temporary verified WebP preview', async () => {
      const response = await request(
        basePath(),
        'GET',
        owner,
      );

      assert.equal(response.status, 200);

      const result = await response.json() as {
        media: Array<{
          id: string;
          status: string;
          previewUrl: string | null;
        }>;
      };

      const image = result.media.find(
        (item) => item.id === upload.media.id,
      );

      assert.ok(image);
      assert.equal(image.status, 'READY');
      assert.ok(image.previewUrl);

      const previewResponse = await fetch(
        image.previewUrl,
      );

      assert.equal(previewResponse.status, 200);

      const buffer = Buffer.from(
        await previewResponse.arrayBuffer(),
      );

      const metadata = await sharp(buffer).metadata();

      assert.equal(metadata.format, 'webp');
      assert.equal(metadata.width, 320);
      assert.equal(metadata.height, 180);
    });
  },
);
