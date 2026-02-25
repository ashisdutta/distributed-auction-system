import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import {userRouter} from './routes/user.js';
import {auctionRouter} from './routes/auction.js';
import {cors} from 'hono/cors'

const app = new Hono()

app.use("/*", cors())
app.route("/api/user", userRouter)
app.route("/api/auction", auctionRouter)

serve({
  fetch: app.fetch,
  port: 3000
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})
