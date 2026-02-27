import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import {userRouter} from './routes/user.js';
import {auctionRouter} from './routes/auction.js';
import {cors} from 'hono/cors'
import { authMiddleware } from './middleware/auth.js';
import { createNodeWebSocket } from '@hono/node-ws';
import { auctionWsHandler } from './ws/auctionWs.js';




const app = new Hono()

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
app.get('/ws', upgradeWebSocket(auctionWsHandler));

app.use("/*", cors())
app.use("/api/auction/*", authMiddleware)
app.route("/api/user", userRouter)
app.route("/api/auction", auctionRouter)

serve({
  fetch: app.fetch,
  port: 3000
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})
