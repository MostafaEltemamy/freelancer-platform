
import type { RequestHandler } from 'express';

import { verifyCsrfToken } from './csrf-tokens.js';
import { SESSION_COOKIE_NAME } from './session-cookie.js';

const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const requireCsrf: RequestHandler = (
  req,
  res,
  next,
) => {
  res.setHeader('Cache-Control', 'no-store');

  const sessionToken: unknown =
    req.cookies?.[SESSION_COOKIE_NAME];

  const submittedToken = req.get('X-CSRF-Token');

  if (
    typeof sessionToken !== 'string' ||
    !SESSION_TOKEN_PATTERN.test(sessionToken) ||
    !verifyCsrfToken(sessionToken, submittedToken)
  ) {
    res.status(403).json({
      error: 'Invalid or missing CSRF token.',
    });
    return;
  }

  next();
};

// Logout remains idempotent when no session cookie exists.
// A request carrying a cookie must provide a valid CSRF token.
export const requireLogoutCsrf: RequestHandler = (
  req,
  res,
  next,
) => {
  const sessionToken: unknown =
    req.cookies?.[SESSION_COOKIE_NAME];

  if (sessionToken === undefined) {
    next();
    return;
  }

  requireCsrf(req, res, next);
};
