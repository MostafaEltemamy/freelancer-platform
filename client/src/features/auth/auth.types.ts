
export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export interface RegistrationInput {
  email: string;
  displayName: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResponse {
  message: string;
  user: AuthUser;
}

export interface CurrentUserResponse {
  user: AuthUser;
}

export interface CsrfResponse {
  csrfToken: string;
}
