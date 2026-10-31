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
    'Version tests require a local development database.',
  );
}

const unique = randomUUID().replace(/-/g, '');

let userId: string | null = null;

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

test('Portfolio record version constraints', async (t) => {
  let profileId = '';
  let projectId = '';
  let skillId = '';

  await t.test('creates a freelancer profile', async () => {
    const user = await prisma.user.create({
      data: {
        email: `version-test-${unique}@example.com`,
        displayName: 'Portfolio Version Test',
        freelancerProfile: {
          create: {
            username: `ver_${unique.slice(0, 12)}`,
          },
        },
      },
      include: {
        freelancerProfile: true,
      },
    });

    userId = user.id;

    assert.ok(user.freelancerProfile);
    profileId = user.freelancerProfile.id;
  });

  await t.test('new projects start at version 1', async () => {
    const project = await prisma.portfolioProject.create({
      data: {
        profileId,
        slug: 'version-test-project',
        title: 'Original Project',
      },
    });

    projectId = project.id;

    assert.equal(project.version, 1);
  });

  await t.test('new skills start at version 1', async () => {
    const skill = await prisma.profileSkill.create({
      data: {
        profileId,
        name: 'TypeScript',
        normalizedName: 'typescript',
      },
    });

    skillId = skill.id;

    assert.equal(skill.version, 1);
  });

  await t.test(
    'only one simultaneous project update can win',
    async () => {
      const results = await Promise.all([
        prisma.portfolioProject.updateMany({
          where: {
            id: projectId,
            profileId,
            version: 1,
          },
          data: {
            title: 'Edited by Browser A',
            version: { increment: 1 },
          },
        }),

        prisma.portfolioProject.updateMany({
          where: {
            id: projectId,
            profileId,
            version: 1,
          },
          data: {
            title: 'Edited by Browser B',
            version: { increment: 1 },
          },
        }),
      ]);

      assert.deepEqual(
        results.map((result) => result.count).sort(),
        [0, 1],
      );

      const project =
        await prisma.portfolioProject.findUniqueOrThrow({
          where: { id: projectId },
        });

      assert.equal(project.version, 2);

      assert.ok(
        [
          'Edited by Browser A',
          'Edited by Browser B',
        ].includes(project.title),
      );
    },
  );

  await t.test(
    'an outdated project edit cannot overwrite newer data',
    async () => {
      const before =
        await prisma.portfolioProject.findUniqueOrThrow({
          where: { id: projectId },
        });

      const staleWrite =
        await prisma.portfolioProject.updateMany({
          where: {
            id: projectId,
            profileId,
            version: 1,
          },
          data: {
            title: 'Outdated Project Title',
            version: { increment: 1 },
          },
        });

      assert.equal(staleWrite.count, 0);

      const afterWrite =
        await prisma.portfolioProject.findUniqueOrThrow({
          where: { id: projectId },
        });

      assert.equal(afterWrite.version, before.version);
      assert.equal(afterWrite.title, before.title);
    },
  );

  await t.test(
    'only one simultaneous skill update can win',
    async () => {
      const results = await Promise.all([
        prisma.profileSkill.updateMany({
          where: {
            id: skillId,
            profileId,
            version: 1,
          },
          data: {
            name: 'React',
            normalizedName: 'react',
            version: { increment: 1 },
          },
        }),

        prisma.profileSkill.updateMany({
          where: {
            id: skillId,
            profileId,
            version: 1,
          },
          data: {
            name: 'Python',
            normalizedName: 'python',
            version: { increment: 1 },
          },
        }),
      ]);

      assert.deepEqual(
        results.map((result) => result.count).sort(),
        [0, 1],
      );

      const skill = await prisma.profileSkill.findUniqueOrThrow({
        where: { id: skillId },
      });

      assert.equal(skill.version, 2);
      assert.ok(['React', 'Python'].includes(skill.name));
    },
  );

  await t.test(
    'stale deletion does not remove the current project',
    async () => {
      const deleted = await prisma.portfolioProject.deleteMany({
        where: {
          id: projectId,
          profileId,
          version: 1,
        },
      });

      assert.equal(deleted.count, 0);

      const project =
        await prisma.portfolioProject.findUniqueOrThrow({
          where: { id: projectId },
        });

      assert.equal(project.version, 2);
    },
  );

  await t.test(
    'stale deletion does not remove the current skill',
    async () => {
      const deleted = await prisma.profileSkill.deleteMany({
        where: {
          id: skillId,
          profileId,
          version: 1,
        },
      });

      assert.equal(deleted.count, 0);

      const skill = await prisma.profileSkill.findUniqueOrThrow({
        where: { id: skillId },
      });

      assert.equal(skill.version, 2);
    },
  );
});
