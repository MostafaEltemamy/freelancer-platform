import 'dotenv/config';
import {prisma} from '../src/database/prisma.js';
import {collectMediaHealthSnapshot} from '../src/modules/freelancer/media-health.snapshot.js';
import {evaluateMediaHealth} from '../src/modules/freelancer/media-health.policy.js';

async function main(): Promise<void> {
  try {
    const snapshot =
      await collectMediaHealthSnapshot();

    const report =
      evaluateMediaHealth(snapshot);

    console.log(
      JSON.stringify(report, null, 2),
    );

    // Exit codes for health-check orchestration:
    // 0 = healthy
    // 2 = warning
    // 3 = critical or unavailable
    process.exitCode =
      report.status === 'OK'
        ? 0
        : report.status === 'WARNING'
          ? 2
          : 3;
  } catch {
    // Do not print raw database or SDK exceptions,
    // which may contain internal connection details.
    console.error(
      JSON.stringify({
        mode: 'READ_ONLY',
        checkedAt: new Date().toISOString(),
        status: 'UNKNOWN',
        alerts: [
          {
            code: 'MONITOR_QUERY_FAILED',
            severity: 'CRITICAL',
            message:
              'Media health data could not be retrieved.',
          },
        ],
      }, null, 2),
    );

    process.exitCode = 3;
  } finally {
    await prisma.$disconnect().catch(() => {
      process.exitCode = 3;
    });
  }
}

await main();
