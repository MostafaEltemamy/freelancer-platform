import { prisma } from '../../database/prisma.js';
import type {Prisma} from '../../generated/prisma/client.js';
import {withEditablePortfolio} from './portfolio-guard.js';
import {emptyProjectContent} from './project-content.schemas.js';

import type {
  CreateProjectInput,
  UpdateProjectInput,
  ReorderProjectsInput,
} from './project.schemas.js';

const MAX_PROJECTS = 100;

// Lightweight selection used for project listings.
// Do not select large custom-content JSON documents here.
const PROJECT_LIST_SELECT = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  description: true,
  role: true,
  projectUrl: true,
  sourceUrl: true,
  technologies: true,
  startedOn: true,
  endedOn: true,
  visibility: true,
  sortOrder: true,
  isFeatured: true,
  createdAt: true,
  updatedAt: true,
  version: true,
} as const;

// Full selection used when opening or saving a project.
const PROJECT_DETAIL_SELECT = {
  ...PROJECT_LIST_SELECT,
  content: true,
} as const;

export class ProjectNotFoundError extends Error {
  constructor() {
    super('Portfolio project not found.');
    this.name = 'ProjectNotFoundError';
  }
}

export class ProjectLimitError extends Error {
  constructor() {
    super('Maximum of 100 portfolio projects reached.');
    this.name = 'ProjectLimitError';
  }
}

export class ProjectOrderError extends Error {
  constructor() {
    super(
      'Project order must include every project exactly once.',
    );
    this.name = 'ProjectOrderError';
  }
}

export class ProjectDateRangeError extends Error {
  constructor() {
    super(
      'Project end date cannot precede its start date.',
    );
    this.name = 'ProjectDateRangeError';
  }
}

export class ProjectVersionConflictError extends Error {
  constructor() {
    super(
      'This project has changed since you opened it. ' +
      'Reload the latest version before saving.',
    );
    this.name = 'ProjectVersionConflictError';
  }
}

function toDate(
  value: string | null | undefined,
): Date | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return new Date(`${value}T00:00:00.000Z`);
}

function assertValidDateRange(
  startedOn: Date | null | undefined,
  endedOn: Date | null | undefined,
): void {
  if (
    startedOn &&
    endedOn &&
    endedOn.getTime() < startedOn.getTime()
  ) {
    throw new ProjectDateRangeError();
  }
}

/**
 * Convert validated API input into Prisma-compatible data.
 *
 * The API schema already validated custom content.
 * Prisma InputJsonValue is appropriate for this JSONB field.
 *
 * No client-supplied record version is stored here.
 */
function projectData<
  T extends Partial<CreateProjectInput>
>(input: T) {
  return {
    ...input,

    startedOn: toDate(input.startedOn),
    endedOn: toDate(input.endedOn),

    ...(input.content === undefined
      ? {}
      : {
          content: input.content as Prisma.InputJsonValue,
        }),
  };
}

/**
 * Existing projects may have SQL NULL in their
 * custom-content column.
 *
 * Return an empty content document for the editor
 * without rewriting the database record.
 */
function withNormalizedContent<
  T extends { content: unknown }
>(project: T) {
  return {
    ...project,
    content:
      project.content === null
        ? emptyProjectContent()
        : project.content,
  };
}

/**
 * List the authenticated owner's projects.
 *
 * Important: custom content is intentionally excluded
 * to avoid sending up to 100 large JSON documents.
 */
export async function listMyProjects(userId: string) {
  const profile =
    await prisma.freelancerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

  if (!profile) {
    return [];
  }

  return prisma.portfolioProject.findMany({
    where: { profileId: profile.id },
    select: PROJECT_LIST_SELECT,
    orderBy: [
      { sortOrder: 'asc' },
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
    take: MAX_PROJECTS,
  });
}

/**
 * Retrieve one full project.
 *
 * Ownership is verified through the authenticated
 * user's freelancer profile. Foreign projects return
 * 404 just like nonexistent projects.
 *
 * This read is available for drafts and published profiles.
 */
export async function getMyProject(
  userId: string,
  projectId: string,
) {
  const profile =
    await prisma.freelancerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

  if (!profile) {
    throw new ProjectNotFoundError();
  }

  const project =
    await prisma.portfolioProject.findFirst({
      where: {
        id: projectId,
        profileId: profile.id,
      },
      select: PROJECT_DETAIL_SELECT,
    });

  if (!project) {
    throw new ProjectNotFoundError();
  }

  return withNormalizedContent(project);
}

/**
 * Create a new project.
 *
 * Older clients may omit custom content entirely.
 * Those records remain compatible with the new API.
 */
export async function createMyProject(
  userId: string,
  input: CreateProjectInput,
) {
  return withEditablePortfolio(
    userId,
    async (tx, profileId) => {
      const count = await tx.portfolioProject.count({
        where: { profileId },
      });

      if (count >= MAX_PROJECTS) {
        throw new ProjectLimitError();
      }

      const data = projectData(input);

      assertValidDateRange(
        data.startedOn,
        data.endedOn,
      );

      const project = await tx.portfolioProject.create({
        data: {
          ...data,
          profileId,
        },
        select: PROJECT_DETAIL_SELECT,
      });

      return withNormalizedContent(project);
    },
  );
}

/**
 * Update one owned project.
 *
 * The update is conditional on the expected version.
 * A successful mutation increments the version exactly
 * once and invalidates previous profile validation.
 */
export async function updateMyProject(
  userId: string,
  projectId: string,
  input: UpdateProjectInput,
) {
  return withEditablePortfolio(
    userId,
    async (tx, profileId) => {
      const existing =
        await tx.portfolioProject.findFirst({
          where: {
            id: projectId,
            profileId,
          },
          select: {
            version: true,
            startedOn: true,
            endedOn: true,
          },
        });

      if (!existing) {
        throw new ProjectNotFoundError();
      }

      if (existing.version !== input.version) {
        throw new ProjectVersionConflictError();
      }

      // Never trust the client's version as ordinary data.
      const { version, ...changes } = input;

      const data = projectData(changes);

      const startedOn =
        data.startedOn === undefined
          ? existing.startedOn
          : data.startedOn;

      const endedOn =
        data.endedOn === undefined
          ? existing.endedOn
          : data.endedOn;

      assertValidDateRange(
        startedOn,
        endedOn,
      );

      const updated =
        await tx.portfolioProject.updateMany({
          where: {
            id: projectId,
            profileId,
            version,
          },
          data: {
            ...data,
            version: {
              increment: 1,
            },
          },
        });

      if (updated.count !== 1) {
        throw new ProjectVersionConflictError();
      }

      const project =
        await tx.portfolioProject.findUniqueOrThrow({
          where: { id: projectId },
          select: PROJECT_DETAIL_SELECT,
        });

      return withNormalizedContent(project);
    },
  );
}

/**
 * Delete an owned project using its current version.
 */
export async function deleteMyProject(
  userId: string,
  projectId: string,
  expectedVersion: number,
) {
  return withEditablePortfolio(
    userId,
    async (tx, profileId) => {
      const existing =
        await tx.portfolioProject.findFirst({
          where: {
            id: projectId,
            profileId,
          },
          select: { version: true },
        });

      if (!existing) {
        throw new ProjectNotFoundError();
      }

      if (existing.version !== expectedVersion) {
        throw new ProjectVersionConflictError();
      }

      const deleted =
        await tx.portfolioProject.deleteMany({
          where: {
            id: projectId,
            profileId,
            version: expectedVersion,
          },
        });

      if (deleted.count !== 1) {
        throw new ProjectVersionConflictError();
      }

      return { id: projectId };
    },
  );
}

/**
 * Reorder all owned projects in one transaction.
 *
 * Reordering doesn't need to load or modify the
 * project's custom JSON document.
 */
export async function reorderMyProjects(
  userId: string,
  input: ReorderProjectsInput,
) {
  return withEditablePortfolio(
    userId,
    async (tx, profileId) => {
      const existing =
        await tx.portfolioProject.findMany({
          where: { profileId },
          select: {
            id: true,
            version: true,
          },
        });

      const current = new Map(
        existing.map((project) => [
          project.id,
          project.version,
        ]),
      );

      if (
        existing.length !== input.items.length ||
        input.items.some(
          (item) => !current.has(item.id),
        )
      ) {
        throw new ProjectOrderError();
      }

      if (
        input.items.some(
          (item) =>
            current.get(item.id) !== item.version,
        )
      ) {
        throw new ProjectVersionConflictError();
      }

      // All updates are rolled back if one fails.
      for (
        let index = 0;
        index < input.items.length;
        index++
      ) {
        const item = input.items[index]!;

        const result =
          await tx.portfolioProject.updateMany({
            where: {
              id: item.id,
              profileId,
              version: item.version,
            },
            data: {
              sortOrder: index,
              version: {
                increment: 1,
              },
            },
          });

        if (result.count !== 1) {
          throw new ProjectVersionConflictError();
        }
      }

      return tx.portfolioProject.findMany({
        where: { profileId },
        select: PROJECT_LIST_SELECT,
        orderBy: [
          { sortOrder: 'asc' },
          { id: 'asc' },
        ],
      });
    },
  );
}
