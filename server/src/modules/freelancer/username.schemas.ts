import { z } from 'zod';

const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'api',
  'app',
  'auth',
  'billing',
  'contact',
  'dashboard',
  'freelancer',
  'freelancers',
  'help',
  'login',
  'logout',
  'mail',
  'moderator',
  'payments',
  'portfolio',
  'privacy',
  'profile',
  'profiles',
  'register',
  'root',
  'security',
  'settings',
  'signin',
  'signup',
  'support',
  'system',
  'terms',
  'users',
  'www',
]);

// Shared syntax rules for availability and reservation.
export const usernameSyntaxSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z][a-z0-9_]{2,29}$/,
    'Use 3–30 characters, starting with a letter. Only letters, numbers and underscores are allowed.',
  );

export function isReservedUsername(username: string): boolean {
  return RESERVED_USERNAMES.has(username);
}

export const usernameSchema = usernameSyntaxSchema.refine(
  (username) => !isReservedUsername(username),
  {
    message: 'This username is reserved.',
  },
);

export const reserveUsernameSchema = z.strictObject({
  username: usernameSchema,
});

export type ReserveUsernameInput =
  z.infer<typeof reserveUsernameSchema>;
