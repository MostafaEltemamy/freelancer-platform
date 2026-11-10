-- CreateEnum
CREATE TYPE "StorageDeletionPhase" AS ENUM ('DELETE', 'VERIFY');

-- AlterTable
ALTER TABLE "storage_deletion_jobs" ADD COLUMN     "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "phase" "StorageDeletionPhase" NOT NULL DEFAULT 'DELETE',
ADD COLUMN     "verification_passes" INTEGER NOT NULL DEFAULT 0;
