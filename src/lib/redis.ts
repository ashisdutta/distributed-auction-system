import { Redis } from 'ioredis';

// 1. Define the TypeScript Interface for our Custom Command
interface CustomRedis extends Redis {
    placeBid(
        key: string,
        amount: number,
        userId: string,
        now: number
    ): Promise<"SUCCESS" | "LOW_BID" | "EXPIRED" | "AUCTION_NOT_FOUND">;
}

// 2. The Atomic Lua Script (The "Referee")
const BID_LUA_SCRIPT = `
    local current_price = tonumber(redis.call('HGET', KEYS[1], 'price'))
    local end_time = tonumber(redis.call('HGET', KEYS[1], 'endTime'))
    local now = tonumber(ARGV[3])

    if not current_price or not end_time then 
        return "AUCTION_NOT_FOUND" 
    end

    if now > end_time then return "EXPIRED" end
    if tonumber(ARGV[1]) <= current_price then return "LOW_BID" end

    redis.call('HSET', KEYS[1], 'price', ARGV[1], 'winner', ARGV[2])
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