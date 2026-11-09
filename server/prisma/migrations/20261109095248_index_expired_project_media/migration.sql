-- CreateIndex
CREATE INDEX "project_media_status_created_at_updated_at_idx" ON "project_media"("status", "created_at", "updated_at");
