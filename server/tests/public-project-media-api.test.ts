import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { prisma } from '../src/database/prisma.js';

const BASE =
  process.env.TEST_API_BASE_URL ??
  'http://localhost:5001';

const databaseUrl = process.env.DATABASE_URL;

if (
  process.env.NODE_ENV === 'production' ||
  !databaseUrl ||
  !['localhost', '127.0.0.1'].includes(
    new URL(databaseUrl).hostname,
  ) ||
  !['localhost', '127.0.0.1'].includes(
    new URL(BASE).hostname,
  ) ||
  !process.env.S3_BUCKET?.endsWith('-dev') ||
  !process.env.S3_REGION ||
  !process.env.S3_ENDPOINT ||
  !process.env.S3_ACCESS_KEY_ID ||
  !process.env.S3_SECRET_ACCESS_KEY
) {
  throw new Error(
    'Public image tests require a local API, ' +
    'local database and development R2 configuration.',
  );
}

const suffix = randomUUID().replace(/-/g, '');
const username = `media_${suffix.slice(0, 12)}`;

const profilePath =
  `/api/public/freelancers/${username}`;

const projectPath =
  `${profilePath}/projects/branding-work`;

let userId: string | null = null;

function previewKey(projectId: string): string {
  return (
    `projects/${projectId}/previews/` +
    `${randomUUID()}.webp`
  );
}

function storageKey(projectId: string): string {
  return `projects/${projectId}/${randomUUID()}.png`;
}

async function read(path: string) {
  return fetch(`${BASE}${path}`, {
    headers: {
      Accept: 'application/json',
    },
  });
}

after(async () => {
  try {
    if (userId) {
      await prisma.user.delete({
        where: { id: userId },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
});

test('Public project media privacy', async (t) => {
  await t.test('creates isolated media test data', async () => {
    const user = await prisma.user.create({
      data: {
        email: `public-images-${suffix}@example.com`,
        freelancerProfile: {
          create: {
            username,
            headline: 'Professional Brand Designer',
            status: 'PUBLISHED',
            publishedAt: new Date(),
            onboardingCompletedAt: new Date(),
          },
        },
      },
      include: {
        freelancerProfile: true,
      },
    });

    userId = user.id;

    assert.ok(user.freelancerProfile);

    const publicProject =
      await prisma.portfolioProject.create({
        data: {
          profileId: user.freelancerProfile.id,
          slug: 'branding-work',
          title: 'Branding Work',
          visibility: 'PUBLIC',
        },
      });

    const privateProject =
      await prisma.portfolioProject.create({
        data: {
          profileId: user.freelancerProfile.id,
          slug: 'confidential-work',
          title: 'Confidential Work',
          visibility: 'PRIVATE',
        },
      });

    // Insert deliberately out of order.
    await prisma.projectMedia.create({
      data: {
        projectId: publicProject.id,
        storageKey: storageKey(publicProject.id),
        previewKey: previewKey(publicProject.id),
        originalFilename: 'gallery-second.png',
        mimeType: 'image/png',
        fileSizeBytes: 500,
        kind: 'IMAGE',
        status: 'READY',
        sortOrder: 1,
        altText: 'Second project image',
        caption: 'Second deliverable',
        readyAt: new Date(),
      },
    });

    await prisma.projectMedia.create({
      data: {
        projectId: publicProject.id,
        storageKey: storageKey(publicProject.id),
        previewKey: previewKey(publicProject.id),
        originalFilename: 'cover-first.png',
        mimeType: 'image/png',
        fileSizeBytes: 500,
        kind: 'IMAGE',
        status: 'READY',
        isCover: true,
        sortOrder: 0,
        altText: 'Brand identity cover',
        caption: 'Main branding mockup',
        readyAt: new Date(),
      },
    });

    // Even a record with a previewKey must not be shown
    // while its status is PENDING.
    await prisma.projectMedia.create({
      data: {
        projectId: publicProject.id,
        storageKey: storageKey(publicProject.id),
        previewKey: previewKey(publicProject.id),
        originalFilename: 'unfinished-secret.png',
        mimeType: 'image/png',
        fileSizeBytes: 500,
        kind: 'IMAGE',
        status: 'PENDING',
        sortOrder: 2,
      },
    });

    await prisma.projectMedia.create({
      data: {
        projectId: privateProject.id,
        storageKey: storageKey(privateProject.id),
        previewKey: previewKey(privateProject.id),
        originalFilename: 'confidential.png',
        mimeType: 'image/png',
        fileSizeBytes: 500,
        kind: 'IMAGE',
        status: 'READY',
        isCover: true,
        readyAt: new Date(),
      },
    });
  });

  await t.test('returns only the public cover on profile cards', async () => {
    const response = await read(profilePath);

    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get('cache-control'),
      'no-store',
    );

    const data = await response.json() as {
      profile: {
        projects: Array<{
          slug: string;
          coverImage: {
            url: string;
            altText: string | null;
          } | null;
        }>;
      };
    };

    assert.equal(data.profile.projects.length, 1);

    const project = data.profile.projects[0]!;

    assert.equal(project.slug, 'branding-work');
    assert.equal(
      project.coverImage?.altText,
      'Brand identity cover',
    );

    assert.ok(project.coverImage?.url);

    const url = new URL(project.coverImage.url);

    assert.equal(
      url.searchParams.get('X-Amz-Expires'),
      '60',
    );

    const serialized = JSON.stringify(data);

    assert.ok(!serialized.includes('confidential-work'));
    assert.ok(!serialized.includes('unfinished-secret'));

    // Keys are not returned as JSON fields.
    assert.ok(!serialized.includes('"storageKey"'));
    assert.ok(!serialized.includes('"previewKey"'));
  });

  await t.test('returns gallery images in saved order', async () => {
    const response = await read(projectPath);

    assert.equal(response.status, 200);

    const data = await response.json() as {
      project: {
        images: Array<{
          url: string;
          altText: string | null;
          caption: string | null;
        }>;
      };
    };

    assert.equal(data.project.images.length, 2);

    assert.deepEqual(
      data.project.images.map((image) => image.altText),
      [
        'Brand identity cover',
        'Second project image',
      ],
    );

    assert.deepEqual(
      data.project.images.map((image) => image.caption),
      [
        'Main branding mockup',
        'Second deliverable',
      ],
    );

    for (const image of data.project.images) {
      assert.ok(image.url);
      assert.equal(
        new URL(image.url).searchParams.get(
          'X-Amz-Expires',
        ),
        '60',
      );
    }
  });

  await t.test('does not expose private project galleries', async () => {
    const response = await read(
      `${profilePath}/projects/confidential-work`,
    );

    assert.equal(response.status, 404);
  });

  await t.test('unpublishing revokes new public access', async () => {
    assert.ok(userId);

    await prisma.freelancerProfile.update({
      where: { userId },
      data: {
        status: 'DRAFT',
        publishedAt: null,
      },
    });

    const profileResponse = await read(profilePath);
    const projectResponse = await read(projectPath);

    assert.equal(profileResponse.status, 404);
    assert.equal(projectResponse.status, 404);
  });

  await t.test('incomplete onboarding stays private', async () => {
    assert.ok(userId);

    await prisma.freelancerProfile.update({
      where: { userId },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        onboardingCompletedAt: null,
      },
    });

    assert.equal(
      (await read(profilePath)).status,
      404,
    );

    assert.equal(
      (await read(projectPath)).status,
      404,
    );
  });
});
