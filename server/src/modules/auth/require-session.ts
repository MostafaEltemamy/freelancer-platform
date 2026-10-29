
import type {
  Request,
  Response,
  NextFunction,
} from 'express';

import { prisma } from '../../database/prisma.js';

import { hashSessionToken } from './session-tokens.js';
import { SESSION_COOKIE_NAME } from './session-cookie.js';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export async function requireSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // Private responses should not be cached.
  res.setHeader('Cache-Control', 'no-store');

  const token: unknown =
    req.cookies?.[SESSION_COOKIE_NAME];

  // Reject missing or malformed tokens.
  if (
    typeof token !== 'string' ||
    !TOKEN_PATTERN.test(token)
  ) {
    res.status(401).json({
      error: 'Authentication required.',
    });
    return;
  }

  // Never query the database using the raw token.
  const tokenHash = hashSessionToken(token);

  try {
    const session = await prisma.session.findFirst({
      where: {
        tokenHash,

        // Expired sessions cannot authenticate.
        expiresAt: {
          gt: new Date(),
        },
      },

      select: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            createdAt: true,
          },
        },
      },
    });

    if (!session) {
      res.status(401).json({
        error: 'Invalid or expired session.',
      });
      return;
    }

    // Store authenticated identity for later handlers.
    res.locals.authUser = session.user;

    next();
  } catch (error) {
    next(error);
  }
}
