import { z } from 'zod';

export const registrationSchema = z.strictObject({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(320)
    .pipe(z.email()),

  displayName: z
    .string()
    .trim()
    .min(1, 'Enter your name.')
    .max(120, 'Your name must contain no more than 120 characters.'),

  password: z
    .string()
    .min(15, 'Use at least 15 characters.')
    .max(128, 'Use no more than 128 characters.'),
});

export type RegistrationInput = z.infer<typeof registrationSchema>;

export const loginSchema = z.strictObject({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(320)
    .pipe(z.email()),

  password: z
    .string()
    .min(1)
    .max(128),
});

export type LoginInput = z.infer<typeof loginSchema>;
