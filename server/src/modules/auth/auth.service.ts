
import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../database/prisma.js';

import type { RegistrationInput } from './auth.schemas.js';
import { hashPassword } from './password.js';

export class DuplicateEmailError extends Error {
  constructor() {
    super('An account with this email already exists.');
    this.name = 'DuplicateEmailError';
  }
}

export async function registerUser(input: RegistrationInput) {
  // Password hashing happens before the database transaction.
  const passwordHash = await hashPassword(input.password);

  try {
    const user = await prisma.user.create({
      data: {
        email: input.email,
        displayName: input.displayName,

        passwordCredential: {
          create: {
            passwordHash,
          },
        },
      },

      select: {
        id: true,
        email: true,
        displayName: true,
        createdAt: true,
      },
    });

    return user;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new DuplicateEmailError();
    }

    throw error;
  }
}
