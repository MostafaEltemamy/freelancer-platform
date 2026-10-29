
import { apiRequest } from '../../lib/api-client';

import type {
  AuthResponse,
  CurrentUserResponse,
  CsrfResponse,
  LoginInput,
  RegistrationInput,
} from './auth.types';

export const authApi = {

  // Register a new user account.
  register(input: RegistrationInput) {
    return apiRequest<AuthResponse>(
      '/api/auth/register',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      },
    );
  },

  // Authenticate an existing user.
  login(input: LoginInput) {
    return apiRequest<AuthResponse>(
      '/api/auth/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      },
    );
  },

  // Retrieve the current authenticated user.
  async me() {
    const result =
      await apiRequest<CurrentUserResponse>(
        '/api/auth/me',
      );

    return result.user;
  },

  // Retrieve the session-bound CSRF token.
  async getCsrfToken() {
    const result =
      await apiRequest<CsrfResponse>(
        '/api/auth/csrf',
      );

    return result.csrfToken;
  },

  // Revoke the current browser session.
  async logout() {
    const csrfToken = await authApi.getCsrfToken();

    await apiRequest<void>(
      '/api/auth/logout',
      {
        method: 'POST',
        headers: {
          'X-CSRF-Token': csrfToken,
        },
      },
    );
  },
};
