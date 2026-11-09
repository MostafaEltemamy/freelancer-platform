import { apiRequest } from '../../lib/api-client';
import { protectedWrite } from '../../lib/protected-write';
import type {VersionedRecord} from './portfolio.types';

export type MediaUploadStage =
  | 'preparing'
  | 'uploading'
  | 'verifying';

export interface ProjectMediaRecord extends VersionedRecord {
  projectId: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;

  kind: 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  status: 'PENDING' | 'READY' | 'FAILED';

  isCover: boolean;
  sortOrder: number;
  sectionId: string | null;

  width: number | null;
  height: number | null;

  altText: string | null;
  caption: string | null;

  createdAt: string;
  updatedAt: string;
  readyAt: string | null;

  // Temporary owner-authorized preview URL.
  // Never save this value in the database.
  previewUrl?: string | null;
}

export interface ProjectMediaListResponse {
  media: ProjectMediaRecord[];
}

interface PreparedImageUpload {
  media: ProjectMediaRecord;

  upload: {
    method: 'PUT';
    url: string;
    headers: {
      'Content-Type': string;
    };
    expiresInSeconds: number;
  };
}

interface CompletedImageUpload {
  media: ProjectMediaRecord;
}

export interface MediaDetailsInput {
  version: number;
  altText: string | null;
  caption: string | null;
}

export interface MediaDetailsResponse {
  media: {
    id: string;
    version: number;
    altText: string | null;
    caption: string | null;
  };
}

export interface MediaCoverResponse {
  media: {
    id: string;
    version: number;
    isCover: boolean;
  };
}

export interface MediaOrderResponse {
  order: {
    items: Array<VersionedRecord & {
      sortOrder: number;
    }>;
  };
}

function mediaPath(projectId: string): string {
  return (
    '/api/freelancer/projects/' +
    `${encodeURIComponent(projectId)}/media`
  );
}

function mediaItemPath(
  projectId: string,
  mediaId: string,
): string {
  return (
    `${mediaPath(projectId)}/` +
    encodeURIComponent(mediaId)
  );
}

export const projectMediaApi = {
  // ------------------------------------------------------
  // Owner-only gallery listing
  // ------------------------------------------------------

  list(
    projectId: string,
  ): Promise<ProjectMediaListResponse> {
    return apiRequest<ProjectMediaListResponse>(
      mediaPath(projectId),
    );
  },

  // ------------------------------------------------------
  // Existing image-upload lifecycle
  // ------------------------------------------------------

  prepare(
    projectId: string,
    file: File,
  ): Promise<PreparedImageUpload> {
    return protectedWrite<PreparedImageUpload>(
      `${mediaPath(projectId)}/uploads`,
      'POST',
      {
        originalFilename: file.name,
        mimeType: file.type,
        fileSizeBytes: file.size,
      },
    );
  },

  complete(
    projectId: string,
    mediaId: string,
  ): Promise<CompletedImageUpload> {
    return protectedWrite<CompletedImageUpload>(
      `${mediaPath(projectId)}/uploads/` +
      `${encodeURIComponent(mediaId)}/complete`,
      'POST',
    );
  },

  async uploadImage(
    projectId: string,
    file: File,
    onStage?: (stage: MediaUploadStage) => void,
  ): Promise<CompletedImageUpload> {
    onStage?.('preparing');

    const prepared = await this.prepare(projectId, file);

    onStage?.('uploading');

    let response: Response;

    try {
      response = await fetch(prepared.upload.url, {
        method: 'PUT',
        headers: prepared.upload.headers,
        body: file,
        credentials: 'omit',
        mode: 'cors',
      });
    } catch {
      throw new Error(
        'The image could not be uploaded. ' +
        'Check your connection and try again.',
      );
    }

    if (!response.ok) {
      throw new Error(
        'The image upload was not accepted. ' +
        'Please try again.',
      );
    }

    onStage?.('verifying');

    return this.complete(
      projectId,
      prepared.media.id,
    );
  },

  // ------------------------------------------------------
  // NEW: Edit image description
  // ------------------------------------------------------

  updateDetails(
    projectId: string,
    mediaId: string,
    input: MediaDetailsInput,
  ): Promise<MediaDetailsResponse> {
    return protectedWrite<MediaDetailsResponse>(
      `${mediaItemPath(projectId, mediaId)}/details`,
      'PATCH',
      input,
    );
  },

  // ------------------------------------------------------
  // NEW: Set project cover
  // ------------------------------------------------------

  setCover(
    projectId: string,
    mediaId: string,
    version: number,
  ): Promise<MediaCoverResponse> {
    return protectedWrite<MediaCoverResponse>(
      `${mediaItemPath(projectId, mediaId)}/cover`,
      'PUT',
      { version },
    );
  },

  // ------------------------------------------------------
  // NEW: Reorder verified gallery images
  // ------------------------------------------------------

  reorder(
    projectId: string,
    items: VersionedRecord[],
  ): Promise<MediaOrderResponse> {
    return protectedWrite<MediaOrderResponse>(
      `${mediaPath(projectId)}/order`,
      'PUT',
      { items },
    );
  },
};
