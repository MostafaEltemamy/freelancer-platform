import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { prisma } from '../src/database/prisma.js';

const databaseUrl = process.env.DATABASE_URL;

if (
  process.env.NODE_ENV === 'production' ||
  !databaseUrl ||
  !['localhost', '127.0.0.1'].includes(
    new URL(databaseUrl).hostname,
  )
) {
  throw new Error(
    'Media schema tests require a local development database.',
  );
}

const unique = randomUUID().replace(/-/g, '');

let userId: string | null = null;

after(async () => {
  try {
    if (userId) {
      await prisma.user.deleteMany({
        where: { id: userId },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
});

test('Project Media database constraints', async (t) => {
  let projectId = '';
  let coverId = '';

  await t.test('creates a project owner', async () => {
    const user = await prisma.user.create({
      data: {
        email: `media-test-${unique}@example.com`,
        displayName: 'Media Test Freelancer',
        freelancerProfile: {
          create: {
            username: `media_${unique.slice(0, 12)}`,
            headline: 'Creative Freelancer',
          },
        },
      },
      include: {
        freelancerProfile: true,
      },
    });

    userId = user.id;

    assert.ok(user.freelancerProfile);

    const project = await prisma.portfolioProject.create({
      data: {
        profileId: user.freelancerProfile.id,
        slug: 'media-test-project',
        title: 'Portfolio Media Test Project',
      },
    });

    projectId = project.id;
  });

  await t.test('creates a pending media record', async () => {
    const media = await prisma.projectMedia.create({
      data: {
        projectId,
        storageKey: `projects/${projectId}/${randomUUID()}.jpg`,
        originalFilename: 'project.jpg',
        mimeType: 'image/jpeg',
        fileSizeBytes: 100_000,
        kind: 'IMAGE',
      },
    });

    assert.equal(media.status, 'PENDING');
    assert.equal(media.isCover, false);
    assert.equal(media.version, 1);
    assert.equal(media.readyAt, null);
  });

  await t.test('allows one project cover', async () => {
    const cover = await prisma.projectMedia.create({
      data: {
        projectId,
        storageKey: `projects/${projectId}/${randomUUID()}.png`,
        originalFilename: 'cover.png',
        mimeType: 'image/png',
        fileSizeBytes: 200_000,
        kind: 'IMAGE',
        status: 'READY',
        readyAt: new Date(),
        isCover: true,
      },
    });

    coverId = cover.id;

    assert.equal(cover.isCover, true);
    assert.equal(cover.status, 'READY');
  });

  await t.test('prevents a second cover for the same project', async () => {
    await assert.rejects(
      () =>
        prisma.projectMedia.create({
          data: {
            projectId,
            storageKey:
              `projects/${projectId}/${randomUUID()}.jpg`,
            originalFilename: 'second-cover.jpg',
            mimeType: 'image/jpeg',
            fileSizeBytes: 150_000,
            kind: 'IMAGE',
            status: 'READY',
            readyAt: new Date(),
            isCover: true,
          },
        }),
      (error: unknown) => (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ),
    );
  });

  await t.test('allows multiple gallery images', async () => {
    const gallery = await prisma.projectMedia.create({
      data: {
        projectId,
        storageKey: `projects/${projectId}/${randomUUID()}.webp`,
        originalFilename: 'gallery.webp',
        mimeType: 'image/webp',
        fileSizeBytes: 250_000,
        kind: 'IMAGE',
        status: 'READY',
        readyAt: new Date(),
        isCover: false,
        sortOrder: 2,
      },
    });

    assert.equal(gallery.isCover, false);

    const count = await prisma.projectMedia.count({
      where: {
        projectId,
        status: 'READY',
      },
    });

    assert.equal(count, 2);
  });

  await t.test('cascades media metadata after project deletion', async () => {
    const cover = await prisma.projectMedia.findUnique({
      where: { id: coverId },
    });

    assert.ok(cover);

    await prisma.portfolioProject.delete({
      where: { id: projectId },
    });

    const count = await prisma.projectMedia.count({
      where: { projectId },
    });

    assert.equal(count, 0);
  });
});
