import { Router } from 'express';

import { requireSession } from '../auth/require-session.js';
import { requireCsrf } from '../auth/require-csrf.js';

import { saveProfileSchema } from './profile.schemas.js';

import {
  getMyProfile,
  saveMyProfile,
  completeMyOnboarding,
  ProfileNotReadyError,
  ProfileNotEditableError,
  IncompleteOnboardingError,
  ProfileConflictError,
} from './profile.service.js';

export const profileRouter = Router();

// Every endpoint requires an authenticated session.
profileRouter.use(requireSession);

// GET /api/freelancer/profile
profileRouter.get('/profile', async (_req, res, next) => {
  try {
    const userId = res.locals.authUser.id as string;

    const profile = await getMyProfile(userId);

    res.status(200).json({ profile });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/freelancer/profile
profileRouter.patch(
  '/profile',
  requireCsrf,
  async (req, res, next) => {
    const parsed = saveProfileSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid profile information.',
        issues: parsed.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }

    try {
      const userId = res.locals.authUser.id as string;

      const profile = await saveMyProfile(
        userId,
        parsed.data,
      );

      res.status(200).json({
        message: 'Profile draft saved.',
        profile,
      });
    } catch (error) {
      if (error instanceof ProfileNotEditableError) {
        res.status(409).json({
          error: error.message,
        });
        return;
      }

      next(error);
    }
  },
);

// POST /api/freelancer/onboarding/complete
profileRouter.post(
  '/onboarding/complete',
  requireCsrf,
  async (_req, res, next) => {
    try {
      const userId = res.locals.authUser.id as string;

      const profile = await completeMyOnboarding(userId);

      res.status(200).json({
        message: 'Onboarding completed successfully.',
        profile,
      });
    } catch (error) {
      if (error instanceof IncompleteOnboardingError) {
        res.status(422).json({
          error: error.message,
          missingFields: error.missingFields,
        });
        return;
      }

      if (
        error instanceof ProfileNotReadyError ||
        error instanceof ProfileNotEditableError ||
        error instanceof ProfileConflictError
      ) {
        res.status(409).json({
          error: error.message,
        });
        return;
      }

      next(error);
    }
  },
);
