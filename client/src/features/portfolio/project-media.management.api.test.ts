import {
  beforeEach,
  expect,
  test,
  vi,
} from 'vitest';

import {
  protectedWrite,
} from '../../lib/protected-write';

import {
  projectMediaApi,
} from './project-media.api';

vi.mock('../../lib/protected-write', () => ({
  protectedWrite: vi.fn(),
}));

const projectId =
  '11111111-1111-4111-8111-111111111111';

const mediaId =
  '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.resetAllMocks();
});

test('sends versioned image descriptions', async () => {
  await projectMediaApi.updateDetails(
    projectId,
    mediaId,
    {
      version: 3,
      altText: 'Product packaging design',
      caption: 'Final client-approved packaging',
    },
  );

  expect(protectedWrite).toHaveBeenCalledWith(
    `/api/freelancer/projects/${projectId}` +
      `/media/${mediaId}/details`,
    'PATCH',
    {
      version: 3,
      altText: 'Product packaging design',
      caption: 'Final client-approved packaging',
    },
  );
});

test('sends the current version when selecting a cover', async () => {
  await projectMediaApi.setCover(
    projectId,
    mediaId,
    4,
  );

  expect(protectedWrite).toHaveBeenCalledWith(
    `/api/freelancer/projects/${projectId}` +
      `/media/${mediaId}/cover`,
    'PUT',
    {
      version: 4,
    },
  );
});

test('sends complete versioned gallery ordering', async () => {
  const items = [
    {
      id: mediaId,
      version: 2,
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      version: 5,
    },
  ];

  await projectMediaApi.reorder(
    projectId,
    items,
  );

  expect(protectedWrite).toHaveBeenCalledWith(
    `/api/freelancer/projects/${projectId}/media/order`,
    'PUT',
    {
      items,
    },
  );
});
