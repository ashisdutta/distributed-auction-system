import { WSContext } from 'hono/ws';
import { subClient } from "../lib/redis.js";

/**
 * 1. GLOBAL TRACKER (CS Pattern: Observer Map)
 * Key: auctionId, Value: Set of active WebSocket connections
 */
const subscriptions = new Map<string, Set<WSContext>>();

/**
 * 2. ENHANCED REDIS LISTENER
 * Listens for bids and "The Gavel" (Auction End).
 */
subClient.on('message', (channel, message) => {
  const auctionId = channel.split(':')[1];
  const clients = subscriptions.get(auctionId);

  if (clients) {
    const data = JSON.parse(message);

    clients.forEach((ws) => {
      try {
        // We can now intercept the message to add custom logic if needed
        if (data.type === 'AUCTION_ENDED') {
            // We could wrap this in a special "Final" UI event for the frontend
            ws.send(JSON.stringify({
              ...data,
              server_note: "The gavel has fallen. This auction is officially closed."
            }));
          } else {
            ws.send(message);
        }
      } catch (err) {
        clients.delete(ws);
      }
    });

    // Cleanup local memory if the auction is finished
    if (data.type === 'AUCTION_ENDED') {
      console.log(`🧹 Cleaning up WS room for closed auction: ${auctionId}`);
      subClient.unsubscribe(channel);
      subscriptions.delete(auctionId);
    }
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
          const { auctionId } = data;
          const channel = `auction_updates:${auctionId}`;

          if (!subscriptions.has(auctionId)) {
            subscriptions.set(auctionId, new Set());
            await subClient.subscribe(channel);
          }
          
          subscriptions.get(auctionId)?.add(ws);
          console.log(`📡 User joined room for auction: ${auctionId}`);
        }
      } catch (err) {
        console.error("WS Message Error:", err);
      }
    },

    onClose: (event: any, ws: WSContext) => {
      // Manual cleanup for individual disconnects
      subscriptions.forEach((clients, auctionId) => {
        if (clients.has(ws)) {
          clients.delete(ws);
          if (clients.size === 0) {
            subClient.unsubscribe(`auction_updates:${auctionId}`);
            subscriptions.delete(auctionId);
          }
        }
      });
      console.log('🔌 Connection closed by client');
    },
  };
};