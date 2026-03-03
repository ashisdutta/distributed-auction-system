// one listener for the whole app and use a Map to track which WebSockets belong to which auction. This is much more memory-efficient.
import { WSContext } from 'hono/ws';
import { subClient } from "../lib/redis.js";

/**
 * 1. GLOBAL TRACKER (CS Pattern: Observer Map)
 * Key: auctionId, Value: Set of active WebSocket connections
 */
const subscriptions = new Map<string, Set<WSContext>>();

/**
 * 2. SINGLE REDIS LISTENER
 * we attach this ONCE. It listens to all "shouts" and 
 * distributes them to the correct "rooms" (Sets).
 */
subClient.on('message', (channel, message) => {
  const auctionId = channel.split(':')[1]; // Get '123' from 'auction_updates:123'
  const clients = subscriptions.get(auctionId);

  if (clients) {
    clients.forEach((ws) => {
      try {
        ws.send(message);
      } catch (err) {
        // If sending fails, the socket might be dead; remove it
        clients.delete(ws);
      }
    });
  }
});

export const auctionWsHandler = (c: any) => {
  return {
    onOpen(event: any, ws: WSContext) {
      console.log('✅ Client connected to Live Stream');
    },

    async onMessage(event: any, ws: WSContext) {
      try {
        const data = JSON.parse(event.data.toString());

        if (data.type === 'JOIN_AUCTION') {
          const {auctionId} = data;
          const channel = `auction_updates:${auctionId}`;

          // Add this WebSocket to the specific auction "room"
          if (!subscriptions.has(auctionId)) {
            subscriptions.set(auctionId, new Set());
            // Only tell Redis to subscribe if this is the first person watching
            await subClient.subscribe(channel);
          }
          
          subscriptions.get(auctionId)?.add(ws);
          console.log(`📡 User joined room for auction: ${auctionId}`);

          /**
           * 3. CLEANUP
           * Hono's upgradeWebSocket allows returning a cleanup function.
           */
          return () => {
            const clients = subscriptions.get(auctionId);
            if (clients) {
              clients.delete(ws);
              // If no one is left watching, tell Redis to stop listening to save bandwidth
              if (clients.size === 0) {
                subClient.unsubscribe(channel);
                subscriptions.delete(auctionId);
              }
            }
          };
        }
      } catch (err) {
        console.error("WS Message Error:", err);
      }
    },

    onClose: () => {
      console.log('🔌 Connection closed by client');
    },
  };
};