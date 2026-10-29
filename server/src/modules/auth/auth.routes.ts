
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';

import { registrationSchema } from './auth.schemas.js';
import {
  DuplicateEmailError,
  registerUser,
} from './auth.service.js';

import { loginSchema } from './auth.schemas.js';

import {
  InvalidCredentialsError,
  loginUser,
} from './auth.login.service.js';

import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  SESSION_COOKIE_CLEAR_OPTIONS,
} from './session-cookie.js';

import { requireSession } from './require-session.js';
import { revokeSessionToken } from './auth.logout.service.js';
import { createCsrfToken } from './csrf-tokens.js';
import { requireLogoutCsrf } from './require-csrf.js';

export const authRouter = Router();

const registrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: 'Too many registration attempts. Please try again later.',
  },
});

authRouter.post(
  '/register',
  registrationLimiter,
  async (req, res, next) => {
    // Validate and normalize incoming registration data.
    const parsed = registrationSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid registration data.',
        issues: parsed.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }

    try {
      const user = await registerUser(parsed.data);

      res.status(201).json({
        message: 'Account created successfully.',
        user,
      });
    } catch (error) {
      if (error instanceof DuplicateEmailError) {
        res.status(409).json({
          error: error.message,
        });
        return;
      }

      next(error);
    }
  },
);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: 'Too many login attempts. Please try again later.',
  },
});

authRouter.post(
  '/login',
  loginLimiter,
  async (req, res, next) => {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid login data.',
      });
      return;
    }

    try {
      const result = await loginUser(parsed.data);

      res.cookie(
        SESSION_COOKIE_NAME,
        result.token,
        SESSION_COOKIE_OPTIONS,
      );

      res.status(200).json({
        message: 'Logged in successfully.',
        user: result.user,
      });
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        res.status(401).json({
          error: error.message,
        });
        return;
      }

      next(error);
    }
  },
);

authRouter.get(
  '/me',
  requireSession,
  (_req, res) => {
    res.status(200).json({
      user: res.locals.authUser,
    });
  },
);

authRouter.get(
  '/csrf',
  requireSession,
  (req, res) => {
    res.setHeader('Cache-Control', 'no-store');

    const cookieName =
      process.env.NODE_ENV === 'production'
        ? '__Host-fp_session'
        : 'fp_session';

    const sessionToken: unknown =
      req.cookies?.[SESSION_COOKIE_NAME];

    if (typeof sessionToken !== 'string') {
      res.status(401).json({
        error: 'Authentication required.',
      });
      return;
    }

    res.status(200).json({
      csrfToken: createCsrfToken(sessionToken),
    });
  },
);

const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

authRouter.post('/logout', requireLogoutCsrf, async (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');

  try {
    const token: unknown =
      req.cookies?.[SESSION_COOKIE_NAME];

    // Revoke the session only if the token is well-formed.
    if (
      typeof token === 'string' &&
      SESSION_TOKEN_PATTERN.test(token)
    ) {
      await revokeSessionToken(token);
    }

    const isProduction =
      process.env.NODE_ENV === 'production';

    // Expire the browser cookie.
    res.clearCookie(
      SESSION_COOKIE_NAME,
      SESSION_COOKIE_CLEAR_OPTIONS,
    );

    // No content or sensitive information in the response.
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
