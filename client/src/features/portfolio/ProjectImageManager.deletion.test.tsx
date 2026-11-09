import type { ReactNode } from 'react';

import {
  beforeEach,
  expect,
  test,
  vi,
} from 'vitest';

import * as matchers from '@testing-library/jest-dom/matchers';

import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

import { ApiError } from '../../lib/api-client';
import { ProjectImageManager } from './ProjectImageManager';
import { projectMediaApi } from './project-media.api';

import type {ProjectMediaRecord} from './project-media.api';

expect.extend(matchers);

// Sorting is tested independently.
vi.mock('./SortablePortfolioList', () => ({
  SortablePortfolioList: ({
    items,
    renderItem,
  }: {
    items: readonly ProjectMediaRecord[];
    renderItem: (
      item: ProjectMediaRecord,
      index: number,
    ) => ReactNode;
  }) => (
    <div>
      {items.map((item, index) => (
        <div key={item.id}>
          {renderItem(item, index)}
        </div>
      ))}
    </div>
  ),
}));

vi.mock('./project-media.api', () => ({
  projectMediaApi: {
    list: vi.fn(),
    uploadImage: vi.fn(),
    updateDetails: vi.fn(),
    setCover: vi.fn(),
    reorder: vi.fn(),
    deleteImage: vi.fn(),
  },
}));

const projectId =
  '11111111-1111-4111-8111-111111111111';

const cover: ProjectMediaRecord = {
  id: '22222222-2222-4222-8222-222222222222',
  projectId,
  originalFilename: 'cover.png',
  mimeType: 'image/png',
  fileSizeBytes: 1024,
  kind: 'IMAGE',
  status: 'READY',
  isCover: true,
  sortOrder: 0,
  sectionId: null,
  width: 800,
  height: 600,
  altText: null,
  caption: null,
  version: 3,
  createdAt: '2026-11-09T08:00:00.000Z',
  updatedAt: '2026-11-09T08:00:00.000Z',
  readyAt: '2026-11-09T08:00:00.000Z',
  previewUrl: 'https://example.test/cover',
};

const second: ProjectMediaRecord = {
  ...cover,
  id: '33333333-3333-4333-8333-333333333333',
  originalFilename: 'second.png',
  isCover: false,
  version: 5,
  sortOrder: 1,
  previewUrl: 'https://example.test/second',
};

beforeEach(() => {
  vi.resetAllMocks();

  vi.mocked(projectMediaApi.list).mockResolvedValue({
    media: [cover, second],
  });
});

test('requires explicit confirmation before deleting a cover', async () => {
  render(
    <ProjectImageManager
      projectId={projectId}
      disabled={false}
    />,
  );

  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Delete cover.png',
    }),
  );

  expect(
    screen.getByText('Delete the project cover?'),
  ).toBeInTheDocument();

  expect(
    screen.getByText(/no cover until/i),
  ).toBeInTheDocument();

  expect(projectMediaApi.deleteImage)
    .not.toHaveBeenCalled();

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Keep image',
    }),
  );

  expect(
    screen.queryByRole('button', {
      name: 'Yes, delete image',
    }),
  ).not.toBeInTheDocument();

  expect(projectMediaApi.deleteImage)
    .not.toHaveBeenCalled();
});

test('deletes using the current version and refreshes the gallery', async () => {
  vi.mocked(projectMediaApi.list)
    .mockResolvedValueOnce({
      media: [cover, second],
    })
    .mockResolvedValueOnce({
      media: [cover],
    });

  vi.mocked(projectMediaApi.deleteImage)
    .mockResolvedValue({
      deleted: {
        id: second.id,
      },
    });

  render(
    <ProjectImageManager
      projectId={projectId}
      disabled={false}
    />,
  );

  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Delete second.png',
    }),
  );

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Yes, delete image',
    }),
  );

  await waitFor(() => {
    expect(projectMediaApi.deleteImage)
      .toHaveBeenCalledWith(
        projectId,
        second.id,
        5,
      );
  });

  expect(
    await screen.findByText(
      /Storage cleanup has been scheduled/,
    ),
  ).toBeInTheDocument();

  expect(
    screen.queryByRole('button', {
      name: 'Delete second.png',
    }),
  ).not.toBeInTheDocument();

  expect(projectMediaApi.list)
    .toHaveBeenCalledTimes(2);
});

test('can remove a pending upload', async () => {
  const pending: ProjectMediaRecord = {
    ...second,
    status: 'PENDING',
    version: 1,
    readyAt: null,
    previewUrl: null,
  };

  vi.mocked(projectMediaApi.list)
    .mockResolvedValueOnce({
      media: [pending],
    })
    .mockResolvedValueOnce({
      media: [],
    });

  vi.mocked(projectMediaApi.deleteImage)
    .mockResolvedValue({
      deleted: { id: pending.id },
    });

  render(
    <ProjectImageManager
      projectId={projectId}
      disabled={false}
    />,
  );

  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Delete second.png',
    }),
  );

  expect(
    screen.getByText(/has not finished/i),
  ).toBeInTheDocument();

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Yes, delete image',
    }),
  );

  await waitFor(() => {
    expect(projectMediaApi.deleteImage)
      .toHaveBeenCalledWith(
        projectId,
        pending.id,
        1,
      );
  });

  expect(
    await screen.findByText(/No images yet/i),
  ).toBeInTheDocument();
});

test('does not retry stale deletion and permits recovery', async () => {
  vi.mocked(projectMediaApi.deleteImage)
    .mockRejectedValue(
      new ApiError(
        'The image has changed.',
        409,
        'STALE_MEDIA_VERSION',
      ),
    );

  render(
    <ProjectImageManager
      projectId={projectId}
      disabled={false}
    />,
  );

  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Delete second.png',
    }),
  );

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Yes, delete image',
    }),
  );

  expect(
    await screen.findByRole('alert'),
  ).toHaveTextContent(/changed in another tab/i);

  expect(
    screen.getByRole('button', {
      name: 'Yes, delete image',
    }),
  ).toBeDisabled();

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Keep image',
    }),
  );

  expect(
    screen.getByRole('button', {
      name: 'Refresh images',
    }),
  ).toBeEnabled();

  expect(projectMediaApi.deleteImage)
    .toHaveBeenCalledTimes(1);
});

test('does not show Delete controls in read-only mode', async () => {
  render(
    <ProjectImageManager
      projectId={projectId}
      disabled
    />,
  );

  expect(
    await screen.findByRole('img', {
      name: 'cover.png',
    }),
  ).toBeInTheDocument();

  expect(
    screen.queryByRole('button', {
      name: 'Delete cover.png',
    }),
  ).not.toBeInTheDocument();

  expect(
    screen.queryByRole('button', {
      name: 'Delete second.png',
    }),
  ).not.toBeInTheDocument();
});
