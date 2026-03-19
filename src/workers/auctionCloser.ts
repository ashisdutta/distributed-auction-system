import cron from 'node-cron';
import prisma from '../lib/prisma.js'; 
import { redis } from '../lib/redis.js';

export const startAuctionWorker = () => {
  // Runs every 10 seconds for higher precision than a 1-minute cron
  cron.schedule('*/10 * * * * *', async () => {
    console.log('⏰ Worker: Checking for auctions to finalize...');

    try {
        // 1. Find auctions past their endTime that aren't 'ENDED' yet
        const expiredAuctions = await prisma.auction.findMany({
            where: {
                endTime: { lt: new Date() },
                status: { in: ['ACTIVE', 'PENDING'] }, 
            },
        });

        if (expiredAuctions.length === 0) return;

        for (const auction of expiredAuctions) {
            // 2. DISTRIBUTED LOCK (ASG Protection)
            // Prevents multiple server instances from finalizing the same auction.
            const lockKey = `lock:finalize:${auction.id}`;
            const acquiredLock = await redis.set(lockKey, "locked", "EX", 60, "NX"); 

            if (!acquiredLock) {
                console.log(`⏩ Skipping ${auction.id}: Another worker is processing it.`);
                continue;
            }

            const auctionKey = `auction:${auction.id}`;
            let finalPrice = auction.currentPrice;
            let finalWinner = auction.winnerId;

            // 3. Final State Sync from Redis
            if (auction.status === 'ACTIVE') {
                const [redisPrice, redisWinner] = await Promise.all([
                    redis.hget(auctionKey, 'price'),
                    redis.hget(auctionKey, 'winner')
                ]);

                if (redisPrice) finalPrice = Number(redisPrice);
                if (redisWinner && redisWinner !== "") finalWinner = redisWinner;

                console.log(`🔨 Finalizing ACTIVE Auction ${auction.id}. Winner: ${finalWinner}`);
            }

            // 4. Update Postgres Status to ENDED
            await prisma.auction.update({
                where: { id: auction.id },
                data: {
                    status: 'ENDED',
                    currentPrice: finalPrice,
                    winnerId: finalWinner,
                },
            });

            // 5. Broadcast "The Gavel" to WebSockets
            await redis.publish(`auction_updates:${auction.id}`, JSON.stringify({
                type: "AUCTION_ENDED",
                finalPrice: finalPrice,
                winnerId: finalWinner,
                timestamp: new Date().toISOString()
            }));

            // 6. Cleanup Redis Memory
            await redis.del(auctionKey);
            
            console.log(`✅ Auction ${auction.id} is now officially CLOSED.`);
        }
    } catch (error) {
        console.error('❌ Error in Auction Closer Worker:', error);
    }
    });
};