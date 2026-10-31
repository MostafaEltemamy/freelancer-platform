import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../database/prisma.js';

export class UsernameUnavailableError extends Error {
  constructor() {
    super('This username is unavailable.');
    this.name = 'UsernameUnavailableError';
  }
}

export class UsernameAlreadyAssignedError extends Error {
  constructor() {
    super('This account already has a username.');
    this.name = 'UsernameAlreadyAssignedError';
  }
}

export async function isUsernameAvailable(
  username: string,
): Promise<boolean> {
  const existing = await prisma.freelancerProfile.findUnique({
    where: { username },
    select: { id: true },
  });

  return existing === null;
}

type ReservationResult = {
  username: string;
  newlyReserved: boolean;
};

// Resolve concurrent attempts made by the same account.
async function resolveCurrentReservation(
  userId: string,
  username: string,
): Promise<ReservationResult> {
  const current = await prisma.freelancerProfile.findUnique({
    where: { userId },
    select: { username: true },
  });

  if (current?.username === username) {
    return { username, newlyReserved: false };
  }

  if (current?.username) {
    throw new UsernameAlreadyAssignedError();
  }

  throw new UsernameUnavailableError();
}

export async function reserveUsername(
  userId: string,
  username: string,
): Promise<ReservationResult> {
  const existing = await prisma.freelancerProfile.findUnique({
    where: { userId },
    select: { username: true },
  });

  // Claiming an existing username again is idempotent.
  if (existing?.username) {
    if (existing.username === username) {
      return { username, newlyReserved: false };
    }

    throw new UsernameAlreadyAssignedError();
  }

  try {
    if (existing) {
      // Atomically assign only if this profile has no username.
      const updated = await prisma.freelancerProfile.updateMany({
        where: {
          userId,
          username: null,
        },
        data: { username },
      });

      if (updated.count === 0) {
        return resolveCurrentReservation(userId, username);
      }
    } else {
      // Database uniqueness prevents duplicate usernames
      // and duplicate freelancer profiles.
      await prisma.freelancerProfile.create({
        data: {
          userId,
          username,
        },
      });
    }

    return { username, newlyReserved: true };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return resolveCurrentReservation(userId, username);
    }

    throw error;
  }
}
