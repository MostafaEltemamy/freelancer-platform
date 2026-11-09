import { z } from 'zod';

import {
  PROJECT_MEDIA_LIMITS,
} from './project-media.policy.js';

const mediaVersionSchema = z.number()
  .int()
  .min(1)
  .max(2_147_483_646);

export const mediaIdSchema = z.uuid();

export const updateMediaDetailsSchema = z.strictObject({
  version: mediaVersionSchema,

  // Use null to clear an existing value.
  altText: z.string()
    .trim()
    .min(1)
    .max(200)
    .nullable(),

  caption: z.string()
    .trim()
    .min(1)
    .max(500)
    .nullable(),
});

export const setMediaCoverSchema = z.strictObject({
  version: mediaVersionSchema,
});

export const deleteMediaSchema = z.strictObject({
  version: mediaVersionSchema,
});

const versionedMediaItemSchema = z.strictObject({
  id: mediaIdSchema,
  version: mediaVersionSchema,
});

export const reorderMediaSchema = z.strictObject({
  items: z.array(versionedMediaItemSchema)
    .min(2)
    .max(PROJECT_MEDIA_LIMITS.maxItemsPerProject)
    .refine(
      (items) =>
        new Set(items.map((item) => item.id)).size ===
        items.length,
      'Every gallery image must appear exactly once.',
    ),
});

export type UpdateMediaDetailsInput =
  z.infer<typeof updateMediaDetailsSchema>;

export type SetMediaCoverInput =
  z.infer<typeof setMediaCoverSchema>;

export type ReorderMediaInput =
  z.infer<typeof reorderMediaSchema>;
