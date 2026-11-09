import {useEffect, useRef, useState} from 'react';
import type {ChangeEvent, DragEvent} from 'react';
import { ApiError } from '../../lib/api-client';
import { SortablePortfolioList } from './SortablePortfolioList';
import {ProjectMediaDeleteConfirmation} from './ProjectMediaDeleteConfirmation';
import { projectMediaApi } from './project-media.api';
import type {MediaUploadStage, ProjectMediaRecord} from './project-media.api';
import type {VersionedRecord} from './portfolio.types';
import {validateProjectImage} from './project-media.validation';
import './project-image-manager.css';

// ---------------------------------------------------------
// Types
// ---------------------------------------------------------

interface Props {
  projectId: string;
  disabled: boolean;
  onActivityChange?: (active: boolean) => void;
}

interface ImageDetailsDraft {
  id: string;
  version: number;
  filename: string;
  altText: string;
  caption: string;
}

const STAGE_MESSAGES: Record<MediaUploadStage, string> = {
  preparing: 'Preparing secure upload…',
  uploading: 'Uploading image…',
  verifying: 'Verifying and optimizing image…',
};

// ---------------------------------------------------------
// Helpers
// ---------------------------------------------------------

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong. Please try again.';
}

function isStaleMediaError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    error.code === 'STALE_MEDIA_VERSION'
  );
}

function imageLabel(image: ProjectMediaRecord): string {
  return image.originalFilename;
}

// ---------------------------------------------------------
// Component
// ---------------------------------------------------------

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

  const [editing, setEditing] =
    useState<ImageDetailsDraft | null>(null);

  const [confirmDelete, setConfirmDelete] =
    useState<ProjectMediaRecord | null>(null);

  // Prevent further writes if the browser has outdated
  // versions or the latest saved data could not be loaded.
  const [needsRefresh, setNeedsRefresh] =
    useState(false);

  // A ref prevents overlapping mutations even before
  // React has rendered the new busy state.
  const operationActive = useRef(false);

  // -------------------------------------------------------
  // Load gallery
  // -------------------------------------------------------

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

  // -------------------------------------------------------
  // Refresh authoritative image records
  // -------------------------------------------------------

  async function refreshGallery(): Promise<void> {
    if (
      operationActive.current ||
      refreshing ||
      editing !== null ||
      confirmDelete !== null
    ) {
      return;
    }

    setRefreshing(true);
    setError(null);
    setNotice(null);

    try {
      const response = await projectMediaApi.list(
        projectId,
      );

      setMedia(response.media);
      setNeedsRefresh(false);
    } catch (err) {
      setError(
        'Unable to refresh your gallery. ' +
        errorMessage(err),
      );
    } finally {
      setRefreshing(false);
    }
  }

  // -------------------------------------------------------
  // Shared safe mutation workflow
  //
  // Every successful mutation reloads authoritative
  // versions from the server.
  // -------------------------------------------------------

  async function runMutation(
    action: () => Promise<unknown>,
    successMessage: string,
  ): Promise<boolean> {
    if (
      disabled ||
      loading ||
      refreshing ||
      needsRefresh ||
      operationActive.current
    ) {
      return false;
    }

    operationActive.current = true;

    setWorking(true);
    setError(null);
    setNotice(null);

    onActivityChange?.(true);

    let mutationCompleted = false;

    try {
      await action();

      mutationCompleted = true;

      const response = await projectMediaApi.list(
        projectId,
      );

      setMedia(response.media);
      setNeedsRefresh(false);
      setNotice(successMessage);

      return true;
    } catch (err) {
      if (mutationCompleted) {
        // The write succeeded, but the read failed.
        // Never tell the freelancer to repeat the write.
        setNeedsRefresh(true);

        setError(
          'Your gallery change was saved, but the ' +
          'latest images could not be loaded. ' +
          'Please select Refresh images before ' +
          'making further changes.',
        );

        return true;
      }

      if (isStaleMediaError(err)) {
        setNeedsRefresh(true);

        setError(
          'Your gallery was changed in another tab. ' +
          'Your unsaved description is still here. ' +
          'Finish reviewing it, then refresh your images ' +
          'before making another change.',
        );

        return false;
      }

      setError(errorMessage(err));
      return false;
    } finally {
      operationActive.current = false;

      setWorking(false);
      setStage(null);

      onActivityChange?.(false);
    }
  }

  // -------------------------------------------------------
  // Upload one verified image
  // -------------------------------------------------------

  async function uploadImage(file: File): Promise<void> {
    if (
      disabled ||
      editing !== null ||
      operationActive.current
    ) {
      return;
    }

    const validationError = validateProjectImage(file);

    if (validationError) {
      setError(validationError);
      setNotice(null);
      return;
    }

    setStage('preparing');

    await runMutation(
      () => projectMediaApi.uploadImage(
        projectId,
        file,
        setStage,
      ),
      'Image uploaded successfully.',
    );
  }

  function handleFileChange(
    event: ChangeEvent<HTMLInputElement>,
  ): void {
    const file = event.currentTarget.files?.[0];

    // Allow choosing the same file again after an error.
    event.currentTarget.value = '';

    if (file) {
      void uploadImage(file);
    }
  }

  function handleDragOver(
    event: DragEvent<HTMLDivElement>,
  ): void {
    if (
      disabled ||
      working ||
      editing !== null ||
      needsRefresh
    ) {
      return;
    }

    event.preventDefault();
  }

  function handleDrop(
    event: DragEvent<HTMLDivElement>,
  ): void {
    event.preventDefault();

    if (
      disabled ||
      working ||
      refreshing ||
      editing !== null ||
      needsRefresh
    ) {
      return;
    }

    const file = event.dataTransfer.files?.[0];

    if (file) {
      void uploadImage(file);
    }
  }

  // -------------------------------------------------------
  // Set a cover image
  // -------------------------------------------------------

  async function setCover(
    image: ProjectMediaRecord,
  ): Promise<void> {
    if (editing !== null || image.isCover) {
      return;
    }

    await runMutation(
      () => projectMediaApi.setCover(
        projectId,
        image.id,
        image.version,
      ),
      'Project cover updated successfully.',
    );
  }

  // -------------------------------------------------------
  // Start or cancel editing one image's description
  // -------------------------------------------------------

  function startEditing(
    image: ProjectMediaRecord,
  ): void {
    if (
      disabled ||
      working ||
      needsRefresh ||
      refreshing
    ) {
      return;
    }

    setEditing({
      id: image.id,
      version: image.version,
      filename: image.originalFilename,
      altText: image.altText ?? '',
      caption: image.caption ?? '',
    });

    setError(null);
    setNotice(null);
  }

  function cancelEditing(): void {
    if (working) return;

    setEditing(null);
  }

  // -------------------------------------------------------
  // Save caption and alternative text
  // -------------------------------------------------------

  async function saveDetails(): Promise<void> {
    if (!editing) return;

    const draft = editing;

    const altText = draft.altText.trim();
    const caption = draft.caption.trim();

    if (altText.length > 200) {
      setError(
        'Alternative text must be 200 characters or shorter.',
      );
      return;
    }

    if (caption.length > 500) {
      setError(
        'Caption must be 500 characters or shorter.',
      );
      return;
    }

    const saved = await runMutation(
      () => projectMediaApi.updateDetails(
        projectId,
        draft.id,
        {
          version: draft.version,
          altText: altText || null,
          caption: caption || null,
        },
      ),
      'Image description saved successfully.',
    );

    if (saved) {
      setEditing(null);
    }
  }

  // -------------------------------------------------------
  // Save drag-and-drop gallery order
  // -------------------------------------------------------

  async function reorderImages(
    items: VersionedRecord[],
  ): Promise<boolean> {
    if (editing !== null || confirmDelete !== null || items.length < 2) {
      return false;
    }

    return runMutation(
      () => projectMediaApi.reorder(
        projectId,
        items,
      ),
      'Gallery order updated successfully.',
    );
  }

// -------------------------------------------------------
// Confirm and delete one project image
// -------------------------------------------------------

function requestImageDeletion(
  image: ProjectMediaRecord,
): void {
  if (
    disabled ||
    loading ||
    working ||
    refreshing ||
    needsRefresh ||
    editing !== null ||
    confirmDelete !== null ||
    operationActive.current
  ) {
    return;
  }

  setConfirmDelete(image);
  setError(null);
  setNotice(null);
}

function cancelImageDeletion(): void {
  if (working || operationActive.current) {
    return;
  }

  setConfirmDelete(null);
}

async function confirmImageDeletion(): Promise<void> {
  const target = confirmDelete;

  if (!target || editing !== null) {
    return;
  }

  const saved = await runMutation(
    () => projectMediaApi.deleteImage(
      projectId,
      target.id,
      target.version,
    ),
    'Image removed from your portfolio. ' +
      'Storage cleanup has been scheduled.',
  );

  if (saved) {
    setConfirmDelete(null);
  }
}

  // -------------------------------------------------------
  // Derived display state
  // -------------------------------------------------------

  const readyImages = media.filter(
    (item) =>
      item.status === 'READY' &&
      item.kind === 'IMAGE',
  );

  const pendingImages = media.filter(
    (item) => item.status !== 'READY',
  );

  const controlsDisabled =
    disabled ||
    loading ||
    working ||
    refreshing ||
    needsRefresh;

  const editingOpen = editing !== null;

  const galleryActionsDisabled =
    controlsDisabled ||
    editingOpen ||
    confirmDelete !== null;

  // -------------------------------------------------------
  // Render
  // -------------------------------------------------------

  return (
    <section
      className="project-image-manager"
      aria-label="Project images"
    >
      <div className="project-image-manager-heading">
        <div>
          <h3>Images & Gallery</h3>

          <p className="profile-help">
            Upload examples of your work, select a cover,
            and organize the gallery by dragging images.
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          disabled={
            working ||
            refreshing ||
            editingOpen ||
            confirmDelete !== null
          }
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
            Or choose an image from your computer.
          </p>

          <input
            id={`project-image-${projectId}`}
            type="file"
            aria-label="Choose project image"
            accept="image/jpeg,image/png,image/webp"
            disabled={galleryActionsDisabled}
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
            : 'Saving your gallery changes…'}
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="form-alert form-alert--error"
        >
          {error}
        </div>
      )}

      {notice && (
        <p
          role="status"
          className="form-alert form-alert--success"
        >
          {notice}
        </p>
      )}

      {needsRefresh && (
        <p className="profile-help">
          Your gallery needs a refresh before further
          changes. If you are editing an image description,
          copy anything you need to keep, select Cancel
          editing, and then select Refresh images.
        </p>
      )}

      {loading ? (
        <p role="status">Loading images…</p>
      ) : (
        <>
          <div className="project-media-gallery-heading">
            <h4>Project images</h4>

            <span className="profile-help">
              {media.length} of 40 media items
            </span>
          </div>

          {media.length === 0 && (
            <p className="profile-help">
              No images yet. Upload an image to begin
              building your gallery.
            </p>
          )}

          {readyImages.length > 0 && (
            <div className="project-media-sortable-gallery">
              <p className="profile-help">
                {readyImages.length > 1
                  ? 'Drag the handle beside an image to change its position.'
                  : 'Upload another image to enable gallery reordering.'}
              </p>

              <SortablePortfolioList
                items={readyImages}
                disabled={galleryActionsDisabled}
                showHandles
                label={imageLabel}
                onReorder={reorderImages}
                renderItem={(image) => (
                  <figure className="project-media-card">
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

                      {image.caption && (
                        <p className="project-media-caption">
                          {image.caption}
                        </p>
                      )}

                      <div className="project-media-card-actions">
                        {!image.isCover && !disabled && (
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={galleryActionsDisabled}
                            onClick={() => void setCover(image)}
                            aria-label={
                              `Set ${image.originalFilename} as cover`
                            }
                          >
                            Set as cover
                          </button>
                        )}

                        {!disabled && (
                          <button
                            type="button"
                            className="project-media-delete-link"
                            disabled={galleryActionsDisabled}
                            onClick={() => requestImageDeletion(image)}
                            aria-label={`Delete ${image.originalFilename}`}
                          >
                            Delete image
                          </button>
                        )}

                        {!disabled && (
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={galleryActionsDisabled}
                            onClick={() => startEditing(image)}
                            aria-label={
                              `Edit description for ${image.originalFilename}`
                            }
                          >
                            Edit description
                          </button>
                        )}
                      </div>
                    </figcaption>
                  </figure>
                )}
              />
            </div>
          )}

          {confirmDelete && (
            <ProjectMediaDeleteConfirmation
              media={confirmDelete}
              busy={working}
              confirmDisabled={
                disabled || needsRefresh || refreshing
              }
              onConfirm={() => void confirmImageDeletion()}
              onCancel={cancelImageDeletion}
            />
          )}

          {editing && (
            <div
              role="group"
              aria-label="Edit image description"
              className="project-media-details-editor"
            >
              <h4>
                Describe {editing.filename}
              </h4>

              <p className="profile-help">
                Alternative text describes the image
                for visitors using screen readers.
                Captions are visible below the image.
              </p>

              <div className="form-field">
                <label htmlFor="media-alt-text">
                  Image alternative text
                </label>

                <textarea
                  id="media-alt-text"
                  rows={2}
                  maxLength={200}
                  disabled={working}
                  value={editing.altText}
                  onChange={(event) =>
                    setEditing((current) =>
                      current
                        ? {
                            ...current,
                            altText: event.target.value,
                          }
                        : current
                    )
                  }
                  placeholder="Describe what the image shows"
                />

                <small>
                  {editing.altText.length}/200 characters
                </small>
              </div>

              <div className="form-field">
                <label htmlFor="media-caption">
                  Image caption
                </label>

                <textarea
                  id="media-caption"
                  rows={3}
                  maxLength={500}
                  disabled={working}
                  value={editing.caption}
                  onChange={(event) =>
                    setEditing((current) =>
                      current
                        ? {
                            ...current,
                            caption: event.target.value,
                          }
                        : current
                    )
                  }
                  placeholder="Explain the work, result, or deliverable"
                />

                <small>
                  {editing.caption.length}/500 characters
                </small>
              </div>

              <div className="onboarding-actions">
                <button
                  type="button"
                  className="primary-button"
                  disabled={controlsDisabled}
                  onClick={() => void saveDetails()}
                >
                  {working
                    ? 'Saving…'
                    : 'Save image description'}
                </button>

                <button
                  type="button"
                  className="secondary-button"
                  disabled={working}
                  onClick={cancelEditing}
                >
                  Cancel editing
                </button>
              </div>
            </div>
          )}

          {pendingImages.length > 0 && (
            <div className="project-media-pending">
              <h4>Uploads awaiting completion</h4>

          {pendingImages.map((image) => (
            <div
              key={image.id}
              className="project-media-pending-item"
            >
              <span>
                {image.originalFilename} —{' '}
                {image.status === 'PENDING'
                  ? 'Pending'
                  : 'Processing failed'}
              </span>

              {!disabled && (
                <button
                  type="button"
                  className="project-media-delete-link"
                  disabled={galleryActionsDisabled}
                  onClick={() => requestImageDeletion(image)}
                  aria-label={`Delete ${image.originalFilename}`}
                >
                  Remove upload
                </button>
              )}
            </div>
          ))}

            </div>
          )}
        </>
      )}

      <p className="profile-help">
        Only verified images can be used as covers
        or arranged in the gallery. Image changes
        are saved independently from project text.
      </p>
    </section>
  );
}