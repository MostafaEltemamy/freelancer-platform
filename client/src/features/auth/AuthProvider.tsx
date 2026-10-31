
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { ReactNode } from 'react';

import { ApiError } from '../../lib/api-client';
import { authApi } from './auth.api';
import { AuthContext } from './auth.context';

import type {
  AuthContextValue,
  AuthStatus,
} from './auth.context';

import type {
  AuthUser,
  LoginInput,
  RegistrationInput,
} from './auth.types';

interface AuthState {
  user: AuthUser | null;
  status: AuthStatus;
  error: string | null;
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'An unexpected error occurred.';
}

function resolveSessionFailure(error: unknown): AuthState {
  if (error instanceof ApiError && error.status === 401) {
    return {
      user: null,
      status: 'unauthenticated',
      error: null,
    };
  }

  return {
    user: null,
    status: 'error',
    error: describeError(error),
  };
}

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [state, setState] = useState<AuthState>({
    user: null,
    status: 'loading',
    error: null,
  });

  // Prevent outdated HTTP responses from replacing newer state.
  const requestVersion = useRef(0);

  // Restore the current session when React mounts.
  useEffect(() => {
    let ignore = false;
    const version = ++requestVersion.current;

    void authApi.me()
      .then((user) => {
        if (
          ignore ||
          version !== requestVersion.current
        ) {
          return;
        }

        setState({
          user,
          status: 'authenticated',
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (
          ignore ||
          version !== requestVersion.current
        ) {
          return;
        }

        setState(resolveSessionFailure(error));
      });

    return () => {
      ignore = true;
      requestVersion.current += 1;
    };
  }, []);


  // Recheck authentication without unnecessarily
  // unmounting an already authenticated page.
  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;

    setState((current) => {
      // Preserve the currently mounted page while
      // silently revalidating an authenticated session.
      if (current.status === 'authenticated') {
        return current;
      }

      // Initial recovery and manual retry still
      // display the loading state.
      return {
        user: null,
        status: 'loading',
        error: null,
      };
    });

    try {
      const user = await authApi.me();

      if (version === requestVersion.current) {
        setState({
          user,
          status: 'authenticated',
          error: null,
        });
      }
    } catch (error) {
      if (version === requestVersion.current) {
        setState(resolveSessionFailure(error));
      }
    }
  }, []);

  // Authenticate an existing account.
  const login = useCallback(
    async (input: LoginInput) => {
      const version = ++requestVersion.current;

      setState({
        user: null,
        status: 'loading',
        error: null,
      });

      try {
        const response = await authApi.login(input);

        if (version === requestVersion.current) {
          setState({
            user: response.user,
            status: 'authenticated',
            error: null,
          });
        }
      } catch (error) {
        if (version === requestVersion.current) {
          setState({
            user: null,
            status: 'unauthenticated',
            error: describeError(error),
          });
        }

        throw error;
      }
    },
    [],
  );

  // Registration does not automatically authenticate.
  const register = useCallback(
    async (input: RegistrationInput) => {
      await authApi.register(input);
    },
    [],
  );

  // Revoke the current session.
  const logout = useCallback(async () => {
    const version = ++requestVersion.current;

    try {
      await authApi.logout();

      if (version === requestVersion.current) {
        setState({
          user: null,
          status: 'unauthenticated',
          error: null,
        });
      }
    } catch (error) {
      if (version !== requestVersion.current) {
        throw error;
      }

      // The server confirms the session no longer exists.
      if (
        error instanceof ApiError &&
        error.status === 401
      ) {
        setState({
          user: null,
          status: 'unauthenticated',
          error: null,
        });

        return;
      }

      // Do not claim logout succeeded when revocation
      // could not be confirmed.
      setState((current) => ({
        ...current,
        error: describeError(error),
      }));

      throw error;
    }
  }, []);

  const value: AuthContextValue = useMemo(
    () => ({
      ...state,
      login,
      register,
      logout,
      refresh,
    }),
    [state, login, register, logout, refresh],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
