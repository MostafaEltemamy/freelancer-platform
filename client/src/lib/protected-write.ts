import { apiRequest } from './api-client';
import { authApi } from '../features/auth/auth.api';

type WriteMethod = 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export async function protectedWrite<T>(
  path: string,
  method: WriteMethod,
  body?: unknown,
): Promise<T> {
  // Obtain the CSRF token for the current authenticated session.
  const csrfToken = await authApi.getCsrfToken();

  return apiRequest<T>(path, {
    method,
    headers: {
      'X-CSRF-Token': csrfToken,
      ...(body === undefined
        ? {}
        : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body) }),
  });
}
