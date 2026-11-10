import {collectMediaHealthSnapshot} from './media-health.snapshot.js';
import {evaluateMediaHealth} from './media-health.policy.js';

const CHECK_INTERVAL_MS = 5 * 60_000;
const UNHEALTHY_REMINDER_MS = 60 * 60_000;

/**
 * Optional monitoring of the existing media lifecycle.
 *
 * Activated only when:
 * MEDIA_HEALTH_MONITOR_ENABLED=1
 *
 * Emits aggregate operational events to stdout/stderr.
 * It does not contact any third-party notification API.
 */
export function startMediaHealthMonitor():
  () => Promise<void> {
  if (
    process.env.MEDIA_HEALTH_MONITOR_ENABLED !== '1'
  ) {
    return async () => {};
  }

  let stopped = false;
  let active: Promise<void> | null = null;

  let previousSignature: string | null = null;
  let lastEmittedAt = 0;

  function emit(
    signature: string,
    severity: 'OK' | 'WARNING' | 'CRITICAL',
    payload: Record<string, unknown>,
  ): void {
    const now = Date.now();

    const changed =
      signature !== previousSignature;

    const reminderDue =
      severity !== 'OK' &&
      now - lastEmittedAt >=
        UNHEALTHY_REMINDER_MS;

    if (changed || reminderDue) {
      const serialized =
        JSON.stringify(payload);

      if (severity === 'OK') {
        console.info(
          'media_health_recovered',
          serialized,
        );
      } else if (severity === 'CRITICAL') {
        console.error(
          'media_health_alert',
          serialized,
        );
      } else {
        console.warn(
          'media_health_alert',
          serialized,
        );
      }

      lastEmittedAt = now;
    }

    previousSignature = signature;
  }

  async function inspect(): Promise<void> {
    try {
      const snapshot =
        await collectMediaHealthSnapshot();

      const report =
        evaluateMediaHealth(snapshot);

      const signature =
        report.alerts
          .map(
            (alert) =>
              `${alert.code}:${alert.severity}`,
          )
          .sort()
          .join('|') || 'OK';

      emit(
        signature,
        report.status,
        {
          checkedAt: report.checkedAt,
          status: report.status,
          alerts: report.alerts,
          metrics: report.metrics,
        },
      );
    } catch {
      emit(
        'MONITOR_QUERY_FAILED:CRITICAL',
        'CRITICAL',
        {
          checkedAt:
            new Date().toISOString(),
          status: 'UNKNOWN',
          alerts: [
            {
              code: 'MONITOR_QUERY_FAILED',
              severity: 'CRITICAL',
              message:
                'Media health query failed.',
            },
          ],
        },
      );
    }
  }

  function tick(): void {
    if (stopped || active) {
      return;
    }

    active = inspect().finally(() => {
      active = null;
    });
  }

  const timer = setInterval(
    tick,
    CHECK_INTERVAL_MS,
  );

  timer.unref();

  // Initial health evaluation on startup.
  tick();

  return async () => {
    stopped = true;
    clearInterval(timer);
    await active;
  };
}
