import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { prisma } from '../src/database/prisma.js';
import {generateSessionToken} from '../src/modules/auth/session-tokens.js';
import {SESSION_COOKIE_NAME} from '../src/modules/auth/session-cookie.js';

const BASE =
  process.env.TEST_API_BASE_URL ?? 'http://localhost:5001';

const databaseUrl = process.env.DATABASE_URL;
const origin = new URL(BASE).origin;

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
    'Skill tests require a local development API and database.',
  );
}

const unique = randomUUID().replace(/-/g, '');
const createdUserIds: string[] = [];

interface Session {
  id: string;
  cookie: string;
  csrf: string;
}

interface SkillRecord {
  id: string;
  name: string;
  sortOrder: number;
  version: number;
}

interface VersionedItem {
  id: string;
  version: number;
}

async function makeSession(
  label: string,
  withProfile = true,
): Promise<Session> {
  const user = await prisma.user.create({
    data: {
      email: `skill-${label}-${unique}@example.com`,
      displayName: `Skill Test ${label}`,
      ...(withProfile
        ? {
            freelancerProfile: {
              create: {
                username: `${label}_${unique.slice(0, 12)}`,
                headline: 'Professional Software Developer',
                bio: 'I build reliable digital applications and help clients deliver their projects.',
                countryCode: 'AE',
                onboardingCompletedAt: new Date(),
              },
            },
          }
        : {}),
    },
  });

  createdUserIds.push(user.id);

  const { token, tokenHash } = generateSessionToken();

  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });

  const cookie = `${SESSION_COOKIE_NAME}=${token}`;

  const csrfResponse = await fetch(
    `${BASE}/api/auth/csrf`,
    { headers: { Cookie: cookie } },
  );

  assert.equal(csrfResponse.status, 200);

  const data = await csrfResponse.json() as {
    csrfToken: string;
  };

  assert.match(data.csrfToken, /^[a-f0-9]{64}$/);

  return {
    id: user.id,
    cookie,
    csrf: data.csrfToken,
  };
}

function request(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  session?: Session,
  body?: unknown,
  includeCsrf = true,
): Promise<Response> {
  const headers = new Headers();

  if (method !== 'GET') {
    headers.set('Origin', origin);
  }

  if (session) {
    headers.set('Cookie', session.cookie);

    if (method !== 'GET' && includeCsrf) {
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

test('Professional Skills API', async (t) => {
  const path = '/api/freelancer/skills';

  let owner!: Session;
  let other!: Session;
  let withoutProfile!: Session;

  const skillIds = new Map<string, string>();
  const versions = new Map<string, number>();

  let otherSkillId = '';
  let lastOrderBeforeReorder: VersionedItem[] = [];
  let lastOrderedIds: string[] = [];

  function versionOf(id: string): number {
    const version = versions.get(id);
    assert.notEqual(
      version,
      undefined,
      `Missing version for skill ${id}`,
    );
    return version!;
  }

  function orderPayload(ids: string[]) {
    return {
      items: ids.map((id) => ({
        id,
        version: versionOf(id),
      })),
    };
  }

  async function addSkill(
    session: Session,
    name: string,
  ): Promise<SkillRecord> {
    const response = await request(
      path,
      'POST',
      session,
      { name },
    );

    assert.equal(response.status, 201);

    const data = await response.json() as {
      skill: SkillRecord;
    };

    assert.equal(data.skill.version, 1);
    versions.set(data.skill.id, data.skill.version);

    return data.skill;
  }

  // 1
  await t.test('creates isolated test accounts', async () => {
    owner = await makeSession('owner');
    other = await makeSession('other');
    withoutProfile = await makeSession('empty', false);

    assert.notEqual(owner.cookie, other.cookie);
  });

  // 2
  await t.test('requires authentication', async () => {
    const response = await request(path, 'GET');
    assert.equal(response.status, 401);
  });

  // 3
  await t.test('requires CSRF protection', async () => {
    const response = await request(
      path,
      'POST',
      owner,
      { name: 'React' },
      false,
    );

    assert.equal(response.status, 403);
  });

  // 4
  await t.test('requires an existing freelancer profile', async () => {
    const emptyList = await request(
      path,
      'GET',
      withoutProfile,
    );

    assert.equal(emptyList.status, 200);

    const data = await emptyList.json() as {
      skills: unknown[];
    };

    assert.deepEqual(data.skills, []);

    const create = await request(
      path,
      'POST',
      withoutProfile,
      { name: 'React' },
    );

    assert.equal(create.status, 409);
  });

  // 5
  await t.test('rejects invalid and privileged fields', async () => {
    const cases = [
      { name: '' },
      { name: '   ' },
      { name: '<script>alert(1)</script>' },
      { name: 'a'.repeat(81) },
      { name: 'React', profileId: other.id },
      { name: 'React', normalizedName: 'react' },
    ];

    for (const payload of cases) {
      const response = await request(
        path,
        'POST',
        owner,
        payload,
      );

      assert.equal(response.status, 400);
    }
  });

  // 6
  await t.test('creates and normalizes C++', async () => {
    const skill = await addSkill(owner, '  C++  ');

    assert.equal(skill.name, 'C++');
    assert.equal(skill.sortOrder, 0);
    assert.equal(skill.version, 1);

    skillIds.set('C++', skill.id);

    const saved = await prisma.profileSkill.findUnique({
      where: { id: skill.id },
      select: { normalizedName: true },
    });

    assert.equal(saved?.normalizedName, 'c++');
  });

  // 7
  await t.test('rejects case-insensitive duplicates', async () => {
    const response = await request(
      path,
      'POST',
      owner,
      { name: 'c++' },
    );

    assert.equal(response.status, 409);
  });

  // 8
  await t.test('supports technical skill names', async () => {
    const names = [
      '.NET',
      'Node.js',
      'UI/UX',
      'React Native',
    ];

    for (const name of names) {
      const skill = await addSkill(owner, name);
      skillIds.set(name, skill.id);
    }

    assert.equal(skillIds.size, 5);
  });

  // 9
  await t.test('normalizes duplicate technical names', async () => {
    const response = await request(
      path,
      'POST',
      owner,
      { name: 'NODE.JS' },
    );

    assert.equal(response.status, 409);
  });

  // 10
  await t.test('allows the same skill for another user', async () => {
    const skill = await addSkill(other, 'C++');

    otherSkillId = skill.id;
    assert.ok(otherSkillId);
  });

  // 11
  await t.test('lists only the owners skills', async () => {
    const response = await request(path, 'GET', owner);
    assert.equal(response.status, 200);

    const data = await response.json() as {
      skills: SkillRecord[];
    };

    assert.deepEqual(
      data.skills.map((item) => item.name),
      ['C++', '.NET', 'Node.js', 'UI/UX', 'React Native'],
    );

    assert.deepEqual(
      data.skills.map((item) => item.sortOrder),
      [0, 1, 2, 3, 4],
    );

    assert.deepEqual(
      data.skills.map((item) => item.version),
      [1, 1, 1, 1, 1],
    );

    assert.equal(data.skills.length, 5);
  });

  // 12
  await t.test('prevents cross-account modification', async () => {
    const ownerSkillId = skillIds.get('C++')!;

    const rename = await request(
      `${path}/${ownerSkillId}`,
      'PATCH',
      other,
      {
        name: 'Unauthorized Rename',
        version: versionOf(ownerSkillId),
      },
    );

    const remove = await request(
      `${path}/${ownerSkillId}`,
      'DELETE',
      other,
      { version: versionOf(ownerSkillId) },
    );

    assert.equal(rename.status, 404);
    assert.equal(remove.status, 404);
  });

  // 13
  await t.test('requires versions for skill mutations', async () => {
    const id = skillIds.get('C++')!;

    const rename = await request(
      `${path}/${id}`,
      'PATCH',
      owner,
      { name: 'C#' },
    );

    const remove = await request(
      `${path}/${id}`,
      'DELETE',
      owner,
    );

    const reorder = await request(
      `${path}/order`,
      'PUT',
      owner,
      { ids: [...skillIds.values()] },
    );

    assert.deepEqual(
      [
        rename.status,
        remove.status,
        reorder.status,
      ],
      [400, 400, 400],
    );
  });

  // 14
  await t.test('renames skills and checks collisions', async () => {
    const skillId = skillIds.get('C++')!;

    const renamed = await request(
      `${path}/${skillId}`,
      'PATCH',
      owner,
      {
        name: 'C#',
        version: versionOf(skillId),
      },
    );

    assert.equal(renamed.status, 200);

    const renamedData = await renamed.json() as {
      skill: SkillRecord;
    };

    assert.equal(renamedData.skill.name, 'C#');
    assert.equal(renamedData.skill.id, skillId);
    assert.equal(renamedData.skill.version, 2);

    versions.set(skillId, renamedData.skill.version);

    const nodeId = skillIds.get('Node.js')!;

    const collision = await request(
      `${path}/${nodeId}`,
      'PATCH',
      owner,
      {
        name: 'c#',
        version: versionOf(nodeId),
      },
    );

    assert.equal(collision.status, 409);

    const unchanged = await prisma.profileSkill.findUniqueOrThrow({
      where: { id: nodeId },
      select: { name: true, version: true },
    });

    assert.equal(unchanged.name, 'Node.js');
    assert.equal(unchanged.version, 1);
  });

  // 15
  await t.test('rejects stale skill edits and deletions', async () => {
    const skillId = skillIds.get('C++')!;
    const staleVersion = versionOf(skillId) - 1;

    const rename = await request(
      `${path}/${skillId}`,
      'PATCH',
      owner,
      {
        name: 'Outdated Rename',
        version: staleVersion,
      },
    );

    const remove = await request(
      `${path}/${skillId}`,
      'DELETE',
      owner,
      { version: staleVersion },
    );

    assert.equal(rename.status, 409);
    assert.equal(remove.status, 409);

    const renameError = await rename.json() as {
      code: string;
    };

    const deleteError = await remove.json() as {
      code: string;
    };

    assert.equal(renameError.code, 'STALE_VERSION');
    assert.equal(deleteError.code, 'STALE_VERSION');

    const saved = await prisma.profileSkill.findUniqueOrThrow({
      where: { id: skillId },
      select: {
        name: true,
        version: true,
      },
    });

    assert.equal(saved.name, 'C#');
    assert.equal(saved.version, versionOf(skillId));
  });

  // 16
  await t.test('reorders all skills atomically', async () => {
    const ids = [
      skillIds.get('React Native')!,
      skillIds.get('UI/UX')!,
      skillIds.get('Node.js')!,
      skillIds.get('.NET')!,
      skillIds.get('C++')!,
    ];

    const payload = orderPayload(ids);

    // Keep an outdated snapshot for the next test.
    lastOrderBeforeReorder = payload.items.map(
      (item) => ({ ...item }),
    );

    const response = await request(
      `${path}/order`,
      'PUT',
      owner,
      payload,
    );

    assert.equal(response.status, 200);

    const data = await response.json() as {
      skills: SkillRecord[];
    };

    assert.deepEqual(
      data.skills.map((item) => item.id),
      ids,
    );

    assert.deepEqual(
      data.skills.map((item) => item.sortOrder),
      [0, 1, 2, 3, 4],
    );

    for (const skill of data.skills) {
      const previousVersion = versionOf(skill.id);

      assert.equal(
        skill.version,
        previousVersion + 1,
      );

      versions.set(skill.id, skill.version);
    }

    lastOrderedIds = ids;
  });

  // 17
  await t.test('rejects stale reorders without partial updates', async () => {
    const outdated = await request(
      `${path}/order`,
      'PUT',
      owner,
      {
        items: lastOrderBeforeReorder,
      },
    );

    assert.equal(outdated.status, 409);

    const error = await outdated.json() as {
      code: string;
    };

    assert.equal(error.code, 'STALE_VERSION');

    const list = await request(path, 'GET', owner);
    assert.equal(list.status, 200);

    const data = await list.json() as {
      skills: SkillRecord[];
    };

    assert.deepEqual(
      data.skills.map((item) => item.id),
      lastOrderedIds,
    );

    for (const skill of data.skills) {
      assert.equal(skill.version, versionOf(skill.id));
    }
  });

  // 18
  await t.test('rejects invalid skill orders', async () => {
    const id = skillIds.get('C++')!;

    const incomplete = await request(
      `${path}/order`,
      'PUT',
      owner,
      orderPayload([id]),
    );

    assert.equal(incomplete.status, 409);

    const duplicate = await request(
      `${path}/order`,
      'PUT',
      owner,
      {
        items: [
          { id, version: versionOf(id) },
          { id, version: versionOf(id) },
        ],
      },
    );

    assert.equal(duplicate.status, 400);

    const foreign = await request(
      `${path}/order`,
      'PUT',
      owner,
      orderPayload([otherSkillId]),
    );

    assert.equal(foreign.status, 409);
  });

  // 19
  await t.test('blocks changes to published profiles', async () => {
    const complete = await request(
      '/api/freelancer/onboarding/complete',
      'POST',
      owner,
    );

    assert.equal(complete.status, 200);

    const published = await request(
      '/api/freelancer/profile/publish',
      'POST',
      owner,
    );

    assert.equal(published.status, 200);

    const skillId = skillIds.get('C++')!;

    const create = await request(
      path,
      'POST',
      owner,
      { name: 'Python' },
    );

    const rename = await request(
      `${path}/${skillId}`,
      'PATCH',
      owner,
      {
        name: 'Python',
        version: versionOf(skillId),
      },
    );

    const remove = await request(
      `${path}/${skillId}`,
      'DELETE',
      owner,
      { version: versionOf(skillId) },
    );

    const reorder = await request(
      `${path}/order`,
      'PUT',
      owner,
      orderPayload([...skillIds.values()]),
    );

    assert.deepEqual(
      [
        create.status,
        rename.status,
        remove.status,
        reorder.status,
      ],
      [409, 409, 409, 409],
    );

    const stillReadable = await request(
      path,
      'GET',
      owner,
    );

    assert.equal(stillReadable.status, 200);
  });

  // 20
  await t.test('unpublishes and allows deletion', async () => {
    const unpublish = await request(
      '/api/freelancer/profile/unpublish',
      'POST',
      owner,
    );

    assert.equal(unpublish.status, 200);

    const skillId = skillIds.get('C++')!;

    const removed = await request(
      `${path}/${skillId}`,
      'DELETE',
      owner,
      { version: versionOf(skillId) },
    );

    assert.equal(removed.status, 204);

    const profile = await prisma.freelancerProfile.findUnique({
      where: { userId: owner.id },
      select: {
        onboardingCompletedAt: true,
      },
    });

    assert.equal(
      profile?.onboardingCompletedAt,
      null,
    );
  });

  // 21
  await t.test('preserves other freelancer skills', async () => {
    const response = await request(path, 'GET', other);
    assert.equal(response.status, 200);

    const data = await response.json() as {
      skills: SkillRecord[];
    };

    assert.deepEqual(
      data.skills.map((item) => item.id),
      [otherSkillId],
    );

    assert.equal(data.skills[0]?.name, 'C++');
    assert.equal(data.skills[0]?.version, 1);

    const ownerSkills = await request(
      path,
      'GET',
      owner,
    );

    assert.equal(ownerSkills.status, 200);

    const ownerData = await ownerSkills.json() as {
      skills: SkillRecord[];
    };

    assert.equal(ownerData.skills.length, 4);
  });
});
