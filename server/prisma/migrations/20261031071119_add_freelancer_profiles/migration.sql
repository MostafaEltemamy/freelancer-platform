-- CreateEnum
CREATE TYPE "ProfileStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "freelancer_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "username" VARCHAR(30),
    "headline" VARCHAR(160),
    "bio" TEXT,
    "city" VARCHAR(100),
    "country_code" VARCHAR(2),
    "website_url" VARCHAR(2048),
    "status" "ProfileStatus" NOT NULL DEFAULT 'DRAFT',
    "onboarding_completed_at" TIMESTAMPTZ(3),
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "freelancer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "freelancer_profiles_user_id_key" ON "freelancer_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "freelancer_profiles_username_key" ON "freelancer_profiles"("username");

-- CreateIndex
CREATE INDEX "freelancer_profiles_status_published_at_idx" ON "freelancer_profiles"("status", "published_at");

-- AddForeignKey
ALTER TABLE "freelancer_profiles" ADD CONSTRAINT "freelancer_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
