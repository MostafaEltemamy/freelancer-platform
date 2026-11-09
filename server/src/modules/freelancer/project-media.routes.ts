import { Router } from 'express';
import type {NextFunction, Response} from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import {requireSession} from '../auth/require-session.js';
import {requireCsrf} from '../auth/require-csrf.js';
import {projectIdSchema} from './project.schemas.js';
import {PortfolioPublishedError, PortfolioSetupRequiredError} from './portfolio-guard.js';
import {mediaUploadIntentSchema} from './project-media.policy.js';
import {MediaStorageError, MediaUploadInvalidError, MediaUploadMissingError} from './project-media.storage.js';
import {
  prepareProjectImageUpload,
  finalizeProjectImageUpload,
  listMyProjectMedia,
  MediaProjectNotFoundError,
  MediaNotFoundError,
  MediaLimitError,
  MediaStateConflictError,
} from './project-media.service.js';

import {
  updateMediaDetailsSchema,
  setMediaCoverSchema,
  reorderMediaSchema,
  deleteMediaSchema,
} from './project-media.management.schemas.js';

import {
  updateMyMediaDetails,
  setMyProjectCover,
  reorderMyProjectMedia,
  MediaGalleryNotFoundError,
  MediaGalleryNotReadyError,
  MediaGalleryVersionError,
  MediaGalleryOrderError,
  deleteMyProjectMedia,
} from './project-media.management.js';

export const projectMediaRouter = Router();

projectMediaRouter.use(requireSession);

const uploadLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

const mediaIdSchema = z.uuid();

const imageIntentRequestSchema = z.strictObject({
  originalFilename: z.string(),
  mimeType: z.enum([
    'image/jpeg',
    'image/png',
    'image/webp',
  ]),
  fileSizeBytes: z.number(),
});

function handleMediaError(
  error: unknown,
  res: Response,
  next: NextFunction,
): void {
  if (
    error instanceof MediaProjectNotFoundError ||
    error instanceof MediaNotFoundError
  ) {
    res.status(404).json({
      error: error.message,
    });
    return;
  }

  if (error instanceof MediaUploadInvalidError) {
    res.status(422).json({
      error: error.message,
    });
    return;
  }

  if (error instanceof MediaUploadMissingError) {
    res.status(409).json({
      error:
        'The upload has not finished. ' +
        'Please upload the image and try again.',
    });
    return;
  }

  if (
    error instanceof MediaLimitError ||
    error instanceof MediaStateConflictError ||
    error instanceof PortfolioPublishedError ||
    error instanceof PortfolioSetupRequiredError
  ) {
    res.status(409).json({
      error: error.message,
    });
    return;
  }

  if (error instanceof MediaStorageError) {
    res.status(503).json({
      error:
        'Image uploads are temporarily unavailable. ' +
        'Please try again later.',
    });
    return;
  }

  next(error);
}

function handleGalleryError(
  error: unknown,
  res: Response,
  next: NextFunction,
): void {
  if (error instanceof MediaGalleryNotFoundError) {
    res.status(404).json({
      error: 'Project image not found.',
    });
    return;
  }

  if (error instanceof MediaGalleryVersionError) {
    res.status(409).json({
      error: error.message,
      code: 'STALE_MEDIA_VERSION',
    });
    return;
  }

  if (
    error instanceof MediaGalleryNotReadyError ||
    error instanceof MediaGalleryOrderError ||
    error instanceof PortfolioPublishedError ||
    error instanceof PortfolioSetupRequiredError
  ) {
    res.status(409).json({
      error: error.message,
    });
    return;
  }

  next(error);
}

const galleryMutationLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

/**
 * GET /api/freelancer/projects/:projectId/media
 *
 * Authenticated owner-only listing.
 */
projectMediaRouter.get(
  '/projects/:projectId/media',
  async (req, res, next) => {
    const projectId = projectIdSchema.safeParse(
      req.params.projectId,
    );

    if (!projectId.success) {
      res.status(400).json({
        error: 'Invalid project ID.',
      });
      return;
    }

    try {
      const media = await listMyProjectMedia(
        res.locals.authUser.id as string,
        projectId.data,
      );

      res.status(200).json({ media });
    } catch (error) {
      handleMediaError(error, res, next);
    }
  },
);

/**
 * POST /api/freelancer/projects/:projectId/media/uploads
 *
 * Creates a pending media record and returns a
 * short-lived, single-object upload authorization.
 */
projectMediaRouter.post(
  '/projects/:projectId/media/uploads',
  requireCsrf,
  uploadLimiter,
  async (req, res, next) => {
    const projectId = projectIdSchema.safeParse(
      req.params.projectId,
    );

    const request = imageIntentRequestSchema.safeParse(
      req.body,
    );

    if (!projectId.success || !request.success) {
      res.status(400).json({
        error:
          'Please select a valid JPEG, PNG or WebP image.',
      });
      return;
    }

    const intent = mediaUploadIntentSchema.safeParse({
      projectId: projectId.data,
      ...request.data,
    });

    if (!intent.success) {
      res.status(400).json({
        error:
          'Please check the selected image format ' +
          'and file size.',
        issues: intent.error.issues.map((issue) => ({
          field: issue.path.map(String).join('.'),
          message: issue.message,
        })),
      });
      return;
    }

    try {
      const result = await prepareProjectImageUpload(
        res.locals.authUser.id as string,
        intent.data,
      );

      res.status(201).json(result);
    } catch (error) {
      handleMediaError(error, res, next);
    }
  },
);

/**
 * POST
 * /api/freelancer/projects/:projectId/media/uploads/:mediaId/complete
 *
 * Independently checks stored bytes and processes
 * the image before marking it READY.
 */
projectMediaRouter.post(
  '/projects/:projectId/media/uploads/:mediaId/complete',
  requireCsrf,
  uploadLimiter,
  async (req, res, next) => {
    const projectId = projectIdSchema.safeParse(
      req.params.projectId,
    );

    const mediaId = mediaIdSchema.safeParse(
      req.params.mediaId,
    );

    if (!projectId.success || !mediaId.success) {
      res.status(400).json({
        error: 'Invalid image or project ID.',
      });
      return;
    }

    try {
      const media = await finalizeProjectImageUpload(
        res.locals.authUser.id as string,
        projectId.data,
        mediaId.data,
      );

      res.status(200).json({ media });
    } catch (error) {
      handleMediaError(error, res, next);
    }
  },
);

// ---------------------------------------------------------
// PATCH /api/freelancer/projects/:projectId/media/
//       :mediaId/details
//
// Edit the caption and alternative text of a READY image.
// ---------------------------------------------------------

projectMediaRouter.patch(
  '/projects/:projectId/media/:mediaId/details',
  requireCsrf,
  galleryMutationLimiter,
  async (req, res, next) => {
    const projectId = projectIdSchema.safeParse(
      req.params.projectId,
    );

    const mediaId = mediaIdSchema.safeParse(
      req.params.mediaId,
    );

    const input = updateMediaDetailsSchema.safeParse(
      req.body,
    );

    if (
      !projectId.success ||
      !mediaId.success ||
      !input.success
    ) {
      res.status(400).json({
        error:
          'Please check the image description and try again.',
      });
      return;
    }

    try {
      const media = await updateMyMediaDetails(
        res.locals.authUser.id as string,
        projectId.data,
        mediaId.data,
        input.data,
      );

      res.status(200).json({ media });
    } catch (error) {
      handleGalleryError(error, res, next);
    }
  },
);

// ---------------------------------------------------------
// PUT /api/freelancer/projects/:projectId/media/order
//
// Reorder all READY gallery images atomically.
// ---------------------------------------------------------

projectMediaRouter.put(
  '/projects/:projectId/media/order',
  requireCsrf,
  galleryMutationLimiter,
  async (req, res, next) => {
    const projectId = projectIdSchema.safeParse(
      req.params.projectId,
    );

    const input = reorderMediaSchema.safeParse(
      req.body,
    );

    if (!projectId.success || !input.success) {
      res.status(400).json({
        error:
          'Invalid gallery order. Refresh your images and try again.',
      });
      return;
    }

    try {
      const order = await reorderMyProjectMedia(
        res.locals.authUser.id as string,
        projectId.data,
        input.data,
      );

      res.status(200).json({ order });
    } catch (error) {
      handleGalleryError(error, res, next);
    }
  },
);

// ---------------------------------------------------------
// PUT /api/freelancer/projects/:projectId/media/
//     :mediaId/cover
//
// Select one verified image as the project cover.
// ---------------------------------------------------------

projectMediaRouter.put(
  '/projects/:projectId/media/:mediaId/cover',
  requireCsrf,
  galleryMutationLimiter,
  async (req, res, next) => {
    const projectId = projectIdSchema.safeParse(
      req.params.projectId,
    );

    const mediaId = mediaIdSchema.safeParse(
      req.params.mediaId,
    );

    const input = setMediaCoverSchema.safeParse(
      req.body,
    );

    if (
      !projectId.success ||
      !mediaId.success ||
      !input.success
    ) {
      res.status(400).json({
        error:
          'Invalid image selection. Refresh your gallery and try again.',
      });
      return;
    }

    try {
      const media = await setMyProjectCover(
        res.locals.authUser.id as string,
        projectId.data,
        mediaId.data,
        input.data,
      );

      res.status(200).json({ media });
    } catch (error) {
      handleGalleryError(error, res, next);
    }
  },
);

// ---------------------------------------------------------
// DELETE /api/freelancer/projects/:projectId/media/:mediaId
//
// The request must provide the current image version.
// The object-storage cleanup is queued transactionally.
// ---------------------------------------------------------

projectMediaRouter.delete(
  '/projects/:projectId/media/:mediaId',
  requireCsrf,
  galleryMutationLimiter,
  async (req, res, next) => {
    const projectId = projectIdSchema.safeParse(
      req.params.projectId,
    );

    const mediaId = mediaIdSchema.safeParse(
      req.params.mediaId,
    );

    const input = deleteMediaSchema.safeParse(
      req.body,
    );

    if (
      !projectId.success ||
      !mediaId.success ||
      !input.success
    ) {
      res.status(400).json({
        error:
          'Please refresh your images and try again.',
      });
      return;
    }

    try {
      const deleted = await deleteMyProjectMedia(
        res.locals.authUser.id as string,
        projectId.data,
        mediaId.data,
        input.data.version,
      );

      // Do not claim R2 objects are already gone.
      // Only the DB deletion and cleanup reservation
      // are completed at this point.
      res.status(200).json({
        deleted: {
          id: deleted.id,
        },
      });
    } catch (error) {
      handleGalleryError(error, res, next);
    }
  },
);
