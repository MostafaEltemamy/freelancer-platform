export type MediaStatus =
  | 'PENDING'
  | 'FINALIZING'
  | 'READY'
  | 'FAILED';

export type MediaKind =
  | 'IMAGE'
  | 'VIDEO'
  | 'DOCUMENT';

export interface MediaReference {
  id: string;
  version: number;
  status: MediaStatus;
  kind: MediaKind;
  storageKey: string;
  previewKey: string | null;
  fileSizeBytes: number;
  mimeType: string;
}

export type ObjectHead =
  | { exists: false }
  | {
      exists: true;
      bytes: number | undefined;
      mimeType: string | undefined;
    };

export interface MediaReferenceReaders {
  listPage(input: {
    afterId?: string;
    pageSize: number;
  }): Promise<{
    items: MediaReference[];
    hasMore: boolean;
  }>;

  headObject(key: string): Promise<ObjectHead>;

  // Recheck a problematic record before reporting it.
  unchanged(record: MediaReference): Promise<boolean>;
}

export interface ReferenceAuditReport {
  mode: 'READ_ONLY';
  checkedAt: string;
  complete: boolean;
  pagesScanned: number;
  recordsScanned: number;
  headRequests: number;
  changedDuringVerification: number;

  ready: {
    records: number;
    images: number;
    healthyRecords: number;
    brokenRecords: number;
    missingOriginal: number;
    originalMetadataMismatch: number;
    missingPreviewKey: number;
    missingPreviewObject: number;
    invalidPreviewMetadata: number;
  };

  pendingRecords: number;
  finalizingRecords: number;
  failedRecords: number;
}

function mime(value?: string): string {
  return value?.split(';')[0]?.trim().toLowerCase() ?? '';
}

function validOriginal(
  head: ObjectHead,
  record: MediaReference,
): boolean {
  return (
    head.exists &&
    head.bytes === record.fileSizeBytes &&
    mime(head.mimeType) === mime(record.mimeType)
  );
}

function validPreview(head: ObjectHead): boolean {
  return (
    head.exists &&
    typeof head.bytes === 'number' &&
    Number.isSafeInteger(head.bytes) &&
    head.bytes > 0 &&
    mime(head.mimeType) === 'image/webp'
  );
}

/**
 * Read-only audit. Never changes database or R2 objects.
 *
 * A missing READY object is rechecked against the current
 * database version before it is counted as a finding.
 */
export async function auditMediaReferences(
  readers: MediaReferenceReaders,
  options: {
    now?: Date;
    pageSize?: number;
    maxPages?: number;
  } = {},
): Promise<ReferenceAuditReport> {
  const now = options.now ?? new Date();
  const pageSize = options.pageSize ?? 50;
  const maxPages = options.maxPages ?? 100;

  if (
    !Number.isFinite(now.getTime()) ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 200 ||
    !Number.isInteger(maxPages) ||
    maxPages < 1 ||
    maxPages > 5000
  ) {
    throw new RangeError(
      'Invalid media reference audit configuration.',
    );
  }

  const report: ReferenceAuditReport = {
    mode: 'READ_ONLY',
    checkedAt: now.toISOString(),
    complete: false,
    pagesScanned: 0,
    recordsScanned: 0,
    headRequests: 0,
    changedDuringVerification: 0,

    ready: {
      records: 0,
      images: 0,
      healthyRecords: 0,
      brokenRecords: 0,
      missingOriginal: 0,
      originalMetadataMismatch: 0,
      missingPreviewKey: 0,
      missingPreviewObject: 0,
      invalidPreviewMetadata: 0,
    },

    pendingRecords: 0,
    finalizingRecords: 0,
    failedRecords: 0,
  };

  let afterId: string | undefined;

  while (report.pagesScanned < maxPages) {
    const page = await readers.listPage({
      afterId,
      pageSize,
    });

    report.pagesScanned++;

    if (
      page.items.length > pageSize ||
      (page.hasMore && page.items.length === 0)
    ) {
      throw new Error(
        'Invalid media-reference pagination response.',
      );
    }

    for (let i = 0; i < page.items.length; i++) {
      const current = page.items[i]!;

      if (
        (i === 0 && afterId && current.id <= afterId) ||
        (i > 0 && current.id <= page.items[i - 1]!.id)
      ) {
        throw new Error(
          'Media-reference pagination is not ordered.',
        );
      }
    }

    for (const record of page.items) {
      report.recordsScanned++;

      // Incomplete uploads may legitimately have no
      // object yet. Do not classify them as broken.
      if (record.status === 'PENDING') {
        report.pendingRecords++;
        continue;
      }

      if (record.status === 'FAILED') {
        report.failedRecords++;
        continue;
      }

      if (record.status === 'FINALIZING') {
        report.finalizingRecords++;
        continue;
      }

      report.headRequests++;
      const original = await readers.headObject(
        record.storageKey,
      );

      let preview: ObjectHead | null = null;

      if (
        record.kind === 'IMAGE' &&
        record.previewKey
      ) {
        report.headRequests++;
        preview = await readers.headObject(
          record.previewKey,
        );
      }

      const missingOriginal = !original.exists;

      const originalMetadataMismatch =
        original.exists &&
        !validOriginal(original, record);

      const missingPreviewKey =
        record.kind === 'IMAGE' &&
        !record.previewKey;

      const missingPreviewObject =
        record.kind === 'IMAGE' &&
        !!record.previewKey &&
        preview !== null &&
        !preview.exists;

      const invalidPreviewMetadata =
        record.kind === 'IMAGE' &&
        preview !== null &&
        preview.exists &&
        !validPreview(preview);

      const broken =
        missingOriginal ||
        originalMetadataMismatch ||
        missingPreviewKey ||
        missingPreviewObject ||
        invalidPreviewMetadata;

      // Avoid reporting records that changed while
      // network requests were in progress.
      if (
        broken &&
        !(await readers.unchanged(record))
      ) {
        report.changedDuringVerification++;
        continue;
      }

      report.ready.records++;

      if (record.kind === 'IMAGE') {
        report.ready.images++;
      }

      if (broken) {
        report.ready.brokenRecords++;
      } else {
        report.ready.healthyRecords++;
      }

      if (missingOriginal) {
        report.ready.missingOriginal++;
      }

      if (originalMetadataMismatch) {
        report.ready.originalMetadataMismatch++;
      }

      if (missingPreviewKey) {
        report.ready.missingPreviewKey++;
      }

      if (missingPreviewObject) {
        report.ready.missingPreviewObject++;
      }

      if (invalidPreviewMetadata) {
        report.ready.invalidPreviewMetadata++;
      }
    }

    if (!page.hasMore) {
      report.complete = true;
      break;
    }

    afterId = page.items.at(-1)?.id;
  }

  return report;
}
