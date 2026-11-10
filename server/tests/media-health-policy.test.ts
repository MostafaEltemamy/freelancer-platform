import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  evaluateMediaHealth,
} from '../src/modules/freelancer/media-health.policy.js';

import type {
  MediaHealthSnapshot,
} from '../src/modules/freelancer/media-health.policy.js';

function snapshot(): MediaHealthSnapshot {
  return {
    checkedAt: '2026-11-10T12:00:00.000Z',

    media: {
      pendingUploads: 0,
      finalizingUploads: 0,
      stalledFinalizations20m: 0,
      stalledFinalizations60m: 0,
      expiredUploads: 0,
      criticallyExpiredUploads: 0,
      failedUploads: 0,
    },

    storageCleanup: {
      queuedJobs: 0,
      deleteJobs: 0,
      verifyJobs: 0,
      dueJobs: 0,
      overdueJobs10m: 0,
      overdueJobs60m: 0,
      failures3: 0,
      failures5: 0,
      expiredLeases: 0,
    },
  };
}

test('healthy empty system produces no alerts', () => {
  const report = evaluateMediaHealth(snapshot());

  assert.equal(report.status, 'OK');
  assert.deepEqual(report.alerts, []);
  assert.equal(report.mode, 'READ_ONLY');
});

test('normal pending and active uploads are not alerts', () => {
  const data = snapshot();

  data.media.pendingUploads = 12;
  data.media.finalizingUploads = 3;

  const report = evaluateMediaHealth(data);

  assert.equal(report.status, 'OK');
  assert.equal(report.alerts.length, 0);
});

test('20-minute finalization delay is a warning', () => {
  const data = snapshot();

  data.media.finalizingUploads = 1;
  data.media.stalledFinalizations20m = 1;

  const report = evaluateMediaHealth(data);

  assert.equal(report.status, 'WARNING');
  assert.equal(
    report.alerts[0]?.code,
    'STALLED_FINALIZATION',
  );
  assert.equal(
    report.alerts[0]?.severity,
    'WARNING',
  );
});

test('60-minute finalization delay is critical', () => {
  const data = snapshot();

  data.media.finalizingUploads = 2;
  data.media.stalledFinalizations20m = 2;
  data.media.stalledFinalizations60m = 1;

  const report = evaluateMediaHealth(data);

  assert.equal(report.status, 'CRITICAL');

  assert.deepEqual(
    report.alerts.map((a) => a.severity),
    ['CRITICAL'],
  );
});

test('abandoned uploads escalate after 120 minutes', () => {
  const data = snapshot();

  data.media.expiredUploads = 2;

  assert.equal(
    evaluateMediaHealth(data).status,
    'WARNING',
  );

  data.media.criticallyExpiredUploads = 1;

  assert.equal(
    evaluateMediaHealth(data).status,
    'CRITICAL',
  );
});

test('overdue cleanup jobs escalate by age', () => {
  const data = snapshot();

  data.storageCleanup.overdueJobs10m = 4;

  let report = evaluateMediaHealth(data);

  assert.equal(report.status, 'WARNING');

  assert.equal(
    report.alerts[0]?.code,
    'OVERDUE_CLEANUP',
  );

  data.storageCleanup.overdueJobs60m = 2;

  report = evaluateMediaHealth(data);

  assert.equal(report.status, 'CRITICAL');
});

test('consecutive failures trigger alerts', () => {
  const data = snapshot();

  data.storageCleanup.failures3 = 2;

  assert.equal(
    evaluateMediaHealth(data).status,
    'WARNING',
  );

  data.storageCleanup.failures5 = 1;

  const report = evaluateMediaHealth(data);

  assert.equal(report.status, 'CRITICAL');

  assert.equal(
    report.alerts[0]?.code,
    'REPEATED_CLEANUP_FAILURES',
  );
});

test('cleanup backlog thresholds are enforced', () => {
  const data = snapshot();

  data.storageCleanup.queuedJobs = 200;

  assert.equal(
    evaluateMediaHealth(data).status,
    'OK',
  );

  data.storageCleanup.queuedJobs = 201;

  assert.equal(
    evaluateMediaHealth(data).status,
    'WARNING',
  );

  data.storageCleanup.queuedJobs = 1001;

  assert.equal(
    evaluateMediaHealth(data).status,
    'CRITICAL',
  );
});

test('expired worker leases are reported', () => {
  const data = snapshot();

  data.storageCleanup.expiredLeases = 1;

  assert.equal(
    evaluateMediaHealth(data).status,
    'WARNING',
  );

  data.storageCleanup.expiredLeases = 10;

  assert.equal(
    evaluateMediaHealth(data).status,
    'CRITICAL',
  );
});

test('critical status overrides simultaneous warnings', () => {
  const data = snapshot();

  data.media.expiredUploads = 2;
  data.storageCleanup.failures3 = 4;
  data.storageCleanup.failures5 = 2;

  const report = evaluateMediaHealth(data);

  assert.equal(report.status, 'CRITICAL');
  assert.equal(report.alerts.length, 2);

  assert.deepEqual(
    report.alerts.map((a) => a.code),
    [
      'ABANDONED_UPLOADS',
      'REPEATED_CLEANUP_FAILURES',
    ],
  );
});

test('evaluation does not modify its input', () => {
  const data = snapshot();

  const before = JSON.stringify(data);

  evaluateMediaHealth(data);

  assert.equal(
    JSON.stringify(data),
    before,
  );
});
