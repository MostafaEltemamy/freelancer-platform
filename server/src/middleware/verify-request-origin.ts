
import type { RequestHandler } from 'express';

import {
  TRUSTED_ORIGINS,
} from '../config/trusted-origins.js';

const SAFE_METHODS = new Set([
  'GET',
  'HEAD',
  'OPTIONS',
]);

export const verifyRequestOrigin: RequestHandler = (
  req,
  res,
  next,
) => {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  res.vary('Origin');

  const origin = req.get('Origin');
  const referer = req.get('Referer');

  if (origin) {
    if (TRUSTED_ORIGINS.has(origin)) {
      next();
      return;
    }
  } else if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;

      if (TRUSTED_ORIGINS.has(refererOrigin)) {
        next();
        return;
      }
    } catch {
      // Invalid Referer is rejected below.
    }
  }

  res.setHeader('Cache-Control', 'no-store');

  res.status(403).json({
    error: 'Request origin not allowed.',
  });
};
