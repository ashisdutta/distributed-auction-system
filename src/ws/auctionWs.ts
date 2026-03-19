import { WSContext } from 'hono/ws';
import { subClient } from "../lib/redis.js";

const subscriptions = new Map<string, Set<WSContext>>();

const broadcastWatcherCount = (roomKey: string) => {
  const clients = subscriptions.get(roomKey);
  if (!clients) return;
  
  const count = clients.size;
  clients.forEach((ws) => {
    ws.send(JSON.stringify({ type: 'WATCHERS_UPDATE', count }));
  });
};

const joinRoom = async (roomKey: string, channel: string, ws: WSContext) => {
  if (!subscriptions.has(roomKey)) {
    subscriptions.set(roomKey, new Set());
    await subClient.subscribe(channel);
  }
  subscriptions.get(roomKey)?.add(ws);
  broadcastWatcherCount(roomKey);
};

subClient.on('message', (channel, message) => {
  const roomKey = channel.split(':')[1]; 
  const clients = subscriptions.get(roomKey);

  if (clients) {
    const data = JSON.parse(message);

    clients.forEach((ws) => {
      try {
        if (data.type === 'AUCTION_ENDED') {
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

    if (data.type === 'AUCTION_ENDED') {
      console.log(`Cleaning up WS room for closed auction: ${roomKey}`);
      subClient.unsubscribe(channel);
      subscriptions.delete(roomKey);
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

        //SCENARIO A: User joins a specific auction room
        if (data.type === 'JOIN_AUCTION') {
          await joinRoom(data.auctionId, `auction_updates:${data.auctionId}`, ws);
          console.log(`User joined room for auction: ${data.auctionId}`);
        }

        //SCENARIO B: User joins the global dashboard lobby
        if (data.type === 'JOIN_DASHBOARD') {
          await joinRoom('global', 'dashboard_updates:global', ws);
          console.log(`User joined the Global Dashboard Lobby`);
        }

      } catch (err) {
        console.error("WS Message Error:", err);
      }
    },

    onClose: (event: any, ws: WSContext) => {
      subscriptions.forEach((clients, roomKey) => {
        if (clients.has(ws)) {
          clients.delete(ws);
          broadcastWatcherCount(roomKey);
          
          if (clients.size === 0) {
            const channelToUnsubscribe = roomKey === 'global' 
              ? `dashboard_updates:global` 
              : `auction_updates:${roomKey}`;
                
            subClient.unsubscribe(channelToUnsubscribe);
            subscriptions.delete(roomKey);
          }
        }
      });
      console.log('Connection closed by client');
    },
  };
};