import { prisma } from '../../database/prisma.js';
import {withEditablePortfolio} from './portfolio-guard.js';
import {skillKey} from './skill.schemas.js';

import type {
  CreateSkillInput,
  UpdateSkillInput,
  ReorderSkillsInput,
} from './skill.schemas.js';

const MAX_SKILLS = 100;

const SKILL_SELECT = {
  id: true,
  name: true,
  sortOrder: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} as const;

// -------------------------------------------------
// Errors
// -------------------------------------------------

export class SkillNotFoundError extends Error {
  constructor() {
    super('Professional skill not found.');
    this.name = 'SkillNotFoundError';
  }
}

export class SkillLimitError extends Error {
  constructor() {
    super('Maximum of 100 professional skills reached.');
    this.name = 'SkillLimitError';
  }
}

export class SkillOrderError extends Error {
  constructor() {
    super('Skill order must include every skill exactly once.');
    this.name = 'SkillOrderError';
  }
}

export class SkillVersionConflictError extends Error {
  constructor() {
    super(
      'This skill has changed since you opened it. Reload the latest version before saving.',
    );
    this.name = 'SkillVersionConflictError';
  }
}

// -------------------------------------------------
// List skills belonging to the authenticated user
// -------------------------------------------------

export async function listMySkills(userId: string) {
  const profile = await prisma.freelancerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!profile) {
    return [];
  }

  return prisma.profileSkill.findMany({
    where: { profileId: profile.id },
    select: SKILL_SELECT,
    orderBy: [
      { sortOrder: 'asc' },
      { id: 'asc' },
    ],
    take: MAX_SKILLS,
  });
}

// -------------------------------------------------
// Create a skill
// -------------------------------------------------

export async function createMySkill(
  userId: string,
  input: CreateSkillInput,
) {
  return withEditablePortfolio(
    userId,
    async (tx, profileId) => {
      const count = await tx.profileSkill.count({
        where: { profileId },
      });

      if (count >= MAX_SKILLS) {
        throw new SkillLimitError();
      }

      const maximum = await tx.profileSkill.aggregate({
        where: { profileId },
        _max: { sortOrder: true },
      });

      const nextOrder =
        (maximum._max.sortOrder ?? -1) + 1;

      return tx.profileSkill.create({
        data: {
          profileId,
          name: input.name,
          normalizedName: skillKey(input.name),
          sortOrder: nextOrder,
        },
        select: SKILL_SELECT,
      });
    },
  );
}

// -------------------------------------------------
// Rename a skill with optimistic concurrency
// -------------------------------------------------

export async function updateMySkill(
  userId: string,
  skillId: string,
  input: UpdateSkillInput,
) {
  return withEditablePortfolio(
    userId,
    async (tx, profileId) => {
      const existing = await tx.profileSkill.findFirst({
        where: {
          id: skillId,
          profileId,
        },
        select: {
          version: true,
        },
      });

      if (!existing) {
        throw new SkillNotFoundError();
      }

      if (existing.version !== input.version) {
        throw new SkillVersionConflictError();
      }

      const updated = await tx.profileSkill.updateMany({
        where: {
          id: skillId,
          profileId,
          version: input.version,
        },
        data: {
          name: input.name,
          normalizedName: skillKey(input.name),
          version: {
            increment: 1,
          },
        },
      });

      if (updated.count !== 1) {
        throw new SkillVersionConflictError();
      }

      return tx.profileSkill.findUniqueOrThrow({
        where: {
          id: skillId,
        },
        select: SKILL_SELECT,
      });
    },
  );
}

// -------------------------------------------------
// Delete a skill with optimistic concurrency
// -------------------------------------------------

export async function deleteMySkill(
  userId: string,
  skillId: string,
  expectedVersion: number,
) {
  return withEditablePortfolio(
    userId,
    async (tx, profileId) => {
      const existing = await tx.profileSkill.findFirst({
        where: {
          id: skillId,
          profileId,
        },
        select: {
          version: true,
        },
      });

      if (!existing) {
        throw new SkillNotFoundError();
      }

      if (existing.version !== expectedVersion) {
        throw new SkillVersionConflictError();
      }

      const deleted = await tx.profileSkill.deleteMany({
        where: {
          id: skillId,
          profileId,
          version: expectedVersion,
        },
      });

      if (deleted.count !== 1) {
        throw new SkillVersionConflictError();
      }

      return {
        id: skillId,
      };
    },
  );
}

// -------------------------------------------------
// Reorder all skills atomically
// -------------------------------------------------

export async function reorderMySkills(
  userId: string,
  input: ReorderSkillsInput,
) {
  return withEditablePortfolio(
    userId,
    async (tx, profileId) => {
      const existing = await tx.profileSkill.findMany({
        where: {
          profileId,
        },
        select: {
          id: true,
          version: true,
        },
      });

      const current = new Map(
        existing.map((skill) => [
          skill.id,
          skill.version,
        ]),
      );

      // The request must contain every owned skill.
      if (
        existing.length !== input.items.length ||
        input.items.some((item) => !current.has(item.id))
      ) {
        throw new SkillOrderError();
      }

      // Reject if any supplied version is outdated.
      if (
        input.items.some(
          (item) =>
            current.get(item.id) !== item.version,
        )
      ) {
        throw new SkillVersionConflictError();
      }

      // All updates execute in the existing transaction.
      // A failure rolls back every ordering change.
      for (
        let index = 0;
        index < input.items.length;
        index++
      ) {
        const item = input.items[index]!;

        const updated = await tx.profileSkill.updateMany({
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

        if (updated.count !== 1) {
          throw new SkillVersionConflictError();
        }
      }

      return tx.profileSkill.findMany({
        where: {
          profileId,
        },
        select: SKILL_SELECT,
        orderBy: [
          { sortOrder: 'asc' },
          { id: 'asc' },
        ],
      });
    },
  );
}
