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

import { ProjectImageManager } from './ProjectImageManager';
import { projectMediaApi } from './project-media.api';

import type {
  ProjectMediaRecord,
} from './project-media.api';

expect.extend(matchers);

vi.mock('./project-media.api', () => ({
  projectMediaApi: {
    list: vi.fn(),
    uploadImage: vi.fn(),
  },
}));

const projectId =
  '11111111-1111-4111-8111-111111111111';

const readyImage: ProjectMediaRecord = {
  id: '22222222-2222-4222-8222-222222222222',
  projectId,
  originalFilename: 'portfolio.png',
  mimeType: 'image/png',
  fileSizeBytes: 1024,
  kind: 'IMAGE',
  status: 'READY',
  isCover: false,
  sortOrder: 0,
  sectionId: null,
  width: 800,
  height: 600,
  altText: null,
  caption: null,
  version: 2,
  createdAt: '2026-11-08T10:00:00.000Z',
  updatedAt: '2026-11-08T10:00:00.000Z',
  readyAt: '2026-11-08T10:00:00.000Z',
  previewUrl: 'https://storage.example.test/preview',
};

beforeEach(() => {
  vi.resetAllMocks();

  vi.mocked(projectMediaApi.list).mockResolvedValue({
    media: [],
  });
});

test('displays the empty gallery', async () => {
  render(
    <ProjectImageManager
      projectId={projectId}
      disabled={false}
    />,
  );

  expect(
    await screen.findByText(/No images yet/i),
  ).toBeInTheDocument();

  expect(
    screen.getByLabelText('Choose project image'),
  ).toBeEnabled();
});

test('displays a verified image preview', async () => {
  vi.mocked(projectMediaApi.list).mockResolvedValue({
    media: [readyImage],
  });

  render(
    <ProjectImageManager
      projectId={projectId}
      disabled={false}
    />,
  );

  const image = await screen.findByRole('img', {
    name: 'portfolio.png',
  });

  expect(image).toHaveAttribute(
    'src',
    readyImage.previewUrl,
  );
});

test('does not display pending uploads as images', async () => {
  vi.mocked(projectMediaApi.list).mockResolvedValue({
    media: [
      {
        ...readyImage,
        status: 'PENDING',
        previewUrl: null,
      },
    ],
  });

  render(
    <ProjectImageManager
      projectId={projectId}
      disabled={false}
    />,
  );

  expect(
    await screen.findByText(/portfolio.png — Pending/i),
  ).toBeInTheDocument();

  expect(
    screen.queryByRole('img', {
      name: 'portfolio.png',
    }),
  ).not.toBeInTheDocument();
});

test('rejects an unsupported file before uploading', async () => {
  render(
    <ProjectImageManager
      projectId={projectId}
      disabled={false}
    />,
  );

  await screen.findByText(/No images yet/i);

  const file = new File(
    ['not an image'],
    'unsafe.svg',
    { type: 'image/svg+xml' },
  );

  fireEvent.change(
    screen.getByLabelText('Choose project image'),
    {
      target: {
        files: [file],
      },
    },
  );

  expect(
    await screen.findByRole('alert'),
  ).toHaveTextContent(
    'Choose a JPEG, PNG or WebP image.',
  );

  expect(
    projectMediaApi.uploadImage,
  ).not.toHaveBeenCalled();
});

test('refreshes the gallery after uploading an image', async () => {
  vi.mocked(projectMediaApi.list)
    .mockResolvedValueOnce({
      media: [],
    })
    .mockResolvedValueOnce({
      media: [readyImage],
    });

  vi.mocked(projectMediaApi.uploadImage).mockResolvedValue({
    media: readyImage,
  });

  render(
    <ProjectImageManager
      projectId={projectId}
      disabled={false}
    />,
  );

  await screen.findByText(/No images yet/i);

  const file = new File(
    ['example image'],
    'new-photo.png',
    { type: 'image/png' },
  );

  fireEvent.change(
    screen.getByLabelText('Choose project image'),
    {
      target: {
        files: [file],
      },
    },
  );

  await waitFor(() => {
    expect(
      projectMediaApi.uploadImage,
    ).toHaveBeenCalledWith(
      projectId,
      file,
      expect.any(Function),
    );
  });

  expect(
    await screen.findByRole('img', {
      name: 'portfolio.png',
    }),
  ).toBeInTheDocument();

  expect(
    await screen.findByText(
      'Image uploaded successfully.',
    ),
  ).toBeInTheDocument();
});
