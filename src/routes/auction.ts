import {Hono} from 'hono'
import prisma from '../lib/prisma.js'
import { createAuctionSchema } from '../middleware/zod.js'
import { parse } from 'path'


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
    const { amount } = await c.req.json(); // The price the user is offering

    try {
        // 1. Fetch the latest data for this auction
        const auction = await prisma.auction.findUnique({
            where: { id: auctionId }
        });

        if (!auction) return c.json({ error: "Auction not found" }, 404);

        // 2. Security & Status Checks
        if (auction.status !== "ACTIVE" || auction.endTime < new Date()) {
            return c.json({ error: "This auction is closed" }, 400);
        }

        if (auction.sellerId === userId) {
            return c.json({ error: "You cannot bid on your own item!" }, 400);
        }

        // 3. The "Winning" Check
        if (amount <= auction.currentPrice) {
            return c.json({ error: "Your bid must be higher than the current price" }, 400);
        }

        // 4. Update the "Temporary Winner"
        const updatedAuction = await prisma.auction.update({
            where: { id: auctionId },
            data: {
                currentPrice: amount,
                winnerId: userId // This user is now the winner (for now!)
            }
        });

        return c.json({ message: "Bid placed! You are currently winning.", auction: updatedAuction });

    } catch (e) {
        return c.json({ error: "Bidding failed" }, 500);
    }
});