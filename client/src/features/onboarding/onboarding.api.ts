import { apiRequest } from '../../lib/api-client';
import { authApi } from '../auth/auth.api';

import type {
  ProfileResponse,
  UsernameAvailabilityResponse,
  UsernameReservationResponse,
  ProfileDraftInput,
  ProfileMutationResponse,
} from './onboarding.types';

async function protectedWrite<T>(
  path: string,
  method: 'POST' | 'PATCH',
  body?: unknown,
): Promise<T> {
  // The token is obtained for the active browser session.
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

export const onboardingApi = {
  getProfile(): Promise<ProfileResponse> {
    return apiRequest<ProfileResponse>(
      '/api/freelancer/profile',
    );
  },

  checkUsername(
    username: string,
  ): Promise<UsernameAvailabilityResponse> {
    return apiRequest<UsernameAvailabilityResponse>(
      `/api/freelancer/usernames/${encodeURIComponent(username)}/availability`,
    );
  },

  reserveUsername(
    username: string,
  ): Promise<UsernameReservationResponse> {
    return protectedWrite(
      '/api/freelancer/username',
      'POST',
      { username },
    );
  },

  saveDraft(
    input: ProfileDraftInput,
  ): Promise<ProfileMutationResponse> {
    return protectedWrite(
      '/api/freelancer/profile',
      'PATCH',
      input,
    );
  },

  completeOnboarding(): Promise<ProfileMutationResponse> {
    return protectedWrite(
      '/api/freelancer/onboarding/complete',
      'POST',
    );
  },
};
