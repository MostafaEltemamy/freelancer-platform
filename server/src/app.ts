import express from 'express';
import type { ErrorRequestHandler } from 'express';

import { healthRouter } from './modules/health/health.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';

import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { verifyRequestOrigin } from './middleware/verify-request-origin.js';
import { apiCors } from './middleware/api-cors.js';

import {
  freelancerRouter,
  publicFreelancerRouter,
} from './modules/freelancer/username.routes.js';

export const app = express();

// Disable disclosure of Express information.
app.disable('x-powered-by');

// HTTP security headers.
app.use(
  helmet({
    strictTransportSecurity:
      process.env.NODE_ENV === 'production'
        ? undefined
        : false,
  }),
);

// Request parsing.
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// CORS and CSRF origin verification.
app.use('/api', apiCors);
app.use('/api', verifyRequestOrigin);

// Application routes.
app.use('/api', healthRouter);
app.use('/api/auth', authRouter);

// Authenticated freelancer profile functionality.
app.use('/api/freelancer', freelancerRouter);

// Public, read-only freelancer profiles.
app.use('/api/public/freelancers', publicFreelancerRouter);

// Keep your existing 404 and centralized error handlers below.
app.use((_req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'The requested endpoint does not exist.',
    },
  });
});

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  console.error(error);

  const status =
    error !== null &&
    typeof error === 'object' &&
    'status' in error &&
    typeof error.status === 'number' &&
    error.status >= 400 &&
    error.status < 500
      ? error.status
      : 500;

  res.status(status).json({
    error: {
      code: status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST',
      message:
        status === 500
          ? 'Something went wrong. Please try again.'
          : 'The request could not be processed.',
    },
  });
};

app.use(errorHandler);