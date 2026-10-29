
import type { CookieOptions } from 'express';

// A session remains valid for a maximum of seven days.
export const SESSION_TTL_MS =
  7 * 24 * 60 * 60 * 1000;

const IS_PRODUCTION =
  process.env.NODE_ENV === 'production';

// Use a protected cookie prefix in production.
export const SESSION_COOKIE_NAME = IS_PRODUCTION
  ? '__Host-fp_session'
  : 'fp_session';

// Shared cookie attributes.
export const SESSION_COOKIE_CLEAR_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  sameSite: 'lax',
  path: '/',
};

// Cookie attributes when establishing a session.
export const SESSION_COOKIE_OPTIONS: CookieOptions = {
  ...SESSION_COOKIE_CLEAR_OPTIONS,
  maxAge: SESSION_TTL_MS,
};
