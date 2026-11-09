const HOUR_MS = 60 * 60_000;

export const ORPHAN_REVIEW_AGE_MS = 24 * HOUR_MS;

const MANAGED_MEDIA_KEY =
  /^projects\/[0-9a-f-]{36}\/(?:previews\/)?[0-9a-f-]{36}\.(?:jpg|jpeg|png|webp|mp4|webm|pdf)$/i;

export type AuditCategory =
  | 'referenced'
  | 'queuedForDeletion'
  | 'referencedAndQueued'
  | 'recentUnreferenced'
  | 'agedUnreferenced'
  | 'unexpectedKey'
  | 'unknownAge';

export interface ListedMediaObject {
  key?: string;
  lastModified?: Date;
  size?: number;
}

export interface MediaAuditPage {
  objects: ListedMediaObject[];
  isTruncated: boolean;
  nextCursor?: string;
}

export interface MediaAuditReferences {
  activeKeys: string[];
  queuedKeys: string[];
}

export interface MediaAuditReaders {
  listPage(input: {
    prefix: string;
    cursor?: string;
    maxKeys: number;
  }): Promise<MediaAuditPage>;

  findReferences(
    keys: string[],
  ): Promise<MediaAuditReferences>;
}

export interface AuditCounter {
  objects: number;
  bytes: number;
}

export interface MediaAuditReport {
  checkedAt: string;
  prefix: 'projects/';
  reviewAgeHours: number;
  pagesScanned: number;
  objectsScanned: number;
  objectsWithoutSize: number;
  complete: boolean;
  categories: Record<AuditCategory, AuditCounter>;
}

function emptyCounters():
  Record<AuditCategory, AuditCounter> {
  return {
    referenced: { objects: 0, bytes: 0 },
    queuedForDeletion: { objects: 0, bytes: 0 },
    referencedAndQueued: { objects: 0, bytes: 0 },
    recentUnreferenced: { objects: 0, bytes: 0 },
    agedUnreferenced: { objects: 0, bytes: 0 },
    unexpectedKey: { objects: 0, bytes: 0 },
    unknownAge: { objects: 0, bytes: 0 },
  };
}

/**
 * Classification is advisory only.
 *
 * It must NEVER authorize a storage deletion.
 */
export function classifyMediaObject(
  object: ListedMediaObject,
  references: {
    active: boolean;
    queued: boolean;
  },
  now: Date,
  reviewAgeMs = ORPHAN_REVIEW_AGE_MS,
): AuditCategory {
  // Database references take priority, including those
  // with legacy or unexpected key formats.
  if (references.active && references.queued) {
    return 'referencedAndQueued';
  }

  if (references.active) {
    return 'referenced';
  }

  if (references.queued) {
    return 'queuedForDeletion';
  }

  if (
    !object.key ||
    !MANAGED_MEDIA_KEY.test(object.key)
  ) {
    return 'unexpectedKey';
  }

  const modified = object.lastModified;

  if (
    !(modified instanceof Date) ||
    !Number.isFinite(modified.getTime())
  ) {
    return 'unknownAge';
  }

  const ageMs =
    now.getTime() - modified.getTime();

  if (ageMs < reviewAgeMs) {
    return 'recentUnreferenced';
  }

  return 'agedUnreferenced';
}

/**
 * Enumerate R2 objects page by page.
 *
 * Only the projects/ namespace is audited.
 * No object bodies are downloaded.
 * No object is modified or deleted.
 *
 * If the page limit is reached, complete=false.
 */
export async function auditProjectMediaStorage(
  readers: MediaAuditReaders,
  options: {
    now?: Date;
    pageSize?: number;
    maxPages?: number;
    reviewAgeMs?: number;
  } = {},
): Promise<MediaAuditReport> {
  const now = options.now ?? new Date();
  const pageSize = options.pageSize ?? 500;
  const maxPages = options.maxPages ?? 100;
  const reviewAgeMs =
    options.reviewAgeMs ?? ORPHAN_REVIEW_AGE_MS;

  if (
    !Number.isFinite(now.getTime()) ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 1000 ||
    !Number.isInteger(maxPages) ||
    maxPages < 1 ||
    maxPages > 5000 ||
    !Number.isSafeInteger(reviewAgeMs) ||
    reviewAgeMs < 1
  ) {
    throw new RangeError(
      'Invalid media-audit configuration.',
    );
  }

  const report: MediaAuditReport = {
    checkedAt: now.toISOString(),
    prefix: 'projects/',
    reviewAgeHours: reviewAgeMs / HOUR_MS,
    pagesScanned: 0,
    objectsScanned: 0,
    objectsWithoutSize: 0,
    complete: false,
    categories: emptyCounters(),
  };

  let cursor: string | undefined;
  const visitedCursors = new Set<string>();

  while (report.pagesScanned < maxPages) {
    const page = await readers.listPage({
      prefix: 'projects/',
      cursor,
      maxKeys: pageSize,
    });

    report.pagesScanned += 1;

    if (page.objects.length > pageSize) {
      throw new Error(
        'Storage returned more objects than requested.',
      );
    }

    const keys = [
      ...new Set(
        page.objects
          .map((object) => object.key)
          .filter(
            (key): key is string =>
              typeof key === 'string' &&
              key.length > 0,
          ),
      ),
    ];

    const references: MediaAuditReferences =
      keys.length > 0
        ? await readers.findReferences(keys)
        : {
            activeKeys: [],
            queuedKeys: [],
          };

    const active = new Set(references.activeKeys);
    const queued = new Set(references.queuedKeys);

    for (const object of page.objects) {
      const category = classifyMediaObject(
        object,
        {
          active: Boolean(
            object.key && active.has(object.key),
          ),
          queued: Boolean(
            object.key && queued.has(object.key),
          ),
        },
        now,
        reviewAgeMs,
      );

      const counter = report.categories[category];

      counter.objects += 1;
      report.objectsScanned += 1;

      if (
        typeof object.size === 'number' &&
        Number.isSafeInteger(object.size) &&
        object.size >= 0
      ) {
        counter.bytes += object.size;
      } else {
        report.objectsWithoutSize += 1;
      }
    }

    if (!page.isTruncated) {
      report.complete = true;
      break;
    }

    if (
      !page.nextCursor ||
      visitedCursors.has(page.nextCursor)
    ) {
      throw new Error(
        'Invalid or repeated storage pagination token.',
      );
    }

    visitedCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }

  return report;
}
