-- CreateTable
CREATE TABLE "storage_deletion_jobs" (
    "id" UUID NOT NULL,
    "object_key" VARCHAR(512) NOT NULL,
    "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lease_token" UUID,
    "lease_until" TIMESTAMPTZ(3),
    "last_error" VARCHAR(120),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "storage_deletion_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "storage_deletion_jobs_object_key_key" ON "storage_deletion_jobs"("object_key");

-- CreateIndex
CREATE INDEX "storage_deletion_jobs_next_attempt_at_lease_until_idx" ON "storage_deletion_jobs"("next_attempt_at", "lease_until");
