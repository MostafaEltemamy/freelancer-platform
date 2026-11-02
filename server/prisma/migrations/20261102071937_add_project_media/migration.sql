-- CreateEnum
CREATE TYPE "ProjectMediaKind" AS ENUM ('IMAGE', 'VIDEO', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "ProjectMediaStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "project_media" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "storage_key" VARCHAR(512) NOT NULL,
    "preview_key" VARCHAR(512),
    "original_filename" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "kind" "ProjectMediaKind" NOT NULL,
    "status" "ProjectMediaStatus" NOT NULL DEFAULT 'PENDING',
    "is_cover" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "section_id" UUID,
    "width" INTEGER,
    "height" INTEGER,
    "alt_text" VARCHAR(200),
    "caption" VARCHAR(500),
    "version" INTEGER NOT NULL DEFAULT 1,
    "ready_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "project_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_media_storage_key_key" ON "project_media"("storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "project_media_preview_key_key" ON "project_media"("preview_key");

-- CreateIndex
CREATE INDEX "project_media_project_id_status_sort_order_idx" ON "project_media"("project_id", "status", "sort_order");

-- CreateIndex
CREATE INDEX "project_media_project_id_section_id_sort_order_idx" ON "project_media"("project_id", "section_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "project_media_unique_cover" ON "project_media"("project_id") WHERE ("is_cover" = true);

-- AddForeignKey
ALTER TABLE "project_media" ADD CONSTRAINT "project_media_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "portfolio_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
