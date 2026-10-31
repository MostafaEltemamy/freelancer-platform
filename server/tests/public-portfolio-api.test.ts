import 'dotenv/config';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';

import { prisma } from '../src/database/prisma.js';

const BASE =
  process.env.TEST_API_BASE_URL ?? 'http://localhost:5001';

const databaseUrl = process.env.DATABASE_URL;

if (
  process.env.NODE_ENV === 'production' ||
  !['localhost', '127.0.0.1'].includes(
    new URL(BASE).hostname,
  ) ||
  !databaseUrl ||
  !['localhost', '127.0.0.1'].includes(
    new URL(databaseUrl).hostname,
  )
) {
  throw new Error(
    'Public portfolio tests require a local API and database.',
  );
}

const unique = randomUUID().replace(/-/g, '');
const username = `public_${unique.slice(0, 12)}`;

let userId: string | null = null;

const publicPath = `/api/public/freelancers/${username}`;

interface PublicProject {
  slug: string;
  title: string;
  isFeatured: boolean;
  technologies: string[];
  [key: string]: unknown;
}

interface PublicProfile {
  username: string;
  projects: PublicProject[];
  skills: { name: string }[];
  [key: string]: unknown;
}

async function readPublic() {
  return fetch(`${BASE}${publicPath}`, {
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

test('Public portfolio privacy and presentation API', async (t) => {
  await t.test('creates a private freelancer profile', async () => {
    const user = await prisma.user.create({
      data: {
        email: `public-${unique}@example.com`,
        displayName: 'Public Portfolio Test',
        freelancerProfile: {
          create: {
            username,
            headline: 'Professional Software Developer',
            bio: 'I build professional websites and digital applications.',
            countryCode: 'AE',
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

    const profileId = user.freelancerProfile.id;

    await prisma.portfolioProject.createMany({
      data: [
        {
          profileId,
          slug: 'ordinary-project',
          title: 'Ordinary Public Project',
          visibility: 'PUBLIC',
          sortOrder: 1,
          technologies: ['React'],
        },
        {
          profileId,
          slug: 'secret-project',
          title: 'Confidential Client Project',
          visibility: 'PRIVATE',
          sortOrder: 0,
          technologies: ['Private Technology'],
        },
        {
          profileId,
          slug: 'featured-project',
          title: 'Featured Public Project',
          visibility: 'PUBLIC',
          isFeatured: true,
          sortOrder: 10,
          summary: 'A featured project for testing.',
          description: 'Detailed information about the public project.',
          role: 'Lead Developer',
          projectUrl: 'https://example.com',
          technologies: ['TypeScript', 'PostgreSQL'],
          startedOn: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
    });

    await prisma.profileSkill.createMany({
      data: [
        {
          profileId,
          name: 'Python',
          normalizedName: 'python',
          sortOrder: 2,
        },
        {
          profileId,
          name: 'React',
          normalizedName: 'react',
          sortOrder: 0,
        },
        {
          profileId,
          name: 'C++',
          normalizedName: 'c++',
          sortOrder: 1,
        },
      ],
    });
  });

  await t.test('does not expose unpublished profiles', async () => {
    const response = await readPublic();

    assert.equal(response.status, 404);
    assert.equal(
      response.headers.get('cache-control'),
      'no-store',
    );
  });

  await t.test('publishes the test freelancer', async () => {
    assert.ok(userId);

    const updated = await prisma.freelancerProfile.update({
      where: { userId },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });

    assert.equal(updated.status, 'PUBLISHED');
  });

  await t.test('returns only public projects in correct order', async () => {
    const response = await readPublic();

    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get('cache-control'),
      'no-store',
    );

    const { profile } = await response.json() as {
      profile: PublicProfile;
    };

    assert.equal(profile.username, username);

    assert.deepEqual(
      profile.projects.map((project) => project.slug),
      ['featured-project', 'ordinary-project'],
    );

    assert.equal(profile.projects[0]?.isFeatured, true);

    assert.deepEqual(
      profile.projects[0]?.technologies,
      ['TypeScript', 'PostgreSQL'],
    );

    assert.equal(
      profile.projects[0]?.role,
      'Lead Developer',
    );

    assert.equal(
      profile.projects[0]?.startedOn,
      '2026-01-01T00:00:00.000Z',
    );

    const serialized = JSON.stringify(profile);

    assert.ok(!serialized.includes('Confidential Client Project'));
    assert.ok(!serialized.includes('secret-project'));
    assert.ok(!serialized.includes('Private Technology'));
  });

  await t.test('returns professional skills in saved order', async () => {
    const response = await readPublic();

    assert.equal(response.status, 200);

    const { profile } = await response.json() as {
      profile: PublicProfile;
    };

    assert.deepEqual(
      profile.skills,
      [
        { name: 'React' },
        { name: 'C++' },
        { name: 'Python' },
      ],
    );
  });

  await t.test('never exposes account or internal identifiers', async () => {
    const response = await readPublic();
    const { profile } = await response.json() as {
      profile: PublicProfile;
    };

    for (const forbidden of [
      'email',
      'userId',
      'id',
      'passwordHash',
      'sessions',
      'normalizedName',
      'profileId',
    ]) {
      assert.ok(
        !JSON.stringify(profile).includes(`"${forbidden}":`),
        `Unexpected public field: ${forbidden}`,
      );
    }
  });

  await t.test('unpublishing hides the entire portfolio', async () => {
    assert.ok(userId);

    await prisma.freelancerProfile.update({
      where: { userId },
      data: {
        status: 'DRAFT',
        publishedAt: null,
      },
    });

    const response = await readPublic();

    assert.equal(response.status, 404);
  });

  await t.test('rejects profiles without completed onboarding', async () => {
    assert.ok(userId);

    await prisma.freelancerProfile.update({
      where: { userId },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        onboardingCompletedAt: null,
      },
    });

    const response = await readPublic();

    assert.equal(response.status, 404);
  });
});
