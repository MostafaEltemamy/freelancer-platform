import type {
  FormEvent,
  ReactNode,
} from 'react';

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

import {
  ProjectImageManager,
} from './ProjectImageManager';

import {
  projectMediaApi,
} from './project-media.api';

import type {
  ProjectMediaRecord,
} from './project-media.api';

import type {
  VersionedRecord,
} from './portfolio.types';

expect.extend(matchers);

// Keep these tests focused on the gallery manager.
// SortablePortfolioList already has separate drag tests.
vi.mock('./SortablePortfolioList', () => ({
  SortablePortfolioList: ({
    items,
    disabled,
    renderItem,
    onReorder,
  }: {
    items: readonly ProjectMediaRecord[];
    disabled?: boolean;
    renderItem: (
      item: ProjectMediaRecord,
      index: number,
    ) => ReactNode;
    onReorder: (
      items: VersionedRecord[],
    ) => Promise<boolean>;
  }) => (
    <div role="list">
      <button
        type="button"
        disabled={disabled || items.length < 2}
        onClick={() => {
          void onReorder(
            [...items].reverse().map((item) => ({
              id: item.id,
              version: item.version,
            })),
          );
        }}
      >
        Simulate gallery drag
      </button>

      {items.map((item, index) => (
        <div role="listitem" key={item.id}>
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
  },
}));

const projectId =
  '11111111-1111-4111-8111-111111111111';

const firstImage: ProjectMediaRecord = {
  id: '22222222-2222-4222-8222-222222222222',
  projectId,
  originalFilename: 'alpha.png',
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
  version: 2,
  createdAt: '2026-11-09T08:00:00.000Z',
  updatedAt: '2026-11-09T08:00:00.000Z',
  readyAt: '2026-11-09T08:00:00.000Z',
  previewUrl: 'https://example.test/alpha',
};

const secondImage: ProjectMediaRecord = {
  ...firstImage,
  id: '33333333-3333-4333-8333-333333333333',
  originalFilename: 'beta.png',
  isCover: false,
  sortOrder: 1,
  version: 4,
  previewUrl: 'https://example.test/beta',
};

function renderManager(
  disabled = false,
) {
  return render(
    <ProjectImageManager
      projectId={projectId}
      disabled={disabled}
    />,
  );
}

beforeEach(() => {
  vi.resetAllMocks();

  vi.mocked(projectMediaApi.list).mockResolvedValue({
    media: [firstImage, secondImage],
  });
});

test('selects a new cover and reloads current versions', async () => {
  vi.mocked(projectMediaApi.list)
    .mockResolvedValueOnce({
      media: [firstImage, secondImage],
    })
    .mockResolvedValueOnce({
      media: [
        {
          ...firstImage,
          isCover: false,
          version: 3,
        },
        {
          ...secondImage,
          isCover: true,
          version: 5,
        },
      ],
    });

  vi.mocked(projectMediaApi.setCover)
    .mockResolvedValue({
      media: {
        id: secondImage.id,
        version: 5,
        isCover: true,
      },
    });

  renderManager();

  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Set beta.png as cover',
    }),
  );

  await waitFor(() => {
    expect(
      projectMediaApi.setCover,
    ).toHaveBeenCalledWith(
      projectId,
      secondImage.id,
      4,
    );
  });

  expect(
    await screen.findByText(
      'Project cover updated successfully.',
    ),
  ).toBeInTheDocument();

  expect(
    screen.getAllByText('Cover image'),
  ).toHaveLength(1);

  expect(
    projectMediaApi.list,
  ).toHaveBeenCalledTimes(2);
});

test('saves alternative text and caption with the current version', async () => {
  vi.mocked(projectMediaApi.list)
    .mockResolvedValueOnce({
      media: [firstImage],
    })
    .mockResolvedValueOnce({
      media: [{
        ...firstImage,
        version: 3,
        altText: 'Brand presentation mockup',
        caption: 'Client-approved deliverables',
      }],
    });

  vi.mocked(projectMediaApi.updateDetails)
    .mockResolvedValue({
      media: {
        id: firstImage.id,
        version: 3,
        altText: 'Brand presentation mockup',
        caption: 'Client-approved deliverables',
      },
    });

  const onProjectSubmit = vi.fn(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    },
  );

  render(
    <form onSubmit={onProjectSubmit}>
      <ProjectImageManager
        projectId={projectId}
        disabled={false}
      />
    </form>,
  );

  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Edit description for alpha.png',
    }),
  );

  fireEvent.change(
    screen.getByRole('textbox', {
      name: 'Image alternative text',
    }),
    {
      target: {
        value: '  Brand presentation mockup  ',
      },
    },
  );

  fireEvent.change(
    screen.getByRole('textbox', {
      name: 'Image caption',
    }),
    {
      target: {
        value: '  Client-approved deliverables  ',
      },
    },
  );

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Save image description',
    }),
  );

  await waitFor(() => {
    expect(
      projectMediaApi.updateDetails,
    ).toHaveBeenCalledWith(
      projectId,
      firstImage.id,
      {
        version: 2,
        altText: 'Brand presentation mockup',
        caption: 'Client-approved deliverables',
      },
    );
  });

  expect(
    await screen.findByText(
      'Image description saved successfully.',
    ),
  ).toBeInTheDocument();

  // Image actions must not submit the parent project form.
  expect(onProjectSubmit).not.toHaveBeenCalled();
});

test('sends the complete image order after dragging', async () => {
  vi.mocked(projectMediaApi.list)
    .mockResolvedValueOnce({
      media: [firstImage, secondImage],
    })
    .mockResolvedValueOnce({
      media: [
        {
          ...secondImage,
          sortOrder: 0,
          version: 5,
        },
        {
          ...firstImage,
          sortOrder: 1,
          version: 3,
        },
      ],
    });

  vi.mocked(projectMediaApi.reorder)
    .mockResolvedValue({
      order: {
        items: [
          {
            id: secondImage.id,
            version: 5,
            sortOrder: 0,
          },
          {
            id: firstImage.id,
            version: 3,
            sortOrder: 1,
          },
        ],
      },
    });

  renderManager();

  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Simulate gallery drag',
    }),
  );

  await waitFor(() => {
    expect(
      projectMediaApi.reorder,
    ).toHaveBeenCalledWith(
      projectId,
      [
        {
          id: secondImage.id,
          version: 4,
        },
        {
          id: firstImage.id,
          version: 2,
        },
      ],
    );
  });

  expect(
    await screen.findByText(
      'Gallery order updated successfully.',
    ),
  ).toBeInTheDocument();
});

test('preserves an unsaved description after a version conflict', async () => {
  vi.mocked(projectMediaApi.updateDetails)
    .mockRejectedValue(
      new ApiError(
        'The image was changed in another tab.',
        409,
        'STALE_MEDIA_VERSION',
      ),
    );

  renderManager();

  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Edit description for alpha.png',
    }),
  );

  const input = screen.getByRole('textbox', {
    name: 'Image alternative text',
  });

  fireEvent.change(input, {
    target: {
      value: 'Important unsaved description',
    },
  });

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Save image description',
    }),
  );

  expect(
    await screen.findByRole('alert'),
  ).toHaveTextContent(
    'Your gallery was changed in another tab.',
  );

  expect(input).toHaveValue(
    'Important unsaved description',
  );

  expect(
    screen.getByRole('button', {
      name: 'Save image description',
    }),
  ).toBeDisabled();

  expect(
    screen.getByRole('button', {
      name: 'Refresh images',
    }),
  ).toBeDisabled();

  // No automatic reload that could discard the draft.
  expect(projectMediaApi.list)
    .toHaveBeenCalledTimes(1);
});

test('keeps published project galleries read-only', async () => {
  renderManager(true);

  await screen.findByRole('img', {
    name: 'alpha.png',
  });

  expect(
    screen.queryByRole('button', {
      name: 'Set beta.png as cover',
    }),
  ).not.toBeInTheDocument();

  expect(
    screen.queryByRole('button', {
      name: 'Edit description for alpha.png',
    }),
  ).not.toBeInTheDocument();

  expect(
    screen.queryByLabelText('Choose project image'),
  ).not.toBeInTheDocument();

  expect(
    screen.getByRole('button', {
      name: 'Simulate gallery drag',
    }),
  ).toBeDisabled();
});
