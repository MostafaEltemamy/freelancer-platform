import {app} from './app.js';
import {prisma} from './database/prisma.js';
import {startStorageDeletionWorker} from './modules/freelancer/storage-deletion.queue.js';
import {startMediaReconciliationWorker} from './modules/freelancer/project-media.reconciliation.js';
import {startMediaHealthMonitor} from './modules/freelancer/media-health.monitor.js';
import {assertProductionConfiguration} from './config/production-preflight.js';
import {assertDeploymentIsolation} from './config/deployment-isolation.js';

assertDeploymentIsolation();
assertProductionConfiguration();

const port = Number(process.env.PORT ?? 5001);

if (
  !Number.isInteger(port) ||
  port < 1 ||
  port > 65535
) {
  throw new Error(
    'PORT must be an integer between 1 and 65535.',
  );
}

// Start the API.
const server = app.listen(port, () => {
  console.log(
    `API running at http://localhost:${port}`,
  );
});

server.on('error', (error) => {
  console.error(
    'Unable to start the API:',
    error,
  );

  process.exit(1);
});

// Start the durable object-storage deletion worker.
// It checks older queued jobs on startup and retries
// eligible failures periodically.
const stopStorageDeletionWorker =
  startStorageDeletionWorker();

const stopMediaReconciliationWorker =
  startMediaReconciliationWorker();

const stopMediaHealthMonitor =
  startMediaHealthMonitor();

let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) return;

  shuttingDown = true;

  console.log(
    `${signal} received. Closing the server.`,
  );

  const timeout = setTimeout(() => {
    console.error(
      'Shutdown timed out.',
    );

    process.exit(1);
  }, 10_000);

  timeout.unref();

  server.close((error) => {
    void finishShutdown(error);
  });

  async function finishShutdown(
    error?: Error,
  ): Promise<void> {
    let exitCode = error ? 1 : 0;

    if (error) {
      console.error(
        'HTTP server shutdown failed:',
        error,
      );
    }

    try {
      await Promise.all([
        stopStorageDeletionWorker(),
        stopMediaReconciliationWorker(),
        stopMediaHealthMonitor(),
      ]);

      await prisma.$disconnect();

    } catch {
      console.error(
        'Database or storage-worker cleanup failed.',
      );

      exitCode = 1;
    } finally {
      clearTimeout(timeout);
      process.exit(exitCode);
    }
  }
}

process.once(
  'SIGINT',
  () => shutdown('SIGINT'),
);

process.once(
  'SIGTERM',
  () => shutdown('SIGTERM'),
);
