import 'dotenv/config';
import {Client} from 'pg';
import {evaluateStagingDbPermissions} from '../src/config/db-permission.policy.js';
import type {StagingDbCapabilities} from '../src/config/db-permission.policy.js';

// These are the current application's Prisma tables.
// Add new application tables here when the schema grows.
const APPLICATION_TABLES = [
  'users',
  'password_credentials',
  'sessions',
  'freelancer_profiles',
  'portfolio_projects',
  'profile_skills',
  'project_media',
  'storage_deletion_jobs',
];

function required(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error('Missing staging audit setting.');
  }

  return value;
}

function safeConfiguration() {
  if (
    process.env.STAGING_PERMISSION_AUDIT !== '1' ||
    process.env.DEPLOYMENT_ENV !== 'staging' ||
    process.env.NODE_ENV !== 'production'
  ) {
    throw new Error('Staging audit not authorized.');
  }

  const connectionString = required('DATABASE_URL');

  const expectedDatabase = required(
    'STAGING_DATABASE_NAME',
  );

  const migrationRole = required(
    'STAGING_MIGRATION_ROLE',
  );

  const url = new URL(connectionString);

  const actualDatabase = decodeURIComponent(
    url.pathname.replace(/^\//, ''),
  );

  if (
    !['postgres:', 'postgresql:'].includes(
      url.protocol,
    ) ||
    !url.hostname ||
    ['localhost', '127.0.0.1', '[::1]'].includes(
      url.hostname,
    ) ||
    actualDatabase !== expectedDatabase
  ) {
    throw new Error(
      'Refusing an unexpected database connection.',
    );
  }

  return {
    connectionString,
    migrationRole,
  };
}

interface RoleRow {
  schemaUsage: boolean;
  schemaCreate: boolean;
  databaseCreate: boolean;

  superuser: boolean;
  canCreateRoles: boolean;
  canCreateDatabases: boolean;
  bypassesRls: boolean;

  canTruncateMedia: boolean;
  canCreateMediaTriggers: boolean;

  migrationHistoryPresent: boolean;
  canModifyMigrationHistory: boolean;
  isMigrationRole: boolean;
  hasMigrationRoleMembership: boolean;
}

interface TableRow {
  present: boolean;
  canSelect: boolean;
  canInsert: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  isOwner: boolean;
}

interface TriggerRow {
  deleteTriggerEnabled: boolean;
  truncateTriggerEnabled: boolean;
  ownsTriggerFunctions: boolean;
}

async function inspect(): Promise<void> {
  const settings = safeConfiguration();

  const client = new Client({
    connectionString: settings.connectionString,
    connectionTimeoutMillis: 5000,
    query_timeout: 10000,
  });

  let connected = false;

  try {
    await client.connect();
    connected = true;

    await client.query('BEGIN TRANSACTION READ ONLY');

    const roleResult = await client.query<RoleRow>(
      `
      SELECT
        has_schema_privilege(
          'public', 'USAGE'
        ) AS "schemaUsage",

        has_schema_privilege(
          'public', 'CREATE'
        ) AS "schemaCreate",

        has_database_privilege(
          current_database(), 'CREATE'
        ) AS "databaseCreate",

        r.rolsuper AS "superuser",
        r.rolcreaterole AS "canCreateRoles",
        r.rolcreatedb AS "canCreateDatabases",
        r.rolbypassrls AS "bypassesRls",

        COALESCE(
          has_table_privilege(
            to_regclass('public.project_media'),
            'TRUNCATE'
          ),
          false
        ) AS "canTruncateMedia",

        COALESCE(
          has_table_privilege(
            to_regclass('public.project_media'),
            'TRIGGER'
          ),
          false
        ) AS "canCreateMediaTriggers",

        to_regclass(
          'public._prisma_migrations'
        ) IS NOT NULL AS "migrationHistoryPresent",

        (
          COALESCE(
            has_table_privilege(
              to_regclass('public._prisma_migrations'),
              'INSERT'
            ),
            false
          )
          OR
          COALESCE(
            has_table_privilege(
              to_regclass('public._prisma_migrations'),
              'UPDATE'
            ),
            false
          )
          OR
          COALESCE(
            has_table_privilege(
              to_regclass('public._prisma_migrations'),
              'DELETE'
            ),
            false
          )
        ) AS "canModifyMigrationHistory",

        current_user = $1::text AS "isMigrationRole",

        pg_has_role(
          current_user,
          $1::name,
          'MEMBER'
        ) AS "hasMigrationRoleMembership"

      FROM pg_roles r
      WHERE r.rolname = current_user
      `,
      [settings.migrationRole],
    );

    const role = roleResult.rows[0];

    if (!role) {
      throw new Error('Database role inspection failed.');
    }

    const tableResult = await client.query<TableRow>(
      `
      SELECT
        to_regclass(
          format('public.%I', t.name)
        ) IS NOT NULL AS "present",

        COALESCE(
          has_table_privilege(
            to_regclass(format('public.%I', t.name)),
            'SELECT'
          ), false
        ) AS "canSelect",

        COALESCE(
          has_table_privilege(
            to_regclass(format('public.%I', t.name)),
            'INSERT'
          ), false
        ) AS "canInsert",

        COALESCE(
          has_table_privilege(
            to_regclass(format('public.%I', t.name)),
            'UPDATE'
          ), false
        ) AS "canUpdate",

        COALESCE(
          has_table_privilege(
            to_regclass(format('public.%I', t.name)),
            'DELETE'
          ), false
        ) AS "canDelete",

        COALESCE(
          (
            SELECT
              pg_get_userbyid(c.relowner) = current_user
            FROM pg_class c
            WHERE c.oid = to_regclass(
              format('public.%I', t.name)
            )
          ),
          false
        ) AS "isOwner"

      FROM unnest($1::text[]) AS t(name)
      `,
      [APPLICATION_TABLES],
    );

    const tables = tableResult.rows;

    const triggerResult =
      await client.query<TriggerRow>(
        `
        SELECT
          COALESCE(
            (
              SELECT bool_or(
                tgname = 'trg_project_media_queue_deletion'
                AND tgenabled IN ('O', 'A')
              )
              FROM pg_trigger
              WHERE tgrelid =
                to_regclass('public.project_media')
                AND NOT tgisinternal
            ),
            false
          ) AS "deleteTriggerEnabled",

          COALESCE(
            (
              SELECT bool_or(
                tgname = 'trg_project_media_reject_truncate'
                AND tgenabled IN ('O', 'A')
              )
              FROM pg_trigger
              WHERE tgrelid =
                to_regclass('public.project_media')
                AND NOT tgisinternal
            ),
            false
          ) AS "truncateTriggerEnabled",

          EXISTS (
            SELECT 1
            FROM pg_proc p
            JOIN pg_namespace n
              ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname IN (
                'queue_deleted_media_objects',
                'reject_project_media_truncate'
              )
              AND pg_get_userbyid(p.proowner) =
                current_user
          ) AS "ownsTriggerFunctions"
        `,
      );

    const triggers = triggerResult.rows[0];

    if (!triggers) {
      throw new Error('Trigger inspection failed.');
    }

    const capabilities: StagingDbCapabilities = {
      ...role,

      appTablesPresent:
        tables.length === APPLICATION_TABLES.length &&
        tables.every((table) => table.present),

      appDml:
        tables.length === APPLICATION_TABLES.length &&
        tables.every(
          (table) =>
            table.canSelect &&
            table.canInsert &&
            table.canUpdate &&
            table.canDelete,
        ),

      ownsAppTables: tables.some(
        (table) => table.isOwner,
      ),

      ...triggers,
    };

    const report =
      evaluateStagingDbPermissions(capabilities);

    console.log(
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          ...report,
        },
        null,
        2,
      ),
    );

    if (report.status === 'FAIL') {
      process.exitCode = 2;
    }
  } finally {
    if (connected) {
      await client.query('ROLLBACK').catch(() => {});
    }

    await client.end().catch(() => {});
  }
}

try {
  await inspect();
} catch (error) {
  console.error(
    'Staging database permission audit failed:',
    error instanceof Error
      ? error.name
      : 'UnknownError',
  );

  process.exitCode = 3;
}
