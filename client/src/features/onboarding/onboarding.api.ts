import { apiRequest } from '../../lib/api-client';
import { protectedWrite } from '../../lib/protected-write';

import type {
  ProfileResponse,
  UsernameAvailabilityResponse,
  UsernameReservationResponse,
  ProfileDraftInput,
  ProfileMutationResponse,
} from './onboarding.types';

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
