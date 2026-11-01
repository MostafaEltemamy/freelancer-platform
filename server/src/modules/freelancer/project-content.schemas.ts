import { z } from 'zod';

/**
 * Custom project content format.
 *
 * Every project can contain different sections and fields.
 * All data is validated before it reaches PostgreSQL.
 *
 * Images, video and files will use separate media storage.
 */

const MAX_SECTIONS = 12;
const MAX_FIELDS_PER_SECTION = 30;
const MAX_TOTAL_FIELDS = 100;
const MAX_CONTENT_BYTES = 128 * 1024;

const fieldBase = {
  id: z.uuid(),

  label: z.string()
    .trim()
    .min(1, 'A field label is required.')
    .max(80),

} as const;

// Only permit HTTP(S) URLs without embedded credentials.
const urlValueSchema = z.string()
  .trim()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);

      return (
        (url.protocol === 'https:' ||
          url.protocol === 'http:') &&
        Boolean(url.hostname) &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }, 'Enter a valid HTTP or HTTPS URL.');

// Validate real calendar dates, not just date strings.
const dateValueSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);

    return (
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, 'Enter a valid calendar date.');

export const projectContentFieldSchema =
  z.discriminatedUnion('type', [
    z.strictObject({
      ...fieldBase,
      type: z.literal('SHORT_TEXT'),
      value: z.string().max(500).nullable(),
    }),

    z.strictObject({
      ...fieldBase,
      type: z.literal('LONG_TEXT'),
      value: z.string().max(10000).nullable(),
    }),

    z.strictObject({
      ...fieldBase,
      type: z.literal('URL'),
      value: urlValueSchema.nullable(),
    }),

    z.strictObject({
      ...fieldBase,
      type: z.literal('NUMBER'),
      value: z.number()
        .finite()
        .min(-1_000_000_000_000)
        .max(1_000_000_000_000)
        .nullable(),
    }),

    z.strictObject({
      ...fieldBase,
      type: z.literal('DATE'),
      value: dateValueSchema.nullable(),
    }),

    z.strictObject({
      ...fieldBase,
      type: z.literal('BOOLEAN'),
      value: z.boolean().nullable(),
    }),

    z.strictObject({
      ...fieldBase,
      type: z.literal('LIST'),
      value: z.array(
        z.string().trim().min(1).max(250),
      ).max(40),
    }),
  ]);

export const projectContentSectionSchema = z.strictObject({
  id: z.uuid(),

  title: z.string()
    .trim()
    .min(1, 'A section title is required.')
    .max(100),

  description: z.string()
    .trim()
    .max(500)
    .nullable(),

  // Array position determines display order.
  fields: z.array(projectContentFieldSchema)
    .max(MAX_FIELDS_PER_SECTION),
});

/**
 * Schema version 1.
 *
 * Schema version is different from the Project.version
 * optimistic concurrency counter.
 */
export const projectContentSchema = z.strictObject({
  schemaVersion: z.literal(1),

  sections: z.array(projectContentSectionSchema)
    .max(MAX_SECTIONS),
}).superRefine((content, context) => {
  const sectionIds = new Set<string>();
  const fieldIds = new Set<string>();

  let totalFields = 0;

  for (
    let sectionIndex = 0;
    sectionIndex < content.sections.length;
    sectionIndex++
  ) {
    const section = content.sections[sectionIndex]!;

    if (sectionIds.has(section.id)) {
      context.addIssue({
        code: 'custom',
        path: ['sections', sectionIndex, 'id'],
        message: 'Section IDs must be unique.',
      });
    }

    sectionIds.add(section.id);

    totalFields += section.fields.length;

    for (
      let fieldIndex = 0;
      fieldIndex < section.fields.length;
      fieldIndex++
    ) {
      const field = section.fields[fieldIndex]!;

      if (fieldIds.has(field.id)) {
        context.addIssue({
          code: 'custom',
          path: [
            'sections',
            sectionIndex,
            'fields',
            fieldIndex,
            'id',
          ],
          message: 'Field IDs must be unique.',
        });
      }

      fieldIds.add(field.id);
    }
  }

  if (totalFields > MAX_TOTAL_FIELDS) {
    context.addIssue({
      code: 'custom',
      path: ['sections'],
      message:
        `A project cannot contain more than ` +
        `${MAX_TOTAL_FIELDS} custom fields.`,
    });
  }

  // Bound document size to prevent excessive JSONB storage
  // and unnecessarily large API payloads.
  const bytes = Buffer.byteLength(
    JSON.stringify(content),
    'utf8',
  );

  if (bytes > MAX_CONTENT_BYTES) {
    context.addIssue({
      code: 'custom',
      message:
        'Project content exceeds the 128 KB limit.',
    });
  }
});

export type ProjectContentField =
  z.infer<typeof projectContentFieldSchema>;

export type ProjectContentSection =
  z.infer<typeof projectContentSectionSchema>;

export type ProjectContent =
  z.infer<typeof projectContentSchema>;

/**
 * Used when creating a new project or displaying
 * an existing project that predates custom content.
 */
export function emptyProjectContent(): ProjectContent {
  return {
    schemaVersion: 1,
    sections: [],
  };
}
