import { z } from 'zod';

// Unicode letters and numbers are accepted.
// Technical punctuation supports C++, C#, .NET, Node.js, UI/UX.
const SKILL_NAME_PATTERN =
  /^(?:[\p{L}\p{N}]|\.[\p{L}\p{N}])[\p{L}\p{N} .+#/&_-]*$/u;

export function normalizeSkillName(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ');
}

export function skillKey(value: string): string {
  return normalizeSkillName(value).toLowerCase();
}

export const skillNameSchema = z.string()
  .transform(normalizeSkillName)
  .pipe(
    z.string()
      .min(1, 'Skill name is required.')
      .max(80, 'Skill name cannot exceed 80 characters.')
      .regex(
        SKILL_NAME_PATTERN,
        'Skill name contains unsupported characters.',
      ),
  );

export const skillIdSchema = z.uuid();

// Use a positive integer that can safely be incremented
// in PostgreSQL's 32-bit integer column.
export const skillVersionSchema = z.number()
  .int()
  .min(1)
  .max(2_147_483_646);

// POST /skills
export const createSkillSchema = z.strictObject({
  name: skillNameSchema,
});

// PATCH /skills/:id
export const updateSkillSchema = z.strictObject({
  name: skillNameSchema,
  version: skillVersionSchema,
});

// DELETE /skills/:id
export const deleteSkillSchema = z.strictObject({
  version: skillVersionSchema,
});

// PUT /skills/order
export const reorderSkillsSchema = z.strictObject({
  items: z.array(
    z.strictObject({
      id: skillIdSchema,
      version: skillVersionSchema,
    }),
  )
    .min(1)
    .max(100)
    .refine(
      (items) =>
        new Set(items.map((item) => item.id)).size ===
        items.length,
      'Skill IDs must be unique.',
    ),
});

export type CreateSkillInput =
  z.infer<typeof createSkillSchema>;

export type UpdateSkillInput =
  z.infer<typeof updateSkillSchema>;

export type ReorderSkillsInput =
  z.infer<typeof reorderSkillsSchema>;
