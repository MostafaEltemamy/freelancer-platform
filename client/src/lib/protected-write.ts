import { apiRequest } from './api-client';
import { authApi } from '../features/auth/auth.api';

export async function protectedWrite<T>(
  path: string,
  method: 'POST' | 'PATCH',
  body?: unknown,
): Promise<T> {
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
