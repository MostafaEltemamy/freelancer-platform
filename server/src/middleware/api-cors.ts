
import cors from 'cors';

import {
  TRUSTED_ORIGINS,
} from '../config/trusted-origins.js';

export const apiCors = cors({
  origin(origin, callback) {
    if (origin && TRUSTED_ORIGINS.has(origin)) {
      callback(null, origin);
      return;
    }

    // Do not grant cross-origin browser access.
    callback(null, false);
  },

  credentials: true,

  methods: [
    'GET',
    'HEAD',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
  ],

  allowedHeaders: [
    'Content-Type',
    'X-CSRF-Token',
  ],

  maxAge: 600,

  optionsSuccessStatus: 204,
});
