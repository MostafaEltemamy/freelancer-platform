import { beforeEach, expect, test, vi } from 'vitest';

import { apiRequest } from './api-client';
import { authApi } from '../features/auth/auth.api';
import { protectedWrite } from './protected-write';

vi.mock('./api-client', () => ({
  apiRequest: vi.fn(),
}));

vi.mock('../features/auth/auth.api', () => ({
  authApi: {
    getCsrfToken: vi.fn(),
  },
}));

beforeEach(() => {
  vi.resetAllMocks();

  vi.mocked(authApi.getCsrfToken)
    .mockResolvedValue('test-csrf-token');
});

test('includes CSRF and JSON body in PUT requests', async () => {
  await protectedWrite(
    '/api/freelancer/projects/order',
    'PUT',
    { ids: ['first', 'second'] },
  );

  expect(authApi.getCsrfToken).toHaveBeenCalledTimes(1);

  expect(apiRequest).toHaveBeenCalledWith(
    '/api/freelancer/projects/order',
    {
      method: 'PUT',
      headers: {
        'X-CSRF-Token': 'test-csrf-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ids: ['first', 'second'],
      }),
    },
  );
});

test('supports CSRF-protected DELETE without a body', async () => {
  await protectedWrite(
    '/api/freelancer/skills/test-id',
    'DELETE',
  );

  expect(apiRequest).toHaveBeenCalledWith(
    '/api/freelancer/skills/test-id',
    {
      method: 'DELETE',
      headers: {
        'X-CSRF-Token': 'test-csrf-token',
      },
    },
  );
});

test('does not send mutations when CSRF retrieval fails', async () => {
  vi.mocked(authApi.getCsrfToken).mockRejectedValue(
    new Error('Session unavailable'),
  );

  await expect(
    protectedWrite(
      '/api/freelancer/projects/order',
      'PUT',
      { ids: ['first'] },
    ),
  ).rejects.toThrow('Session unavailable');

  expect(apiRequest).not.toHaveBeenCalled();
});
