-- CreateIndex
CREATE INDEX "users_consentGiven_id_idx" ON "users"("consentGiven", "id");

-- CreateIndex
CREATE INDEX "announcement_deliveries_campaignId_status_id_idx" ON "announcement_deliveries"("campaignId", "status", "id");
