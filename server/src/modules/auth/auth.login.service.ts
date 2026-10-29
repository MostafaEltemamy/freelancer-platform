
import { prisma } from '../../database/prisma.js';

import type { LoginInput } from './auth.schemas.js';

import {
  hashPassword,
  verifyPassword,
} from './password.js';

import {generateSessionToken} from './session-tokens.js';
import { SESSION_TTL_MS } from './session-cookie.js';

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid email or password.');
    this.name = 'InvalidCredentialsError';
  }
}

// Used to reduce timing differences for unknown accounts.
let dummyHashPromise: Promise<string> | undefined;

function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword(
    'invalid-login-placeholder-password',
  );

  return dummyHashPromise;
}

export async function loginUser(input: LoginInput) {
  const user = await prisma.user.findUnique({
    where: {
      email: input.email,
    },

    select: {
      id: true,
      email: true,
      displayName: true,
      createdAt: true,

      passwordCredential: {
        select: {
          passwordHash: true,
        },
      },
    },
  });

  const passwordHash =
    user?.passwordCredential?.passwordHash ??
    (await getDummyHash());

  const passwordValid = await verifyPassword(
    passwordHash,
    input.password,
  );

  if (
    !user ||
    !user.passwordCredential ||
    !passwordValid
  ) {
    throw new InvalidCredentialsError();
  }

  // Generate a new independent session on every login.
  const { token, tokenHash } = generateSessionToken();

  const expiresAt = new Date(
    Date.now() + SESSION_TTL_MS,
  );

  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
    },
  });

  return {
    token,

    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      createdAt: user.createdAt,
    },
  };
}
