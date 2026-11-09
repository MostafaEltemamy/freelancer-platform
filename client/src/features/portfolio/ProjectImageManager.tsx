import {
  useEffect,
  useRef,
  useState,
} from 'react';

import type {
  ChangeEvent,
  DragEvent,
} from 'react';

import {
  projectMediaApi,
} from './project-media.api';

import type {
  MediaUploadStage,
  ProjectMediaRecord,
} from './project-media.api';

import {
  validateProjectImage,
} from './project-media.validation';

import './project-image-manager.css';

interface Props {
  projectId: string;
  disabled: boolean;

  onActivityChange?: (active: boolean) => void;
}

const STAGE_MESSAGES: Record<MediaUploadStage, string> = {
  preparing: 'Preparing secure upload…',
  uploading: 'Uploading image…',
  verifying: 'Verifying and optimizing image…',
};

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Something went wrong. Please try again.';
}

export function ProjectImageManager({
  projectId,
  disabled,
  onActivityChange,
}: Props) {
  const [media, setMedia] =
    useState<ProjectMediaRecord[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [working, setWorking] = useState(false);

  const [stage, setStage] =
    useState<MediaUploadStage | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const [notice, setNotice] =
    useState<string | null>(null);

  // Prevent overlapping uploads, including multiple drop events
  // that occur before React has rendered the new working state.
  const uploadActive = useRef(false);

  useEffect(() => {
    let active = true;

    void projectMediaApi.list(projectId)
      .then((response) => {
        if (!active) return;

        setMedia(response.media);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;

        setError(
          'Unable to load your project images. ' +
          errorMessage(err),
        );
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [projectId]);

  async function refreshGallery(): Promise<void> {
    if (uploadActive.current || refreshing) {
      return;
    }

    setRefreshing(true);
    setError(null);

    try {
      const response = await projectMediaApi.list(
        projectId,
      );

      setMedia(response.media);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRefreshing(false);
    }
  }

  async function uploadImage(file: File): Promise<void> {
    if (disabled || uploadActive.current) {
      return;
    }

    const validationError = validateProjectImage(file);

    if (validationError) {
      setError(validationError);
      setNotice(null);
      return;
    }

    uploadActive.current = true;

    setWorking(true);
    setError(null);
    setNotice(null);
    setStage('preparing');

    onActivityChange?.(true);

    let finalized = false;

    try {
      await projectMediaApi.uploadImage(
        projectId,
        file,
        setStage,
      );

      finalized = true;

      const response = await projectMediaApi.list(
        projectId,
      );

      setMedia(response.media);
      setNotice('Image uploaded successfully.');
    } catch (err) {
      if (finalized) {
        setError(
          'Your image was saved, but the gallery could ' +
          'not refresh. Select Refresh images.',
        );
      } else {
        setError(errorMessage(err));
      }
    } finally {
      uploadActive.current = false;
      setWorking(false);
      setStage(null);

      onActivityChange?.(false);
    }
  }

  function handleFileChange(
    event: ChangeEvent<HTMLInputElement>,
  ): void {
    const file = event.currentTarget.files?.[0];

    // Allow selecting the same file again after an error.
    event.currentTarget.value = '';

    if (file) {
      void uploadImage(file);
    }
  }

  function handleDragOver(
    event: DragEvent<HTMLDivElement>,
  ): void {
    if (disabled || working) {
      return;
    }

    event.preventDefault();
  }

  function handleDrop(
    event: DragEvent<HTMLDivElement>,
  ): void {
    event.preventDefault();

    if (disabled || working) {
      return;
    }

    const file = event.dataTransfer.files.item(0);

    if (file) {
      void uploadImage(file);
    }
  }

  const isUnavailable =
    disabled || working || refreshing;

  const readyImages = media.filter(
    (item) => item.status === 'READY',
  );

  const pendingImages = media.filter(
    (item) => item.status !== 'READY',
  );

  return (
    <section
      className="project-image-manager"
      aria-label="Project images"
    >
      <div className="project-image-manager-heading">
        <div>
          <h3>Images & Gallery</h3>

          <p className="profile-help">
            Upload photographs, designs, screenshots,
            or other examples of your work.
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          disabled={working || refreshing}
          onClick={() => void refreshGallery()}
        >
          {refreshing
            ? 'Refreshing…'
            : 'Refresh images'}
        </button>
      </div>

      {!disabled && (
        <div
          className="project-media-dropzone"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <strong>Drop an image here</strong>

          <p>
            Or select an image from your computer.
          </p>

          <input
            id={`project-image-${projectId}`}
            type="file"
            aria-label="Choose project image"
            accept="image/jpeg,image/png,image/webp"
            disabled={isUnavailable}
            onChange={handleFileChange}
          />

          <small>
            JPEG, PNG, WebP · Maximum 12 MB
          </small>
        </div>
      )}

      {working && (
        <p role="status" className="profile-help">
          {stage
            ? STAGE_MESSAGES[stage]
            : 'Processing image…'}
        </p>
      )}

      {error && (
        <div
          className="form-alert form-alert--error"
          role="alert"
        >
          {error}
        </div>
      )}

      {notice && (
        <p
          className="form-alert form-alert--success"
          role="status"
        >
          {notice}
        </p>
      )}

      {loading ? (
        <p role="status">Loading images…</p>
      ) : (
        <>
          <div className="project-media-gallery-heading">
            <h4>Project images</h4>

            <span className="profile-help">
              {media.length} of 40 images
            </span>
          </div>

          {media.length === 0 && (
            <p className="profile-help">
              No images yet. Upload an image to start
              building your project gallery.
            </p>
          )}

          {readyImages.length > 0 && (
            <div className="project-media-gallery">
              {readyImages.map((image) => (
                <figure
                  className="project-media-card"
                  key={image.id}
                >
                  {image.previewUrl ? (
                    <img
                      src={image.previewUrl}
                      alt={
                        image.altText ||
                        image.originalFilename
                      }
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="project-media-no-preview">
                      Preview unavailable
                    </div>
                  )}

                  <figcaption>
                    <strong>
                      {image.originalFilename}
                    </strong>

                    {image.width && image.height && (
                      <small>
                        {image.width} × {image.height}
                      </small>
                    )}

                    {image.isCover && (
                      <span className="portfolio-chip">
                        Cover image
                      </span>
                    )}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}

          {pendingImages.length > 0 && (
            <div className="project-media-pending">
              <h4>Uploads awaiting completion</h4>

              {pendingImages.map((image) => (
                <p key={image.id}>
                  {image.originalFilename} —{' '}
                  {image.status === 'PENDING'
                    ? 'Pending'
                    : 'Processing failed'}
                </p>
              ))}
            </div>
          )}
        </>
      )}

      <p className="profile-help">
        Images remain in private storage. The next
        gallery-management step will add cover selection,
        captions, reordering, and public display.
      </p>
    </section>
  );
}