
import 'dotenv/config';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';

import { Prisma } from '../src/generated/prisma/client.js';
import { prisma } from '../src/database/prisma.js';

// Prevent accidental writes to a non-local database.
const databaseUrl = process.env.DATABASE_URL;

if (
  !databaseUrl ||
  !['localhost', '127.0.0.1'].includes(
    new URL(databaseUrl).hostname,
  )
) {
  throw new Error(
    'Profile schema tests require a local PostgreSQL database.',
  );
}

after(async () => {
  await prisma.$disconnect();
});

test('freelancer profile database constraints', async () => {
  const uniqueId = randomUUID().replace(/-/g, '');
  const username = `test_${uniqueId.slice(0, 16)}`;

  let firstUserId: string | undefined;
  let secondUserId: string | undefined;

  try {
    const firstUser = await prisma.user.create({
      data: {
        email: `profile-a-${uniqueId}@example.com`,
        displayName: 'Profile Test A',
      },
    });

    firstUserId = firstUser.id;

    const secondUser = await prisma.user.create({
      data: {
        email: `profile-b-${uniqueId}@example.com`,
        displayName: 'Profile Test B',
      },
    });

    secondUserId = secondUser.id;

    // Newly registered users do not require a profile.
    const emptyProfile = await prisma.freelancerProfile.findUnique({
      where: { userId: firstUser.id },
    });

    assert.equal(emptyProfile, null);

    // Create a draft profile for the first user.
    const profile = await prisma.freelancerProfile.create({
      data: {
        userId: firstUser.id,
        username,
        headline: 'Test Freelancer',
      },
    });

    assert.equal(profile.userId, firstUser.id);
    assert.equal(profile.username, username);
    assert.equal(profile.status, 'DRAFT');
    assert.equal(profile.publishedAt, null);

    // The same user cannot own two freelancer profiles.
    await assert.rejects(
      () =>
        prisma.freelancerProfile.create({
          data: {
            userId: firstUser.id,
          },
        }),
      (error: unknown) =>
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002',
    );

    // A second user cannot claim an existing username.
    await assert.rejects(
      () =>
        prisma.freelancerProfile.create({
          data: {
            userId: secondUser.id,
            username,
          },
        }),
      (error: unknown) =>
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002',
    );

    // Deleting an owner deletes the corresponding profile.
    await prisma.user.delete({
      where: { id: firstUser.id },
    });

    firstUserId = undefined;

    const deletedProfile =
      await prisma.freelancerProfile.findUnique({
        where: { id: profile.id },
      });

    assert.equal(deletedProfile, null);
  } finally {
    // Remove test records even if assertions fail.
    if (firstUserId) {
      await prisma.user.deleteMany({
        where: { id: firstUserId },
      });
    }

    if (secondUserId) {
      await prisma.user.deleteMany({
        where: { id: secondUserId },
      });
    }
  }
});
