import {Hono} from 'hono'
import prisma from '../lib/prisma.js'
import { createAuctionSchema } from '../middleware/zod.js'
import { redis, subClient} from '../lib/redis.js'


export const auctionRouter = new Hono<{ Variables: { userId: string } }>()

auctionRouter.post("/create",async (c)=>{
    const userId = c.get('userId');
    const body = await c.req.json();

    const parsed = createAuctionSchema.safeParse(body);
    if(!parsed.success){
        return c.json( {error: "Invalid data"})
    }

    const { title, description, photo, startPrice, durationHours, startTime} = parsed.data;

    try {
        const startAt = startTime ? new Date(startTime):new Date();
        const endAt = new Date(startAt.getTime() + durationHours*60*60*1000);

        const isLiveNow = startAt <= new Date();
        const status = isLiveNow ? "ACTIVE" : "PENDING";

        const auction = await prisma.auction.create({
            data: {
                title,
                description,
                photo,
                startPrice,
                currentPrice: startPrice,
                sellerId:userId,
                startTime: startAt,
                endTime:endAt,
                status
            }
        });

        return c.json({
            message: isLiveNow ? "Auction is live": `Auction scheduled for ${startAt.toLocaleString()}`
        })
    } catch (error) {
        return c.json({ error: "Failed to create auction" }, 500);
    }
})

auctionRouter.post("/:id/start", async (c)=>{
    const userId = c.get("userId");
    const id = c.req.param("id");

    try {
        const auction = await prisma.auction.findUnique({ where: { id } });

        if (!auction) {
            return c.json({ error: "Unauthorized or not found" }, 403);
        }

        const durationMs = auction.endTime.getTime() - auction.startTime.getTime();
        const now = new Date();
        const newEndTime = new Date(now.getTime() + durationMs);

        const updated = await prisma.auction.update({
            where: { id },
            data: {
                status: "ACTIVE",
                startTime: now,
                endTime: newEndTime
            }
        });

        return c.json({ message: "Auction is now live!", auction: updated });
    } catch (error) {
        return c.json({ error: "Failed to start" }, 500);
    }
})

auctionRouter.get("/active", async (c) => {
    try {
        const auctions = await prisma.auction.findMany({
            where: {
                status: "ACTIVE",
                endTime: { gte: new Date() } //gte means -> '>='
            },
            include: {
                seller: { select: { name: true } }
            },
            orderBy: { endTime: 'asc' } // Showing items ending soonest first
        });
        return c.json(auctions);
    } catch (e) {
        return c.json({ error: "Failed to fetch" }, 500);
    }
});

auctionRouter.get("/my-auctions", async (c) => {
    const userId = c.get('userId');
    try {
        const auctions = await prisma.auction.findMany({
            where: { sellerId: userId },
            orderBy: { startTime: 'desc' }
        });
        return c.json(auctions);
    } catch (e) {
        return c.json({ error: "Failed to fetch your auctions" }, 500);
    }
});


auctionRouter.get("/:id", async (c) => {
    const id = c.req.param('id');
    try {
        const auction = await prisma.auction.findUnique({
            where: { id },
            include: {
                seller: { select: { name: true } },
                winner: { select: { name: true } }
            }
        });
        if (!auction) return c.json({ error: "Not found" }, 404);
        return c.json(auction);
    } catch (e) {
        return c.json({ error: "Error fetching item" }, 500);
    }
});


auctionRouter.post("/:id/bid", async (c) => {
    const userId = c.get('userId');
    const auctionId = c.req.param('id');
    const { amount } = await c.req.json();
    
    // We target the specific "Hash" key for this auction in Redis
    const auctionKey = `auction:${auctionId}`;

    try {
        // STEP 1: Execute the Lua Script (The Speed Layer)
        // Using the .placeBid() method we defined in redis.ts
        // It returns SUCCESS, LOW_BID, EXPIRED, or AUCTION_NOT_FOUND
        const result = await redis.placeBid(
            auctionKey, 
            amount, 
            userId, 
            Date.now()
        );

        if (result === "LOW_BID") {
            return c.json({ error: "Your bid is too low. Someone else bid higher!" }, 400);
        }
        if (result === "EXPIRED") {
            return c.json({ error: "Auction has already ended." }, 400);
        }
        if (result === "AUCTION_NOT_FOUND") {
            return c.json({ error: "Auction data not found in cache." }, 404);
        }

        // STEP 2: Redis Pub/Sub (The Notification Layer)
        // We "Broadcast" this update. The WebSocket server is listening.
        await redis.publish(`auction_updates:${auctionId}`, JSON.stringify({
            newPrice: amount,
            bidderId: userId,
            timestamp: new Date()
        }));

        // STEP 3: Postgres Sync (The Persistence Layer)
        // We update the "Source of Truth" in the background.
        // Even if this fails, the user is already "winning" in memory.
        try {
            await prisma.auction.update({
                where: { id: auctionId },
                data: {
                    currentPrice: amount,
                    winnerId: userId
                }
            });
        } catch (dbError) {
            console.error("Critical: Failed to sync Redis bid to Postgres", dbError);
            // In a pro system, you'd add this to a retry queue.
        }

        return c.json({ message: "Success! You are currently winning." });

    } catch (error) {
        console.error("Bidding Error:", error);
        return c.json({ error: "Internal server error during bidding" }, 500);
    }
});