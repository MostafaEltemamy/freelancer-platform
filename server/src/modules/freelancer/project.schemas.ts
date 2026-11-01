import { z } from 'zod';
import {projectContentSchema} from './project-content.schemas.js';

const optionalText = (max: number) =>
  z.string()
    .trim()
    .min(1, 'Use null to clear this field.')
    .max(max)
    .nullable()
    .optional();

const optionalUrl = z.string()
  .trim()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);

      return (
        ['https:', 'http:'].includes(url.protocol) &&
        Boolean(url.hostname) &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }, 'Enter a valid HTTP or HTTPS URL.')
  .nullable()
  .optional();

const optionalDate = z.string()
  .regex(
    /^\d{4}-\d{2}-\d{2}$/,
    'Use YYYY-MM-DD.',
  )
  .refine((value) => {
    const date = new Date(
      `${value}T00:00:00.000Z`,
    );

    return (
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, 'Enter a valid calendar date.')
  .nullable()
  .optional();

const technologiesSchema = z.array(
  z.string().trim().min(1).max(60),
)
  .max(25)
  .refine(
    (values) =>
      new Set(
        values.map((value) => value.toLowerCase()),
      ).size === values.length,
    'Technologies must not contain duplicates.',
  );

export const projectIdSchema = z.uuid();

export const createProjectSchema = z.strictObject({
  slug: z.string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(80)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Use lowercase letters, numbers and hyphens.',
    ),

  title: z.string().trim().min(3).max(160),
  summary: optionalText(500),
  description: optionalText(10000),
  role: optionalText(120),

  projectUrl: optionalUrl,
  sourceUrl: optionalUrl,

  technologies: technologiesSchema.optional(),

  startedOn: optionalDate,
  endedOn: optionalDate,

  visibility: z.enum([
    'PRIVATE',
    'PUBLIC',
  ]).optional(),

  sortOrder: z.number()
    .int()
    .min(0)
    .max(100000)
    .optional(),

  isFeatured: z.boolean().optional(),

  // New: optional custom content.
  // Omitted means an existing-style project.
  // Use {schemaVersion:1, sections:[]} to clear content.
  content: projectContentSchema.optional(),
});

export const projectVersionSchema = z.number()
  .int()
  .min(1)
  .max(2_147_483_646);

export const updateProjectSchema =
  createProjectSchema.partial()
    .extend({
      version: projectVersionSchema,
    })
    .refine(
      (data) =>
        Object.keys(data).some(
          (key) => key !== 'version',
        ),
      'Provide at least one project field to update.',
    );

export const deleteProjectSchema = z.strictObject({
  version: projectVersionSchema,
});

export const reorderProjectsSchema = z.strictObject({
  items: z.array(
    z.strictObject({
      id: projectIdSchema,
      version: projectVersionSchema,
    }),
  )
    .min(1)
    .max(100)
    .refine(
      (items) =>
        new Set(
          items.map((item) => item.id),
        ).size === items.length,
      'Project IDs must not contain duplicates.',
    ),
});

export type CreateProjectInput =
  z.infer<typeof createProjectSchema>;

export type UpdateProjectInput =
  z.infer<typeof updateProjectSchema>;

export type ReorderProjectsInput =
  z.infer<typeof reorderProjectsSchema>;
