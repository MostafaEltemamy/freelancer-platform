export interface StagingDbCapabilities {
  schemaUsage: boolean;
  schemaCreate: boolean;
  databaseCreate: boolean;

  superuser: boolean;
  canCreateRoles: boolean;
  canCreateDatabases: boolean;
  bypassesRls: boolean;

  appTablesPresent: boolean;
  appDml: boolean;
  ownsAppTables: boolean;
  ownsTriggerFunctions: boolean;

  deleteTriggerEnabled: boolean;
  truncateTriggerEnabled: boolean;

  canTruncateMedia: boolean;
  canCreateMediaTriggers: boolean;

  migrationHistoryPresent: boolean;
  canModifyMigrationHistory: boolean;
  isMigrationRole: boolean;
  hasMigrationRoleMembership: boolean;
}

export interface StagingDbPermissionReport {
  mode: 'READ_ONLY';
  scope: 'STAGING';
  status: 'PASS' | 'FAIL';
  checks: Record<string, boolean>;
  failedChecks: string[];
}

/**
 * A true check means the runtime role meets
 * that specific security requirement.
 *
 * All expected permissions are explicit.
 */
export function evaluateStagingDbPermissions(
  c: StagingDbCapabilities,
): StagingDbPermissionReport {
  const checks: Record<string, boolean> = {
    schema_usage: c.schemaUsage,
    application_dml: c.appDml,
    application_tables_exist: c.appTablesPresent,

    no_schema_create: !c.schemaCreate,
    no_database_create: !c.databaseCreate,

    not_superuser: !c.superuser,
    no_role_creation: !c.canCreateRoles,
    no_database_creation: !c.canCreateDatabases,
    no_rls_bypass: !c.bypassesRls,

    no_application_table_ownership:
      !c.ownsAppTables,

    no_trigger_function_ownership:
      !c.ownsTriggerFunctions,

    deletion_trigger_enabled:
      c.deleteTriggerEnabled,

    truncate_trigger_enabled:
      c.truncateTriggerEnabled,

    no_media_truncate: !c.canTruncateMedia,

    no_media_trigger_ddl:
      !c.canCreateMediaTriggers,

    migration_history_exists:
      c.migrationHistoryPresent,

    no_migration_history_mutation:
      !c.canModifyMigrationHistory,

    runtime_separate_from_migrator:
      !c.isMigrationRole,

    no_migrator_membership:
      !c.hasMigrationRoleMembership,
  };

  const failedChecks = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);

  return {
    mode: 'READ_ONLY',
    scope: 'STAGING',
    status:
      failedChecks.length === 0
        ? 'PASS'
        : 'FAIL',
    checks,
    failedChecks,
  };
}
