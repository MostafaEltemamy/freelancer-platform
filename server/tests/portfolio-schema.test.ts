import 'dotenv/config';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';

import { Prisma } from '../src/generated/prisma/client.js';
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
    'Portfolio schema tests require a local development database.',
  );
}

const unique = randomUUID().replace(/-/g, '');
const createdUserIds: string[] = [];

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

after(async () => {
  try {
    await prisma.user.deleteMany({
      where: {
        id: { in: createdUserIds },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
});

test('Portfolio projects and skills database constraints', async () => {
  // Create two different freelancer accounts.
  const owner = await prisma.user.create({
    data: {
      email: `portfolio-owner-${unique}@example.com`,
      displayName: 'Portfolio Owner',
      freelancerProfile: {
        create: {
          username: `owner_${unique.slice(0, 12)}`,
        },
      },
    },
    include: {
      freelancerProfile: true,
    },
  });

  createdUserIds.push(owner.id);
  assert.ok(owner.freelancerProfile);

  const other = await prisma.user.create({
    data: {
      email: `portfolio-other-${unique}@example.com`,
      displayName: 'Other Freelancer',
      freelancerProfile: {
        create: {
          username: `other_${unique.slice(0, 12)}`,
        },
      },
    },
    include: {
      freelancerProfile: true,
    },
  });

  createdUserIds.push(other.id);
  assert.ok(other.freelancerProfile);

  const ownerProfileId = owner.freelancerProfile.id;
  const otherProfileId = other.freelancerProfile.id;

  // Projects are private by default.
  const project = await prisma.portfolioProject.create({
    data: {
      profileId: ownerProfileId,
      slug: 'research-dashboard',
      title: 'Research Data Dashboard',
      summary: 'A dashboard for scientific research data.',
      technologies: ['React', 'TypeScript', 'PostgreSQL'],
      sortOrder: 10,
    },
  });

  assert.equal(project.visibility, 'PRIVATE');
  assert.equal(project.isFeatured, false);
  assert.equal(project.profileId, ownerProfileId);

  assert.deepEqual(project.technologies, [
    'React',
    'TypeScript',
    'PostgreSQL',
  ]);

  // Duplicate slugs are rejected within the same profile.
  await assert.rejects(
    () =>
      prisma.portfolioProject.create({
        data: {
          profileId: ownerProfileId,
          slug: 'research-dashboard',
          title: 'Duplicate Project',
        },
      }),
    isUniqueViolation,
  );

  // Different freelancers may use the same project slug.
  const otherProject = await prisma.portfolioProject.create({
    data: {
      profileId: otherProfileId,
      slug: 'research-dashboard',
      title: 'Another Research Dashboard',
    },
  });

  assert.equal(otherProject.profileId, otherProfileId);

  // A profile supports multiple ordered projects.
  await prisma.portfolioProject.create({
    data: {
      profileId: ownerProfileId,
      slug: 'laboratory-platform',
      title: 'Laboratory Management Platform',
      sortOrder: 2,
    },
  });

  const orderedProjects = await prisma.portfolioProject.findMany({
    where: { profileId: ownerProfileId },
    orderBy: [
      { sortOrder: 'asc' },
      { id: 'asc' },
    ],
    select: { slug: true },
  });

  assert.deepEqual(
    orderedProjects.map((item) => item.slug),
    ['laboratory-platform', 'research-dashboard'],
  );

  // Create a professional skill.
  const skill = await prisma.profileSkill.create({
    data: {
      profileId: ownerProfileId,
      name: 'React',
      normalizedName: 'react',
      sortOrder: 1,
    },
  });

  assert.equal(skill.name, 'React');

  // Reject a duplicate normalized skill.
  await assert.rejects(
    () =>
      prisma.profileSkill.create({
        data: {
          profileId: ownerProfileId,
          name: 'REACT',
          normalizedName: 'react',
        },
      }),
    isUniqueViolation,
  );

  // Another freelancer can have the same skill.
  const otherSkill = await prisma.profileSkill.create({
    data: {
      profileId: otherProfileId,
      name: 'React',
      normalizedName: 'react',
    },
  });

  assert.equal(otherSkill.profileId, otherProfileId);

  // Deleting the owner cascades to projects and skills.
  await prisma.user.delete({
    where: { id: owner.id },
  });

  assert.equal(
    await prisma.portfolioProject.count({
      where: { profileId: ownerProfileId },
    }),
    0,
  );

  assert.equal(
    await prisma.profileSkill.count({
      where: { profileId: ownerProfileId },
    }),
    0,
  );

  // Deleting one account does not remove another's data.
  assert.equal(
    await prisma.portfolioProject.count({
      where: { profileId: otherProfileId },
    }),
    1,
  );

  assert.equal(
    await prisma.profileSkill.count({
      where: { profileId: otherProfileId },
    }),
    1,
  );
});
