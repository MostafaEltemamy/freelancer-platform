-- CreateEnum
CREATE TYPE "PortfolioProjectVisibility" AS ENUM ('PRIVATE', 'PUBLIC');

-- CreateTable
CREATE TABLE "portfolio_projects" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "summary" VARCHAR(500),
    "description" TEXT,
    "role" VARCHAR(120),
    "project_url" VARCHAR(2048),
    "source_url" VARCHAR(2048),
    "technologies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "started_on" DATE,
    "ended_on" DATE,
    "visibility" "PortfolioProjectVisibility" NOT NULL DEFAULT 'PRIVATE',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "portfolio_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_skills" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "normalized_name" VARCHAR(80) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "profile_skills_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "portfolio_projects_profile_id_visibility_sort_order_idx" ON "portfolio_projects"("profile_id", "visibility", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_projects_profile_id_slug_key" ON "portfolio_projects"("profile_id", "slug");

-- CreateIndex
CREATE INDEX "profile_skills_profile_id_sort_order_idx" ON "profile_skills"("profile_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "profile_skills_profile_id_normalized_name_key" ON "profile_skills"("profile_id", "normalized_name");

-- AddForeignKey
ALTER TABLE "portfolio_projects" ADD CONSTRAINT "portfolio_projects_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "freelancer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_skills" ADD CONSTRAINT "profile_skills_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "freelancer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
