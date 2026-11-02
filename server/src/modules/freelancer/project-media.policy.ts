import { randomUUID } from 'node:crypto';
import { z } from 'zod';

/**
 * Media policy for the first public release.
 *
 * No SVG or HTML uploads: these can contain active content.
 * Uploaded bytes must also be independently inspected
 * before a media record becomes READY.
 */

const MB = 1024 * 1024;

export const PROJECT_MEDIA_LIMITS = {
  maxItemsPerProject: 40,
  maxImageBytes: 12 * MB,
  maxDocumentBytes: 25 * MB,
  maxVideoBytes: 100 * MB,
} as const;

export type MediaKind =
  | 'IMAGE'
  | 'VIDEO'
  | 'DOCUMENT';

const MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/webm',
  'application/pdf',
] as const;

type AllowedMimeType = (typeof MIME_TYPES)[number];

interface MediaRule {
  kind: MediaKind;
  extensions: readonly string[];
  storageExtension: string;
  maxBytes: number;
}

const MEDIA_RULES: Record<AllowedMimeType, MediaRule> = {
  'image/jpeg': {
    kind: 'IMAGE',
    extensions: ['jpg', 'jpeg'],
    storageExtension: 'jpg',
    maxBytes: PROJECT_MEDIA_LIMITS.maxImageBytes,
  },

  'image/png': {
    kind: 'IMAGE',
    extensions: ['png'],
    storageExtension: 'png',
    maxBytes: PROJECT_MEDIA_LIMITS.maxImageBytes,
  },

  'image/webp': {
    kind: 'IMAGE',
    extensions: ['webp'],
    storageExtension: 'webp',
    maxBytes: PROJECT_MEDIA_LIMITS.maxImageBytes,
  },

  'video/mp4': {
    kind: 'VIDEO',
    extensions: ['mp4'],
    storageExtension: 'mp4',
    maxBytes: PROJECT_MEDIA_LIMITS.maxVideoBytes,
  },

  'video/webm': {
    kind: 'VIDEO',
    extensions: ['webm'],
    storageExtension: 'webm',
    maxBytes: PROJECT_MEDIA_LIMITS.maxVideoBytes,
  },

  'application/pdf': {
    kind: 'DOCUMENT',
    extensions: ['pdf'],
    storageExtension: 'pdf',
    maxBytes: PROJECT_MEDIA_LIMITS.maxDocumentBytes,
  },
};

const originalFilenameSchema = z.string()
  .trim()
  .min(1, 'Choose a file to upload.')
  .max(255, 'The filename is too long.')
  .refine(
    (value) =>
      !/[\/\\\u0000-\u001f\u007f]/u.test(value),
    'The filename contains unsupported characters.',
  );

/**
 * Metadata the browser may submit when requesting
 * permission to upload a file.
 *
 * It may NOT choose:
 * - storageKey
 * - kind
 * - status
 * - isCover
 * - version
 * - project ownership
 */
export const mediaUploadIntentSchema = z.strictObject({
  projectId: z.uuid(),

  originalFilename: originalFilenameSchema,

  mimeType: z.enum(MIME_TYPES),

  fileSizeBytes: z.number()
    .int()
    .positive()
    .max(PROJECT_MEDIA_LIMITS.maxVideoBytes),
}).superRefine((input, context) => {
  const rule = MEDIA_RULES[input.mimeType];

  const extension = input.originalFilename
    .split('.')
    .at(-1)
    ?.toLowerCase();

  if (
    !extension ||
    !rule.extensions.includes(extension)
  ) {
    context.addIssue({
      code: 'custom',
      path: ['originalFilename'],
      message:
        'The file extension does not match its format.',
    });
  }

  if (input.fileSizeBytes > rule.maxBytes) {
    const maxMB = rule.maxBytes / MB;

    context.addIssue({
      code: 'custom',
      path: ['fileSizeBytes'],
      message:
        `This file is too large. Maximum: ${maxMB} MB.`,
    });
  }
});

export type MediaUploadIntent =
  z.infer<typeof mediaUploadIntentSchema>;

/**
 * The server—not the browser—classifies media.
 */
export function classifyMedia(
  mimeType: AllowedMimeType,
): MediaKind {
  return MEDIA_RULES[mimeType].kind;
}

/**
 * Generates a private, unpredictable object key.
 *
 * The original filename is intentionally excluded
 * to prevent path traversal, collisions and accidental
 * disclosure of user-provided names.
 */
export function createProjectMediaStorageKey(
  input: MediaUploadIntent,
): string {
  const validated = mediaUploadIntentSchema.parse(input);

  const extension =
    MEDIA_RULES[validated.mimeType].storageExtension;

  return (
    `projects/${validated.projectId}/` +
    `${randomUUID()}.${extension}`
  );
}
