import cron from 'node-cron';
import prisma from '../lib/prisma.js'; 
import { redis } from '../lib/redis.js';

export const startAuctionWorker = () => {
  // Runs every minute to check for auctions that have passed their endTime
  cron.schedule('* * * * *', async () => {
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
            const auctionKey = `auction:${auction.id}`;
            let finalPrice = auction.currentPrice;
            let finalWinner = auction.winnerId;

            // 2. If the auction was ACTIVE, sync the final state from Redis
            if (auction.status === 'ACTIVE') {
                const [redisPrice, redisWinner] = await Promise.all([
                    redis.hget(auctionKey, 'price'),
                    redis.hget(auctionKey, 'winner')
                ]);

                // Only update if Redis actually had data (prevents null errors)
                if (redisPrice) finalPrice = Number(redisPrice);
                if (redisWinner && redisWinner !== "") finalWinner = redisWinner;

                console.log(`🔨 Finalizing ACTIVE Auction ${auction.id}. Winner: ${finalWinner}`);
            } else {
                console.log(`📁 Closing PENDING Auction ${auction.id} (Never started).`);
            }

            // 3. Update Postgres Status to ENDED
            await prisma.auction.update({
                where: { id: auction.id },
                data: {
                    status: 'ENDED',
                    currentPrice: finalPrice,
                    winnerId: finalWinner,
                },
            });

            // 4. Broadcast the end of the auction to WebSockets
            await redis.publish(`auction_updates:${auction.id}`, JSON.stringify({
                type: "AUCTION_ENDED",
                finalPrice: finalPrice,
                winnerId: finalWinner,
                timestamp: new Date().toISOString()
            }));

            // 5. Cleanup: Remove from Redis memory
            // Even if it was PENDING, calling DEL on a non-existent key is safe.
            await redis.del(auctionKey);
            
            console.log(`✅ Auction ${auction.id} is now officially CLOSED.`);
        }
    } catch (error) {
        console.error('❌ Error in Auction Closer Worker:', error);
    }
    });
};