import { apiRequest } from '../../lib/api-client';
import { protectedWrite } from '../../lib/protected-write';

import type {
  ProfileDraftInput,
  ProfileMutationResponse,
  ProfileResponse,
} from '../onboarding/onboarding.types';

import type {
  PublicProfileResponse,
} from './profile.types';

export const profileApi = {
  getMine(): Promise<ProfileResponse> {
    return apiRequest<ProfileResponse>(
      '/api/freelancer/profile',
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

  publish(): Promise<ProfileMutationResponse> {
    return protectedWrite(
      '/api/freelancer/profile/publish',
      'POST',
    );
  },

  unpublish(): Promise<ProfileMutationResponse> {
    return protectedWrite(
      '/api/freelancer/profile/unpublish',
      'POST',
    );
  },

  getPublic(username: string): Promise<PublicProfileResponse> {
    return apiRequest<PublicProfileResponse>(
      `/api/public/freelancers/${encodeURIComponent(username)}`,
    );
  },
};
