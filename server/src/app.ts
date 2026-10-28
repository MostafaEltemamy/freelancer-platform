import express from 'express';
import type { ErrorRequestHandler } from 'express';
import { healthRouter } from './modules/health/health.routes.js';

export const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.use('/api', healthRouter);

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