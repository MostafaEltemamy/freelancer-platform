import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';

import { prisma } from '../../database/prisma.js';

import { requireSession } from '../auth/require-session.js';
import { requireCsrf } from '../auth/require-csrf.js';

import {
  isReservedUsername,
  reserveUsernameSchema,
  usernameSyntaxSchema,
} from './username.schemas.js';

import {
  isUsernameAvailable,
  reserveUsername,
  UsernameAlreadyAssignedError,
  UsernameUnavailableError,
} from './username.service.js';

export const freelancerRouter = Router();
export const publicFreelancerRouter = Router();

const availabilityLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

const reservationLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 15,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

// Check public username availability.
freelancerRouter.get(
  '/usernames/:username/availability',
  availabilityLimiter,
  async (req, res, next) => {
    const parsed = usernameSyntaxSchema.safeParse(
      req.params.username,
    );

    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid username format.',
      });
      return;
    }

    const username = parsed.data;

    if (isReservedUsername(username)) {
      res.json({
        username,
        available: false,
      });
      return;
    }

    try {
      const available = await isUsernameAvailable(username);

      res.setHeader('Cache-Control', 'no-store');

      res.json({
        username,
        available,
      });
    } catch (error) {
      next(error);
    }
  },
);

// Reserve the authenticated user's first username.
freelancerRouter.post(
  '/username',
  requireSession,
  requireCsrf,
  reservationLimiter,
  async (req, res, next) => {
    const parsed = reserveUsernameSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid username.',
        issues: parsed.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }

    const { username } = parsed.data;

    const authUser = res.locals.authUser as {
      id: string;
    };

    try {
      const reservation = await reserveUsername(
        authUser.id,
        username,
      );

      res.setHeader('Cache-Control', 'no-store');

      res.status(reservation.newlyReserved ? 201 : 200).json({
        username: reservation.username,
        profilePath: `/u/${reservation.username}`,
        published: false,
      });
    } catch (error) {
      if (error instanceof UsernameUnavailableError) {
        res.status(409).json({
          error: error.message,
        });
        return;
      }

      if (error instanceof UsernameAlreadyAssignedError) {
        res.status(409).json({
          error: error.message,
        });
        return;
      }

      next(error);
    }
  },
);

// Public lookup: only completed, published profiles.
publicFreelancerRouter.get(
  '/:username',
  async (req, res, next) => {
    const parsed = usernameSyntaxSchema.safeParse(
      req.params.username,
    );

    if (
      !parsed.success ||
      isReservedUsername(parsed.data)
    ) {
      res.status(404).json({
        error: 'Profile not found.',
      });
      return;
    }

    try {
      const profile = await prisma.freelancerProfile.findFirst({
        where: {
          username: parsed.data,
          status: 'PUBLISHED',
          publishedAt: { not: null },
          onboardingCompletedAt: { not: null },
        },
        select: {
          username: true,
          headline: true,
          bio: true,
          city: true,
          countryCode: true,
          websiteUrl: true,
        },
      });

      if (!profile) {
        res.status(404).json({
          error: 'Profile not found.',
        });
        return;
      }

      res.status(200).json({ profile });
    } catch (error) {
      next(error);
    }
  },
);
