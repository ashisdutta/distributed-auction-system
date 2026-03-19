import {Hono} from 'hono'
import prisma from '../lib/prisma.js'
import { createAuctionSchema } from '../middleware/zod.js'
import { redis, subClient} from '../lib/redis.js'


export const auctionRouter = new Hono<{ Variables: { userId: string, userName:string } }>()

auctionRouter.post("/create", async (c) => {
    const userId = c.get('userId');
    const body = await c.req.json();

    const parsed = createAuctionSchema.safeParse(body);
    if (!parsed.success) {
        console.error("ZOD VALIDATION FAILED:", parsed.error); 
        return c.json({ error: "Invalid data" });
    }
    const { title, description, photo, startPrice, durationHours, startTime } = parsed.data;

    // 1. Check for an existing ACTIVE auction with this title by this user
    const existing = await prisma.auction.findFirst({
        where: {
            sellerId: userId,
            title: title,
            status: "ACTIVE"
        }
    });

    if (existing) {
        // Sync Redis with the ACTUAL current state from the DB
        const auctionKey = `auction:${existing.id}`;
        await redis.hset(auctionKey, {
            price: existing.currentPrice.toString(), // Use the bid price from previous runs
            winner: existing.winnerId || "",         // Use the existing winner
            sellerId: existing.sellerId,             // Validation rule
            endTime: existing.endTime.getTime().toString()
        });

        console.log(`♻️  Reusing existing auction ${existing.id} - Redis synced to $${existing.currentPrice}`);
        return c.json({ message: "Using existing auction", auction: existing }, 200);
    }

    // 2. If no existing auction, proceed with creation logic
    try {
        const startAt = startTime ? new Date(startTime) : new Date();
        const endAt = new Date(startAt.getTime() + durationHours * 60 * 60 * 1000);

        const isLiveNow = startAt <= new Date();
        const status = isLiveNow ? "ACTIVE" : "PENDING";

        const auction = await prisma.auction.create({
            data: {
                title,
                description,
                photo,
                startPrice,
                currentPrice: startPrice,
                sellerId: userId,
                startTime: startAt,
                endTime: endAt,
                status
            }
        });

        // 3. Warm up Redis for NEW live auctions
        if (status === "ACTIVE") {
            const auctionKey = `auction:${auction.id}`;
            await redis.hset(auctionKey, {
                price: auction.startPrice.toString(),
                winner: "",
                sellerId: userId,
                endTime: auction.endTime.getTime().toString()
            });
        }

        await redis.publish(
            'dashboard_updates:global',
            JSON.stringify({
                type: 'NEW_AUCTION',
                payload: auction 
            })
        )

        return c.json({ 
            message: "Auction created successfully", 
            auction: auction 
        }, 201);

    } catch (error) {
        console.error("Create Auction Error:", error);
        return c.json({ error: "Failed to create auction" }, 500);
    }
});

auctionRouter.post("/:id/start", async (c)=>{
    const userId = c.get("userId");
    const id = c.req.param("id");

    try {
        const auction = await prisma.auction.findUnique({ where: { id } });

        if (!auction) {
            return c.json({ error: "Unauthorized or not found" }, 403);
        }
        if (!auction.startTime) {
            return c.json({ error: "Cannot calculate duration. Auction is missing an initial start time." }, 400);
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

        const auctionKey = `auction:${id}`;
        const initialPrice = auction.currentPrice || auction.startPrice;

        await redis.hset(auctionKey, {
            price: initialPrice.toString(), // Tell Redis the starting price
            winner: auction.winnerId || "", 
            sellerId: userId,                          // No winner yet
            endTime: newEndTime.getTime().toString() // Tell Redis when to stop
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
                winner: { select: { name: true } },
                bids: {
                    orderBy:{amount:'desc'},
                    include:{
                        bidder: {select: {name:true}}
                    }
                }
            }
        });

        
        if (!auction) return c.json({ error: "Not found" }, 404);
        const { bids, ...auctionData } = auction;

        return c.json({
            auction: auctionData,
            bids: bids
        });
    } catch (e) {
        return c.json({ error: "Error fetching item" }, 500);
    }
});


auctionRouter.post("/:id/bid", async (c) => {
    const userId = c.get('userId');
    const userName = c.get('userName');
    const auctionId = c.req.param('id');
    const { amount } = await c.req.json();
    const auctionKey = `auction:${auctionId}`;

    try {
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
        if (result === "SELLER_CANNOT_BID") {
            return c.json({ error: "Sellers cannot bid on their own auctions!" }, 403);
        }

        const now = new Date();
        await redis.publish(`auction_updates:${auctionId}`, JSON.stringify({
            newPrice: amount,
            bidderId: userName,
            timestamp: now
        }));

        try {

            await prisma.$transaction([
                prisma.bid.create({
                data: {
                    amount: amount,
                    bidderId: userId,
                    auctionId: auctionId,
                    createdAt: now
                }
                }),
                prisma.auction.update({
                    where: { id: auctionId },
                    data: {
                        currentPrice: amount,
                        winnerId: userId
                    }
                })
            ])
            
        } catch (dbError) {
            console.error("Critical: Failed to sync Redis bid to Postgres", dbError);
        }

        return c.json({ message: "Success! You are currently winning." });

    } catch (error) {
        console.error("Bidding Error:", error);
        return c.json({ error: "Internal server error during bidding" }, 500);
    }
});