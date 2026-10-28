import { Router } from 'express';
import { prisma } from '../../database/prisma.js';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'freelancer-platform-api',
  });
});

healthRouter.get('/ready', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  try {
    // Checks connectivity and access to the migrated users table.
    // No account data is returned to the caller.
    await prisma.user.findFirst({
      select: { id: true },
    });

    res.status(200).json({
      status: 'ready',
      service: 'freelancer-platform-api',
      database: 'connected',
    });
  } catch {
    console.error('Database readiness check failed.');

    res.status(503).json({
      status: 'not_ready',
      service: 'freelancer-platform-api',
      database: 'unavailable',
    });
  }
});