import {Hono} from 'hono'
import prisma from '../lib/prisma.js'


export const auctionRouter = new Hono()

auctionRouter.post("/",async (c)=>{
    const auction = c.req.json()
    console.log("hello")
})