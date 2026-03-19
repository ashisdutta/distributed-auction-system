-- DropIndex
DROP INDEX "Auction_status_idx";

-- CreateIndex
CREATE INDEX "Auction_endTime_status_idx" ON "Auction"("endTime", "status");
