import type {ProjectMediaRecord} from './project-media.api';

interface Props {
  media: ProjectMediaRecord;
  busy: boolean;
  confirmDisabled: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ProjectMediaDeleteConfirmation({
  media,
  busy,
  onConfirm,
  onCancel,
  confirmDisabled,
}: Props) {
  const isPending = media.status === 'PENDING';

  return (
    <section
      className="project-media-delete-confirmation"
      role="group"
      aria-label={`Confirm deletion of ${media.originalFilename}`}
    >
      <h4>
        {media.isCover
          ? 'Delete the project cover?'
          : 'Delete this image?'}
      </h4>

      <p>
        <strong>{media.originalFilename}</strong>
      </p>

      <p>
        {isPending
          ? 'This upload has not finished. Removing it ' +
            'will cancel its gallery record.'
          : 'This image will be removed from the project ' +
            'gallery. This action cannot be undone.'}
      </p>

      {media.isCover && (
        <p className="project-media-cover-warning">
          This is your current project cover.
          The project will have no cover until
          you select another image.
        </p>
      )}

      <p className="profile-help">
        Storage cleanup will be scheduled automatically.
      </p>

      <div className="onboarding-actions">
        <button
          type="button"
          className="project-media-danger-button"
          disabled={busy || confirmDisabled}
          onClick={onConfirm}
        >
          {busy
            ? 'Removing image…'
            : 'Yes, delete image'}
        </button>

        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={onCancel}
        >
          Keep image
        </button>
      </div>
    </section>
  );
}
