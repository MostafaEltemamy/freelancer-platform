import { prisma } from '../../database/prisma.js';

import {
  withEditablePortfolio,
} from './portfolio-guard.js';

import {
  skillKey,
} from './skill.schemas.js';

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
  createdAt: true,
  updatedAt: true,
} as const;

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

// Return only skills belonging to the authenticated user.
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

// Create a skill at the end of the current order.
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

// Rename a skill without changing its identity or order.
export async function updateMySkill(
  userId: string,
  skillId: string,
  input: UpdateSkillInput,
) {
  return withEditablePortfolio(
    userId,
    async (tx, profileId) => {
      const updated = await tx.profileSkill.updateMany({
        where: {
          id: skillId,
          profileId,
        },
        data: {
          name: input.name,
          normalizedName: skillKey(input.name),
        },
      });

      if (updated.count !== 1) {
        throw new SkillNotFoundError();
      }

      const skill = await tx.profileSkill.findUnique({
        where: { id: skillId },
        select: SKILL_SELECT,
      });

      if (!skill) {
        throw new SkillNotFoundError();
      }

      return skill;
    },
  );
}

// Delete only a skill belonging to the authenticated user.
export async function deleteMySkill(
  userId: string,
  skillId: string,
) {
  return withEditablePortfolio(
    userId,
    async (tx, profileId) => {
      const deleted = await tx.profileSkill.deleteMany({
        where: {
          id: skillId,
          profileId,
        },
      });

      if (deleted.count !== 1) {
        throw new SkillNotFoundError();
      }

      return { id: skillId };
    },
  );
}

// Change the order of the entire skill collection atomically.
export async function reorderMySkills(
  userId: string,
  input: ReorderSkillsInput,
) {
  return withEditablePortfolio(
    userId,
    async (tx, profileId) => {
      const existing = await tx.profileSkill.findMany({
        where: { profileId },
        select: { id: true },
      });

      const expected = new Set(
        existing.map((skill) => skill.id),
      );

      if (
        expected.size !== input.ids.length ||
        input.ids.some((id) => !expected.has(id))
      ) {
        throw new SkillOrderError();
      }

      for (let index = 0; index < input.ids.length; index++) {
        const result = await tx.profileSkill.updateMany({
          where: {
            id: input.ids[index]!,
            profileId,
          },
          data: {
            sortOrder: index,
          },
        });

        if (result.count !== 1) {
          throw new SkillOrderError();
        }
      }

      return tx.profileSkill.findMany({
        where: { profileId },
        select: SKILL_SELECT,
        orderBy: [
          { sortOrder: 'asc' },
          { id: 'asc' },
        ],
      });
    },
  );
}
