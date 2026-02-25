-- DropForeignKey
ALTER TABLE "Auction" DROP CONSTRAINT "Auction_winnerId_fkey";

-- AlterTable
ALTER TABLE "Auction" ALTER COLUMN "winnerId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Auction_status_idx" ON "Auction"("status");

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
