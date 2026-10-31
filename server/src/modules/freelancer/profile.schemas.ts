import { z } from 'zod';

const nullableText = (maxLength: number) =>
  z.string()
    .trim()
    .min(1, 'Use null to clear this field.')
    .max(maxLength)
    .nullable()
    .optional();

const websiteSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);

      return (
        ['http:', 'https:'].includes(url.protocol) &&
        Boolean(url.hostname) &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }, 'Enter a valid HTTP or HTTPS website URL.')
  .nullable()
  .optional();

export const saveProfileSchema = z.strictObject({
  headline: nullableText(160),
  bio: nullableText(5000),
  city: nullableText(100),

  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, 'Use a two-letter country code.')
    .nullable()
    .optional(),

  websiteUrl: websiteSchema,
}).refine(
  (data) => Object.values(data).some(
    (value) => value !== undefined,
  ),
  'Provide at least one field to update.',
);

export type SaveProfileInput =
  z.infer<typeof saveProfileSchema>;
