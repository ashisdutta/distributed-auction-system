import {Hono} from 'hono'
import prisma from '../lib/prisma.js'
import { signupInput, emailSchema } from '../middleware/zod.js'
import nodemailer from 'nodemailer'
import redis from '../lib/redis.js'
import {sign} from "hono/jwt"
import {setCookie} from "hono/cookie"


export const userRouter = new Hono()

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    }
})

userRouter.post("/send-otp", async (c)=>{
    const body = await c.req.json();
    const parsed = emailSchema.safeParse(body);
    if(!parsed.success){
        c.status(411)
        return c.json({
            message: "wrong email format"
        })
    }

    const {email} = parsed.data;
    const existingUser = await prisma.user.findUnique({
        where:{
            email
        }
    })
    if(existingUser){
        c.status(400)
        c.json({
            error: "Email already registered"
        })
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    try {
        //redis.setex(key, seconds, value)
        await redis.setex(`otp:${email}`, 360, otp);

        await transporter.sendMail({
            from:`"Auction System" ${process.env.EMAIL_USER}`,
            to:email,
            subject:"Verify your email",
            text:`Your OTP is: ${otp}. It expires in 6 minutes.`
        });

        return c.json({message: "Verification email sent!"});
    } catch (error) {
        c.status(500)
        return c.json({ error: "Failed to sent email"}, 500);
    }
})

userRouter.post("/verify-otp", async (c)=>{
    const {email, otp} = await c.req.json();

    try {
        const storedOtp = await redis.get(`otp:${email}`);

        if(storedOtp!=otp){
            return c.json({error: "Invalid or expired otp"}, 400)
        }
        await redis.setex(`verified_email:${email}`, 900, "true")
        await redis.del(`otp:${email}`);

        return c.json({ message: "Email verified! You can now signup" });
    } catch (error) {
        c.status(411)
        return c.json({
            message:`wrong otp ${error}`
        })
    }
})

userRouter.post("/signup", async (c)=>{
    const body  = await c.req.json();

    const parsed = signupInput.safeParse(body)
    if(!parsed.success){
        return c.json("incorrect Input format");
    }

    const {email, name, password} = parsed.data;

    const isVerified = await redis.get(`verified_email:${email}`);
    if (!isVerified) {
        return c.json({ error: "Please verify your email first" }, 403);
    }

    try {
        const newUser = await prisma.user.create({
            data:{email, name, password}
        })
        

        const token = await sign({id:newUser.id, name:newUser.name}, process.env.JWT_SECRET as string)

        setCookie(c,"auth_token", token, {
            httpOnly:true,
            secure:true,
            sameSite:'Lax',
            maxAge: 60*60*24*7
        })

        await redis.del(`verified_email:${email}`);
        return c.json({message:"Welcome to the Auction System!", user:newUser});
    }catch(e){
        return c.json({error: "User already exists or DB error"}, 400)
    }
})

userRouter.post("/signin", async (c)=>{

})