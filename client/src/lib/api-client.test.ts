import {
  afterEach,
  expect,
  test,
  vi,
} from 'vitest';

import { apiRequest } from './api-client';

afterEach(() => {
  vi.unstubAllGlobals();
});

test('preserves the server stale-version error code', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        error: 'This record has changed.',
        code: 'STALE_VERSION',
      }),
      {
        status: 409,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    ),
  );

  vi.stubGlobal('fetch', fetchMock);

  await expect(
    apiRequest('/api/freelancer/projects'),
  ).rejects.toMatchObject({
    name: 'ApiError',
    status: 409,
    code: 'STALE_VERSION',
    message: 'This record has changed.',
  });

  expect(fetchMock).toHaveBeenCalledOnce();
});

test('does not misclassify an ordinary conflict', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        error: 'This skill already exists.',
      }),
      {
        status: 409,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    ),
  );

  vi.stubGlobal('fetch', fetchMock);

  await expect(
    apiRequest('/api/freelancer/skills'),
  ).rejects.toMatchObject({
    name: 'ApiError',
    status: 409,
    code: undefined,
    message: 'This skill already exists.',
  });
});
