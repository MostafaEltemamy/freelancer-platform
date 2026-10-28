import { app } from './app.js';

const port = Number(process.env.PORT ?? 5001);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

const server = app.listen(port, () => {
  console.log(`API running at http://localhost:${port}`);
});

server.on('error', (error) => {
  console.error('Unable to start the API:', error);
  process.exit(1);
});

function shutdown(signal: string): void {
  console.log(`${signal} received. Closing the server.`);

  server.close(() => {
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Shutdown timed out.');
    process.exit(1);
  }, 10_000).unref();
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));