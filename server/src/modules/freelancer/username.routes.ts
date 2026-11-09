import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { prisma } from '../../database/prisma.js';
import { requireSession } from '../auth/require-session.js';
import { requireCsrf } from '../auth/require-csrf.js';

import {
  isReservedUsername,
  reserveUsernameSchema,
  usernameSyntaxSchema,
} from './username.schemas.js';

import {
  isUsernameAvailable,
  reserveUsername,
  UsernameAlreadyAssignedError,
  UsernameUnavailableError,
} from './username.service.js';

import {createProjectSchema} from './project.schemas.js';

import {
  emptyProjectContent,
  projectContentSchema,
} from './project-content.schemas.js';

import {
  presentPublicImage,
  presentPublicGallery,
} from './public-project-media.js';

export const freelancerRouter = Router();
export const publicFreelancerRouter = Router();

const availabilityLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

const reservationLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 15,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

// Check public username availability.
freelancerRouter.get(
  '/usernames/:username/availability',
  availabilityLimiter,
  async (req, res, next) => {
    const parsed = usernameSyntaxSchema.safeParse(
      req.params.username,
    );

    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid username format.',
      });
      return;
    }

    const username = parsed.data;

    if (isReservedUsername(username)) {
      res.json({
        username,
        available: false,
      });
      return;
    }

    try {
      const available = await isUsernameAvailable(username);

      res.setHeader('Cache-Control', 'no-store');

      res.json({
        username,
        available,
      });
    } catch (error) {
      next(error);
    }
  },
);

// Reserve the authenticated user's first username.
freelancerRouter.post(
  '/username',
  requireSession,
  requireCsrf,
  reservationLimiter,
  async (req, res, next) => {
    const parsed = reserveUsernameSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid username.',
        issues: parsed.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }

    const { username } = parsed.data;

    const authUser = res.locals.authUser as {
      id: string;
    };

    try {
      const reservation = await reserveUsername(
        authUser.id,
        username,
      );

      res.setHeader('Cache-Control', 'no-store');

      res.status(reservation.newlyReserved ? 201 : 200).json({
        username: reservation.username,
        profilePath: `/u/${reservation.username}`,
        published: false,
      });
    } catch (error) {
      if (error instanceof UsernameUnavailableError) {
        res.status(409).json({
          error: error.message,
        });
        return;
      }

      if (error instanceof UsernameAlreadyAssignedError) {
        res.status(409).json({
          error: error.message,
        });
        return;
      }

      next(error);
    }
  },
);

// ------------------------------------------------------
// Public project detail
//
// GET /api/public/freelancers/:username/projects/:slug
//
// No customer login required.
// Never expose draft profiles or private projects.
// ------------------------------------------------------

publicFreelancerRouter.get(
  '/:username/projects/:slug',
  async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');

    const username = usernameSyntaxSchema.safeParse(
      req.params.username,
    );

    const slug = createProjectSchema.shape.slug.safeParse(
      req.params.slug,
    );

    // Invalid and reserved identifiers are indistinguishable
    // from unavailable public resources.
    if (
      !username.success ||
      isReservedUsername(username.data) ||
      !slug.success
    ) {
      res.status(404).json({
        error: 'Project not found.',
      });
      return;
    }

    try {
      const project =
        await prisma.portfolioProject.findFirst({
          where: {
            slug: slug.data,
            visibility: 'PUBLIC',

            profile: {
              is: {
                username: username.data,
                status: 'PUBLISHED',
                publishedAt: { not: null },
                onboardingCompletedAt: { not: null },
              },
            },
          },

          select: {
            media: {
              where: {
                kind: 'IMAGE',
                status: 'READY',
                previewKey: {
                  not: null,
                },
              },
              orderBy: [
                { isCover: 'desc' },
                { sortOrder: 'asc' },
                { createdAt: 'asc' },
                { id: 'asc' },
              ],
              take: 40,
              select: {
                previewKey: true,
                altText: true,
                caption: true,
                width: true,
                height: true,
              },
            },
            slug: true,
            title: true,
            summary: true,
            description: true,
            role: true,
            projectUrl: true,
            sourceUrl: true,
            technologies: true,
            startedOn: true,
            endedOn: true,
            isFeatured: true,
            content: true,
          },
        });

      if (!project) {
        res.status(404).json({
          error: 'Project not found.',
        });
        return;
      }

      // Accept only our supported content structure.
      // Legacy SQL NULL becomes an empty document.
      const validated = projectContentSchema.safeParse(
        project.content ?? emptyProjectContent(),
      );

      const content = validated.success
        ? {
            schemaVersion: 1 as const,

            sections: validated.data.sections.map(
              (section) => ({
                title: section.title,
                description: section.description,

                // Section and field UUIDs are editor metadata.
                // Public visitors do not need them.
                fields: section.fields.map((field) => ({
                  label: field.label,
                  type: field.type,
                  value: field.value,
                })),
              }),
            ),
          }
        : emptyProjectContent();

      const publicProject = {
        slug: project.slug,
        title: project.title,
        summary: project.summary,
        description: project.description,
        role: project.role,
        projectUrl: project.projectUrl,
        sourceUrl: project.sourceUrl,
        technologies: project.technologies,
        startedOn: project.startedOn,
        endedOn: project.endedOn,
        isFeatured: project.isFeatured,
      };

      const images = await presentPublicGallery(
        project.media,
      );

      res.status(200).json({
        project: {
          ...publicProject,
          content,
          images,
        },
      });

    } catch (error) {
      next(error);
    }
  },
);

// Public lookup: only completed, published profiles.
publicFreelancerRouter.get(
  '/:username',
  async (req, res, next) => {
    // Public visibility may change at any time.
    res.setHeader('Cache-Control', 'no-store');

    const parsed = usernameSyntaxSchema.safeParse(
      req.params.username,
    );

    if (
      !parsed.success ||
      isReservedUsername(parsed.data)
    ) {
      res.status(404).json({
        error: 'Profile not found.',
      });
      return;
    }

    try {
      const profile = await prisma.freelancerProfile.findFirst({
        where: {
          username: parsed.data,
          status: 'PUBLISHED',
          publishedAt: { not: null },
          onboardingCompletedAt: { not: null },
        },
        
        select: {
          username: true,
          headline: true,
          bio: true,
          city: true,
          countryCode: true,
          websiteUrl: true,

          // Only projects explicitly marked PUBLIC.
          projects: {
            where: {
              visibility: 'PUBLIC',
            },
            orderBy: [
              { isFeatured: 'desc' },
              { sortOrder: 'asc' },
              { createdAt: 'asc' },
              { id: 'asc' },
            ],
            take: 100,
            select: {
              media: {
                where: {
                  kind: 'IMAGE',
                  status: 'READY',
                  isCover: true,
                  previewKey: {
                    not: null,
                  },
                },
                take: 1,
                select: {
                  previewKey: true,
                  altText: true,
                  caption: true,
                  width: true,
                  height: true,
                },
              },
              slug: true,
              title: true,
              summary: true,
              description: true,
              role: true,
              projectUrl: true,
              sourceUrl: true,
              technologies: true,
              startedOn: true,
              endedOn: true,
              isFeatured: true,
            },
          },

          // Skills belonging to this published freelancer.
          skills: {
            orderBy: [
              { sortOrder: 'asc' },
              { id: 'asc' },
            ],
            take: 100,
            select: {
              name: true,
            },
          },
        },
      });

      if (!profile) {
        res.status(404).json({
          error: 'Profile not found.',
        });
        return;
      }

      const projects = await Promise.all(
        profile.projects.map(async (project) => {
          const { media, ...publicProject } = project;

          const coverImage = media[0]
            ? await presentPublicImage(media[0])
            : null;

          return {
            ...publicProject,
            coverImage,
          };
        }),
      );

      res.status(200).json({
        profile: {
          username: profile.username,
          headline: profile.headline,
          bio: profile.bio,
          city: profile.city,
          countryCode: profile.countryCode,
          websiteUrl: profile.websiteUrl,
          skills: profile.skills,
          projects,
        },
      });

    } catch (error) {
      next(error);
    }
  },
);
