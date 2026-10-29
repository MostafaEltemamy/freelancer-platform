
import { useEffect, useRef } from 'react';

import {
  Navigate,
  Outlet,
  useLocation,
} from 'react-router-dom';

import { useAuth } from './useAuth';

export function ProtectedRoute() {
  const { status, error, refresh } = useAuth();
  const location = useLocation();

  // Avoid duplicate checks when focus and visibility
  // events occur almost simultaneously.
  const lastCheck = useRef(0);

  useEffect(() => {
    if (status !== 'authenticated') {
      return;
    }

    function revalidateSession() {
      if (document.visibilityState !== 'visible') {
        return;
      }

      const now = Date.now();

      if (now - lastCheck.current < 1500) {
        return;
      }

      lastCheck.current = now;

      void refresh();
    }

    window.addEventListener('focus', revalidateSession);

    document.addEventListener(
      'visibilitychange',
      revalidateSession,
    );

    return () => {
      window.removeEventListener(
        'focus',
        revalidateSession,
      );

      document.removeEventListener(
        'visibilitychange',
        revalidateSession,
      );
    };
  }, [status, refresh]);

  // Do not display private UI before checking the session.
  if (status === 'loading') {
    return (
      <main className="page-message" role="status">
        Checking your session…
      </main>
    );
  }

  // A network outage must not be mistaken for logout.
  if (status === 'error') {
    return (
      <main className="page-message">
        <h1>Unable to verify your session</h1>

        <p role="alert">
          {error ?? 'Please check your connection.'}
        </p>

        <button
          type="button"
          className="primary-button"
          onClick={() => void refresh()}
        >
          Try again
        </button>
      </main>
    );
  }

  // Preserve the intended destination for after login.
  if (status !== 'authenticated') {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: location.pathname + location.search,
        }}
      />
    );
  }

  return <Outlet />;
}
