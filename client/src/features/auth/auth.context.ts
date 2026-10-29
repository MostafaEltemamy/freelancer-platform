
import { createContext } from 'react';

import type {
  AuthUser,
  LoginInput,
  RegistrationInput,
} from './auth.types';

export type AuthStatus =
  | 'loading'
  | 'authenticated'
  | 'unauthenticated'
  | 'error';

export interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  error: string | null;

  login: (input: LoginInput) => Promise<void>;
  register: (input: RegistrationInput) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const AuthContext =
  createContext<AuthContextValue | null>(null);
