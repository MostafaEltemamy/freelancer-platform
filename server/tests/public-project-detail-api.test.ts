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
  !['localhost', '127.0.0.1'].includes(
    new URL(BASE).hostname,
  ) ||
  !databaseUrl ||
  !['localhost', '127.0.0.1'].includes(
    new URL(databaseUrl).hostname,
  )
) {
  throw new Error(
    'Public project tests require a local API and database.',
  );
}

const unique = randomUUID().replace(/-/g, '');
const username = `portfolio_${unique.slice(0, 12)}`;
const path = `/api/public/freelancers/${username}`;

let userId: string | null = null;

async function readProject(slug: string) {
  return fetch(`${BASE}${path}/projects/${slug}`, {
    headers: { Accept: 'application/json' },
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

test('Public project detail privacy', async (t) => {
  await t.test('creates private test data', async () => {
    const user = await prisma.user.create({
      data: {
        email: `detail-${unique}@example.com`,
        displayName: 'Portfolio Test User',
        freelancerProfile: {
          create: {
            username,
            headline: 'Creative Freelancer',
            onboardingCompletedAt: new Date(),
          },
        },
      },
      include: { freelancerProfile: true },
    });

    userId = user.id;
    assert.ok(user.freelancerProfile);

    const profileId = user.freelancerProfile.id;

    await prisma.portfolioProject.create({
      data: {
        profileId,
        slug: 'brand-identity',
        title: 'Brand Identity',
        summary: 'A new brand identity.',
        visibility: 'PUBLIC',
        content: {
          schemaVersion: 1,
          sections: [{
            id: randomUUID(),
            title: 'Deliverables',
            description: null,
            fields: [{
              id: randomUUID(),
              label: 'Client',
              type: 'SHORT_TEXT',
              value: 'Café Luna',
            }],
          }],
        },
      },
    });

    await prisma.portfolioProject.create({
      data: {
        profileId,
        slug: 'confidential-project',
        title: 'Private Client Project',
        visibility: 'PRIVATE',
        content: {
          schemaVersion: 1,
          sections: [{
            id: randomUUID(),
            title: 'Confidential Information',
            description: null,
            fields: [],
          }],
        },
      },
    });

    await prisma.portfolioProject.create({
      data: {
        profileId,
        slug: 'legacy-project',
        title: 'Older Project',
        visibility: 'PUBLIC',
      },
    });
  });

  await t.test('does not expose draft profiles', async () => {
    const response = await readProject('brand-identity');
    assert.equal(response.status, 404);
  });

  await t.test('publishes the profile', async () => {
    assert.ok(userId);

    await prisma.freelancerProfile.update({
      where: { userId },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
  });

  await t.test('returns public custom content without internal IDs', async () => {
    const response = await readProject('brand-identity');

    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get('cache-control'),
      'no-store',
    );

    const data = await response.json() as {
      project: {
        title: string;
        content: {
          sections: Array<{
            title: string;
            fields: unknown[];
          }>;
        };
      };
    };

    assert.equal(data.project.title, 'Brand Identity');
    assert.equal(
      data.project.content.sections[0]?.title,
      'Deliverables',
    );

    assert.deepEqual(
      data.project.content.sections[0]?.fields[0],
      {
        label: 'Client',
        type: 'SHORT_TEXT',
        value: 'Café Luna',
      },
    );

    const json = JSON.stringify(data.project);

    for (const forbidden of [
      '"id":',
      '"profileId":',
      '"userId":',
      '"version":',
      '"visibility":',
      'Confidential Information',
    ]) {
      assert.ok(!json.includes(forbidden));
    }
  });

  await t.test('does not expose private projects', async () => {
    const response = await readProject('confidential-project');
    assert.equal(response.status, 404);
  });

  await t.test('returns empty content for legacy projects', async () => {
    const response = await readProject('legacy-project');

    assert.equal(response.status, 200);

    const data = await response.json() as {
      project: { content: unknown };
    };

    assert.deepEqual(data.project.content, {
      schemaVersion: 1,
      sections: [],
    });
  });

  await t.test('rejects invalid or missing projects', async () => {
    assert.equal(
      (await readProject('invalid!!')).status,
      404,
    );

    assert.equal(
      (await readProject('does-not-exist')).status,
      404,
    );
  });

  await t.test('hides content after unpublishing', async () => {
    assert.ok(userId);

    await prisma.freelancerProfile.update({
      where: { userId },
      data: {
        status: 'DRAFT',
        publishedAt: null,
      },
    });

    assert.equal(
      (await readProject('brand-identity')).status,
      404,
    );
  });

  await t.test('requires completed onboarding', async () => {
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
      (await readProject('brand-identity')).status,
      404,
    );
  });
});
