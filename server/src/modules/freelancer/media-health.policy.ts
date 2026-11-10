export type MediaHealthStatus =
  | 'OK'
  | 'WARNING'
  | 'CRITICAL';

export type MediaAlertSeverity =
  | 'WARNING'
  | 'CRITICAL';

export interface MediaHealthSnapshot {
  checkedAt: string;

  media: {
    pendingUploads: number;
    finalizingUploads: number;
    stalledFinalizations20m: number;
    stalledFinalizations60m: number;
    expiredUploads: number;
    criticallyExpiredUploads: number;
    failedUploads: number;
  };

  storageCleanup: {
    queuedJobs: number;
    deleteJobs: number;
    verifyJobs: number;
    dueJobs: number;
    overdueJobs10m: number;
    overdueJobs60m: number;
    failures3: number;
    failures5: number;
    expiredLeases: number;
  };
}

export type MediaAlertCode =
  | 'STALLED_FINALIZATION'
  | 'ABANDONED_UPLOADS'
  | 'OVERDUE_CLEANUP'
  | 'REPEATED_CLEANUP_FAILURES'
  | 'CLEANUP_BACKLOG'
  | 'EXPIRED_WORKER_LEASES';

export interface MediaHealthAlert {
  code: MediaAlertCode;
  severity: MediaAlertSeverity;
  count: number;
  message: string;
}

export interface MediaHealthReport {
  mode: 'READ_ONLY';
  checkedAt: string;
  status: MediaHealthStatus;
  alerts: MediaHealthAlert[];
  metrics: MediaHealthSnapshot;
}

/**
 * Evaluate one aggregate database snapshot.
 *
 * The function is deterministic and does not mutate
 * PostgreSQL, R2, or application state.
 */
export function evaluateMediaHealth(
  snapshot: MediaHealthSnapshot,
): MediaHealthReport {
  const alerts: MediaHealthAlert[] = [];

  function add(
    code: MediaAlertCode,
    warningCount: number,
    criticalCount: number,
    message: string,
  ): void {
    if (criticalCount > 0) {
      alerts.push({
        code,
        severity: 'CRITICAL',
        count: criticalCount,
        message,
      });
    } else if (warningCount > 0) {
      alerts.push({
        code,
        severity: 'WARNING',
        count: warningCount,
        message,
      });
    }
  }

  const m = snapshot.media;
  const s = snapshot.storageCleanup;

  add(
    'STALLED_FINALIZATION',
    m.stalledFinalizations20m,
    m.stalledFinalizations60m,
    'Image finalization has exceeded its expected duration.',
  );

  add(
    'ABANDONED_UPLOADS',
    m.expiredUploads,
    m.criticallyExpiredUploads,
    'Unfinished uploads are awaiting reconciliation.',
  );

  add(
    'OVERDUE_CLEANUP',
    s.overdueJobs10m,
    s.overdueJobs60m,
    'Storage cleanup or verification is overdue.',
  );

  add(
    'REPEATED_CLEANUP_FAILURES',
    s.failures3,
    s.failures5,
    'Storage cleanup has encountered repeated failures.',
  );

  add(
    'CLEANUP_BACKLOG',
    s.queuedJobs > 200 ? s.queuedJobs : 0,
    s.queuedJobs > 1000 ? s.queuedJobs : 0,
    'Storage cleanup backlog has exceeded its threshold.',
  );

  add(
    'EXPIRED_WORKER_LEASES',
    s.expiredLeases,
    s.expiredLeases >= 10 ? s.expiredLeases : 0,
    'Storage cleanup worker leases have expired.',
  );

  const status: MediaHealthStatus =
    alerts.some((a) => a.severity === 'CRITICAL')
      ? 'CRITICAL'
      : alerts.length > 0
        ? 'WARNING'
        : 'OK';

  return {
    mode: 'READ_ONLY',
    checkedAt: snapshot.checkedAt,
    status,
    alerts,
    metrics: snapshot,
  };
}
