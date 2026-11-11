import assert from 'node:assert/strict';
import {test} from 'node:test';
import {evaluateStagingDbPermissions} from '../src/config/db-permission.policy.js';
import type {StagingDbCapabilities} from '../src/config/db-permission.policy.js';

function secure(): StagingDbCapabilities {
  return {
    schemaUsage: true,
    schemaCreate: false,
    databaseCreate: false,

    superuser: false,
    canCreateRoles: false,
    canCreateDatabases: false,
    bypassesRls: false,

    appTablesPresent: true,
    appDml: true,
    ownsAppTables: false,
    ownsTriggerFunctions: false,

    deleteTriggerEnabled: true,
    truncateTriggerEnabled: true,

    canTruncateMedia: false,
    canCreateMediaTriggers: false,

    migrationHistoryPresent: true,
    canModifyMigrationHistory: false,

    isMigrationRole: false,
    hasMigrationRoleMembership: false,
  };
}

test('accepts a least-privilege runtime role', () => {
  const report = evaluateStagingDbPermissions(
    secure(),
  );

  assert.equal(report.status, 'PASS');
  assert.deepEqual(report.failedChecks, []);
});

test('rejects schema-creation privileges', () => {
  const data = secure();
  data.schemaCreate = true;

  const report = evaluateStagingDbPermissions(data);

  assert.equal(report.status, 'FAIL');
  assert.ok(
    report.failedChecks.includes('no_schema_create'),
  );
});

test('requires application data privileges', () => {
  const data = secure();
  data.appDml = false;

  const report = evaluateStagingDbPermissions(data);

  assert.equal(report.status, 'FAIL');
  assert.ok(
    report.failedChecks.includes('application_dml'),
  );
});

test('detects disabled deletion triggers', () => {
  const data = secure();
  data.deleteTriggerEnabled = false;

  const report = evaluateStagingDbPermissions(data);

  assert.equal(report.status, 'FAIL');
  assert.ok(
    report.failedChecks.includes(
      'deletion_trigger_enabled',
    ),
  );
});

test('rejects ownership of application tables', () => {
  const data = secure();
  data.ownsAppTables = true;

  const report = evaluateStagingDbPermissions(data);

  assert.equal(report.status, 'FAIL');
});

test('rejects membership in the migration role', () => {
  const data = secure();
  data.hasMigrationRoleMembership = true;

  const report = evaluateStagingDbPermissions(data);

  assert.ok(
    report.failedChecks.includes(
      'no_migrator_membership',
    ),
  );
});

test('rejects migration-history modification', () => {
  const data = secure();
  data.canModifyMigrationHistory = true;

  const report = evaluateStagingDbPermissions(data);

  assert.equal(report.status, 'FAIL');
});

test('rejects TRUNCATE permission', () => {
  const data = secure();
  data.canTruncateMedia = true;

  const report = evaluateStagingDbPermissions(data);

  assert.equal(report.status, 'FAIL');
  assert.ok(
    report.failedChecks.includes('no_media_truncate'),
  );
});

test('does not modify the input capabilities', () => {
  const data = secure();
  const before = JSON.stringify(data);

  evaluateStagingDbPermissions(data);

  assert.equal(JSON.stringify(data), before);
});
