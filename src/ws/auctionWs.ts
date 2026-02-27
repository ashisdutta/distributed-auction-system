import { WSContext } from 'hono/ws';
import { subClient } from "../lib/redis.js";


export const auctionWsHandler = (c: any) => {
  return {
    onOpen(event: any, ws: WSContext) {
      console.log('✅ Client connected to Live Stream');
    },

    async onMessage(event: any, ws: WSContext) {
      try {
        const data = JSON.parse(event.data.toString());

        // Protocol: Frontend sends { "type": "JOIN_AUCTION", "auctionId": "xyz" }
        if (data.type === 'JOIN_AUCTION') {
          const auctionId = data.auctionId;
          const channel = `auction_updates:${auctionId}`;

          console.log(`📡 Subscribing to Redis Channel: ${channel}`);


          await subClient.subscribe(channel);

          const messageHandler = (chan: string, message: string) => {
            if (chan === channel) {
              ws.send(message);
            }
          };

          subClient.on('message', messageHandler);

          return () => {
            subClient.off('message', messageHandler);
            console.log(`❌ Unsubscribed from channel: ${channel}`);
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
}