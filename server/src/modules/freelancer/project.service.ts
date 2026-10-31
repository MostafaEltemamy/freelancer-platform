import { prisma } from '../../database/prisma.js';

import {
  withEditablePortfolio,
} from './portfolio-guard.js';

import type {
  CreateProjectInput,
  UpdateProjectInput,
  ReorderProjectsInput,
} from './project.schemas.js';

const MAX_PROJECTS = 100;

const PROJECT_SELECT = {
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
    super('Project order must include every project exactly once.');
    this.name = 'ProjectOrderError';
  }
}

export class ProjectDateRangeError extends Error {
  constructor() {
    super('Project end date cannot precede its start date.');
    this.name = 'ProjectDateRangeError';
  }
}

function toDate(
  value: string | null | undefined,
): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;

  return new Date(`${value}T00:00:00.000Z`);
}

function assertValidDateRange(
  startedOn: Date | null | undefined,
  endedOn: Date | null | undefined,
) {
  if (
    startedOn &&
    endedOn &&
    endedOn.getTime() < startedOn.getTime()
  ) {
    throw new ProjectDateRangeError();
  }
}

function projectData<
  T extends CreateProjectInput | UpdateProjectInput
>(input: T) {
  return {
    ...input,
    startedOn: toDate(input.startedOn),
    endedOn: toDate(input.endedOn),
  };
}

// Owner-only listing. An account without a profile gets [].
export async function listMyProjects(userId: string) {
  const profile = await prisma.freelancerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!profile) return [];

  return prisma.portfolioProject.findMany({
    where: { profileId: profile.id },
    select: PROJECT_SELECT,
    orderBy: [
      { sortOrder: 'asc' },
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
    take: MAX_PROJECTS,
  });
}

export async function createMyProject(
  userId: string,
  input: CreateProjectInput,
) {
  return withEditablePortfolio(userId, async (tx, profileId) => {
    const count = await tx.portfolioProject.count({
      where: { profileId },
    });

    if (count >= MAX_PROJECTS) {
      throw new ProjectLimitError();
    }

    const data = projectData(input);

    assertValidDateRange(data.startedOn, data.endedOn);

    return tx.portfolioProject.create({
      data: {
        ...data,
        profileId,
      },
      select: PROJECT_SELECT,
    });
  });
}

export async function updateMyProject(
  userId: string,
  projectId: string,
  input: UpdateProjectInput,
) {
  return withEditablePortfolio(userId, async (tx, profileId) => {
    const existing = await tx.portfolioProject.findFirst({
      where: {
        id: projectId,
        profileId,
      },
    });

    if (!existing) {
      throw new ProjectNotFoundError();
    }

    const data = projectData(input);

    const startedOn =
      data.startedOn === undefined
        ? existing.startedOn
        : data.startedOn;

    const endedOn =
      data.endedOn === undefined
        ? existing.endedOn
        : data.endedOn;

    assertValidDateRange(startedOn, endedOn);

    return tx.portfolioProject.update({
      where: { id: existing.id },
      data,
      select: PROJECT_SELECT,
    });
  });
}

export async function deleteMyProject(
  userId: string,
  projectId: string,
) {
  return withEditablePortfolio(userId, async (tx, profileId) => {
    const deleted = await tx.portfolioProject.deleteMany({
      where: {
        id: projectId,
        profileId,
      },
    });

    if (deleted.count !== 1) {
      throw new ProjectNotFoundError();
    }

    return { id: projectId };
  });
}

export async function reorderMyProjects(
  userId: string,
  input: ReorderProjectsInput,
) {
  return withEditablePortfolio(userId, async (tx, profileId) => {
    const existing = await tx.portfolioProject.findMany({
      where: { profileId },
      select: { id: true },
    });

    const expected = new Set(existing.map((item) => item.id));

    if (
      expected.size !== input.ids.length ||
      input.ids.some((id) => !expected.has(id))
    ) {
      throw new ProjectOrderError();
    }

    // All updates commit together or roll back together.
    for (let index = 0; index < input.ids.length; index++) {
      await tx.portfolioProject.update({
        where: { id: input.ids[index]! },
        data: { sortOrder: index },
      });
    }

    return tx.portfolioProject.findMany({
      where: { profileId },
      select: PROJECT_SELECT,
      orderBy: [
        { sortOrder: 'asc' },
        { id: 'asc' },
      ],
    });
  });
}
