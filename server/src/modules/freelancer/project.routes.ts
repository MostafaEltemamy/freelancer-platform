import { Router } from 'express';
import type { NextFunction, Response } from 'express';

import { rateLimit } from 'express-rate-limit';

import { Prisma } from '../../generated/prisma/client.js';

import { requireSession } from '../auth/require-session.js';
import { requireCsrf } from '../auth/require-csrf.js';

import {
  PortfolioSetupRequiredError,
  PortfolioPublishedError,
} from './portfolio-guard.js';

import {
  createProjectSchema,
  updateProjectSchema,
  reorderProjectsSchema,
  projectIdSchema,
} from './project.schemas.js';

import {
  listMyProjects,
  createMyProject,
  updateMyProject,
  deleteMyProject,
  reorderMyProjects,
  ProjectNotFoundError,
  ProjectLimitError,
  ProjectDateRangeError,
  ProjectOrderError,
} from './project.service.js';

export const projectRouter = Router();

projectRouter.use(requireSession);

const mutationLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

function handleError(
  error: unknown,
  res: Response,
  next: NextFunction,
) {
  if (error instanceof ProjectNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }

  if (error instanceof ProjectDateRangeError) {
    res.status(400).json({ error: error.message });
    return;
  }

  if (
    error instanceof PortfolioSetupRequiredError ||
    error instanceof PortfolioPublishedError ||
    error instanceof ProjectLimitError ||
    error instanceof ProjectOrderError
  ) {
    res.status(409).json({ error: error.message });
    return;
  }

  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    res.status(409).json({
      error: 'A project with this slug already exists.',
    });
    return;
  }

  next(error);
}

function invalidInput(
  res: Response,
  issues: { path: PropertyKey[]; message: string }[],
) {
  res.status(400).json({
    error: 'Invalid project information.',
    issues: issues.map((issue) => ({
      field: issue.path.map(String).join('.'),
      message: issue.message,
    })),
  });
}

// GET /api/freelancer/projects
projectRouter.get('/projects', async (_req, res, next) => {
  try {
    const projects = await listMyProjects(
      res.locals.authUser.id as string,
    );

    res.status(200).json({ projects });
  } catch (error) {
    next(error);
  }
});

// POST /api/freelancer/projects
projectRouter.post(
  '/projects',
  requireCsrf,
  mutationLimiter,
  async (req, res, next) => {
    const parsed = createProjectSchema.safeParse(req.body);

    if (!parsed.success) {
      invalidInput(res, parsed.error.issues);
      return;
    }

    try {
      const project = await createMyProject(
        res.locals.authUser.id as string,
        parsed.data,
      );

      res.status(201).json({ project });
    } catch (error) {
      handleError(error, res, next);
    }
  },
);

// PUT /api/freelancer/projects/order
projectRouter.put(
  '/projects/order',
  requireCsrf,
  mutationLimiter,
  async (req, res, next) => {
    const parsed = reorderProjectsSchema.safeParse(req.body);

    if (!parsed.success) {
      invalidInput(res, parsed.error.issues);
      return;
    }

    try {
      const projects = await reorderMyProjects(
        res.locals.authUser.id as string,
        parsed.data,
      );

      res.status(200).json({ projects });
    } catch (error) {
      handleError(error, res, next);
    }
  },
);

// PATCH /api/freelancer/projects/:id
projectRouter.patch(
  '/projects/:id',
  requireCsrf,
  mutationLimiter,
  async (req, res, next) => {
    const id = projectIdSchema.safeParse(req.params.id);
    const input = updateProjectSchema.safeParse(req.body);

    if (!id.success || !input.success) {
      res.status(400).json({
        error: 'Invalid project ID or update data.',
      });
      return;
    }

    try {
      const project = await updateMyProject(
        res.locals.authUser.id as string,
        id.data,
        input.data,
      );

      res.status(200).json({ project });
    } catch (error) {
      handleError(error, res, next);
    }
  },
);

// DELETE /api/freelancer/projects/:id
projectRouter.delete(
  '/projects/:id',
  requireCsrf,
  mutationLimiter,
  async (req, res, next) => {
    const id = projectIdSchema.safeParse(req.params.id);

    if (!id.success) {
      res.status(400).json({
        error: 'Invalid project ID.',
      });
      return;
    }

    try {
      await deleteMyProject(
        res.locals.authUser.id as string,
        id.data,
      );

      res.status(204).end();
    } catch (error) {
      handleError(error, res, next);
    }
  },
);
