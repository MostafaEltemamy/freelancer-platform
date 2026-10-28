import { useEffect, useState } from 'react';
import { checkApiHealth } from './lib/health';

type ConnectionState =
  | { status: 'loading' }
  | { status: 'connected' }
  | { status: 'error'; message: string };

function App() {
  const [connection, setConnection] = useState<ConnectionState>({
    status: 'loading',
  });

  useEffect(() => {
    const controller = new AbortController();

    const timeout = window.setTimeout(() => {
      controller.abort();
      setConnection({
        status: 'error',
        message: 'The connection timed out. Check that the backend is running.',
      });
    }, 10_000);

    async function connect() {
      try {
        await checkApiHealth(controller.signal);

        if (!controller.signal.aborted) {
          setConnection({ status: 'connected' });
        }
      } catch (error: unknown) {
        if (!controller.signal.aborted) {
          setConnection({
            status: 'error',
            message:
              error instanceof Error
                ? error.message
                : 'Unable to connect to the API.',
          });
        }
      } finally {
        window.clearTimeout(timeout);
      }
    }

    void connect();

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  return (
    <main className="setup-page">
      <section className="setup-card" aria-labelledby="page-title">
        <p className="eyebrow">Development checkpoint</p>

        <h1 id="page-title">Freelancer Platform</h1>

        <p className="description">
          One place to present your work, show your experience, and connect
          with clients.
        </p>

        <div
          className={`connection connection--${connection.status}`}
          role="status"
          aria-live="polite"
        >
          {connection.status === 'loading' && 'Connecting to the backend…'}

          {connection.status === 'connected' &&
            'Connected — frontend and backend are communicating.'}

          {connection.status === 'error' &&
            `Connection failed: ${connection.message}`}
        </div>

        <p className="footnote">
          This checks API connectivity only. Database setup comes next.
        </p>
      </section>
    </main>
  );
}

export default App;