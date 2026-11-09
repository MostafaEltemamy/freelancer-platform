import { apiRequest } from '../../lib/api-client';
import { protectedWrite } from '../../lib/protected-write';

export type MediaUploadStage =
  | 'preparing'
  | 'uploading'
  | 'verifying';

export interface ProjectMediaRecord {
  id: string;
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
  version: number;
  createdAt: string;
  updatedAt: string;
  readyAt: string | null;

  // Returned by the owner-only listing endpoint.
  // Short-lived; never store it in the database.
  previewUrl?: string | null;
}

interface ProjectMediaListResponse {
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

function mediaPath(projectId: string): string {
  return (
    `/api/freelancer/projects/` +
    `${encodeURIComponent(projectId)}/media`
  );
}

export const projectMediaApi = {
  list(
    projectId: string,
  ): Promise<ProjectMediaListResponse> {
    return apiRequest<ProjectMediaListResponse>(
      mediaPath(projectId),
    );
  },

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

  /**
   * Upload one image using our private R2 workflow.
   *
   * Authentication and CSRF are used only for
   * backend API requests.
   *
   * The signed PUT is sent directly to object storage,
   * without session cookies or API authorization headers.
   */
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
};
