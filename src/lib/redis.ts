import { Redis } from 'ioredis';

// 1. Define the TypeScript Interface for our Custom Command
interface CustomRedis extends Redis {
    placeBid(
        key: string,
        amount: number,
        userId: string,
        now: number
    ): Promise<"SUCCESS" | "LOW_BID" | "EXPIRED" | "AUCTION_NOT_FOUND" | "SELLER_CANNOT_BID">;
}

// 2. The Atomic Lua Script (The "Referee")
const BID_LUA_SCRIPT = `
    local current_price = tonumber(redis.call('hget', KEYS[1], 'price'))
    local seller_id = redis.call('hget', KEYS[1], 'sellerId')
    local bidder_id = ARGV[2]
    local end_time = tonumber(redis.call('hget', KEYS[1], 'endTime'))
    local current_time = tonumber(ARGV[3])

    -- 1. Check if Auction exists
    if not current_price then return "AUCTION_NOT_FOUND" end

    -- 2. Check if Auction ended
    if current_time > end_time then return "EXPIRED" end

    -- 3. VALIDATION: Check if bidder is the seller
    if bidder_id == seller_id then return "SELLER_CANNOT_BID" end

    -- 4. Check if bid is high enough
    if tonumber(ARGV[1]) <= current_price then return "LOW_BID" end

    -- 5. SUCCESS: Update Redis
    redis.call('hset', KEYS[1], 'price', ARGV[1], 'winner', bidder_id)
    return "SUCCESS"
`;

// 3. Initialize the Main Redis Client (The "Worker")
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redisClient = new Redis(redisUrl);

// 4. Register the Custom Lua Command
redisClient.defineCommand('placeBid', {
    numberOfKeys: 1,
    lua: BID_LUA_SCRIPT,
});


export const subClient = new Redis(redisUrl);

// 6. Export the Main Client as our Custom Type
export const redis = redisClient as CustomRedis;

/**
 * SUMMARY OF EXPORTS:
 * - redis: Use this for ALL standard commands (set, get, placeBid, publish).
 * - subClient: Use this ONLY in your WebSocket file to listen (subscribe, on('message')).
 */