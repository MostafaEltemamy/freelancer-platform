
import { Router } from 'express';
import type { NextFunction, Response } from 'express';
import type { ZodIssue } from 'zod';

import { rateLimit } from 'express-rate-limit';

import {
  Prisma,
} from '../../generated/prisma/client.js';

import {
  requireSession,
} from '../auth/require-session.js';

import {
  requireCsrf,
} from '../auth/require-csrf.js';

import {
  PortfolioSetupRequiredError,
  PortfolioPublishedError,
} from './portfolio-guard.js';

import {
  skillIdSchema,
  createSkillSchema,
  updateSkillSchema,
  reorderSkillsSchema,
} from './skill.schemas.js';

import {
  listMySkills,
  createMySkill,
  updateMySkill,
  deleteMySkill,
  reorderMySkills,
  SkillNotFoundError,
  SkillLimitError,
  SkillOrderError,
} from './skill.service.js';

export const skillRouter = Router();

skillRouter.use(requireSession);

const mutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

function invalidInput(
  res: Response,
  issues: ZodIssue[],
) {
  res.status(400).json({
    error: 'Invalid skill information.',
    issues: issues.map((issue) => ({
      field: issue.path.map(String).join('.'),
      message: issue.message,
    })),
  });
}

function handleError(
  error: unknown,
  res: Response,
  next: NextFunction,
) {
  if (error instanceof SkillNotFoundError) {
    res.status(404).json({
      error: error.message,
    });
    return;
  }

  if (
    error instanceof PortfolioSetupRequiredError ||
    error instanceof PortfolioPublishedError ||
    error instanceof SkillLimitError ||
    error instanceof SkillOrderError
  ) {
    res.status(409).json({
      error: error.message,
    });
    return;
  }

  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    res.status(409).json({
      error: 'This skill already exists in your profile.',
    });
    return;
  }

  next(error);
}

// GET /api/freelancer/skills
skillRouter.get(
  '/skills',
  async (_req, res, next) => {
    try {
      const skills = await listMySkills(
        res.locals.authUser.id as string,
      );

      res.status(200).json({ skills });
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/freelancer/skills
skillRouter.post(
  '/skills',
  requireCsrf,
  mutationLimiter,
  async (req, res, next) => {
    const parsed = createSkillSchema.safeParse(req.body);

    if (!parsed.success) {
      invalidInput(res, parsed.error.issues);
      return;
    }

    try {
      const skill = await createMySkill(
        res.locals.authUser.id as string,
        parsed.data,
      );

      res.status(201).json({ skill });
    } catch (error) {
      handleError(error, res, next);
    }
  },
);

// PUT /api/freelancer/skills/order
// Must be registered before /skills/:id.
skillRouter.put(
  '/skills/order',
  requireCsrf,
  mutationLimiter,
  async (req, res, next) => {
    const parsed = reorderSkillsSchema.safeParse(req.body);

    if (!parsed.success) {
      invalidInput(res, parsed.error.issues);
      return;
    }

    try {
      const skills = await reorderMySkills(
        res.locals.authUser.id as string,
        parsed.data,
      );

      res.status(200).json({ skills });
    } catch (error) {
      handleError(error, res, next);
    }
  },
);

// PATCH /api/freelancer/skills/:id
skillRouter.patch(
  '/skills/:id',
  requireCsrf,
  mutationLimiter,
  async (req, res, next) => {
    const id = skillIdSchema.safeParse(req.params.id);
    const input = updateSkillSchema.safeParse(req.body);

    if (!id.success || !input.success) {
      res.status(400).json({
        error: 'Invalid skill ID or update data.',
      });
      return;
    }

    try {
      const skill = await updateMySkill(
        res.locals.authUser.id as string,
        id.data,
        input.data,
      );

      res.status(200).json({ skill });
    } catch (error) {
      handleError(error, res, next);
    }
  },
);

// DELETE /api/freelancer/skills/:id
skillRouter.delete(
  '/skills/:id',
  requireCsrf,
  mutationLimiter,
  async (req, res, next) => {
    const id = skillIdSchema.safeParse(req.params.id);

    if (!id.success) {
      res.status(400).json({
        error: 'Invalid skill ID.',
      });
      return;
    }

    try {
      await deleteMySkill(
        res.locals.authUser.id as string,
        id.data,
      );

      res.status(204).end();
    } catch (error) {
      handleError(error, res, next);
    }
  },
);
