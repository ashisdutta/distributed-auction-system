import z from "zod"

export const emailSchema = z.object({
    email:z.string()
})

export const signupInput = z.object({
    name: z.string(),
    email:z.email(),
    password: z.string().min(8)
})

export const signinInput = z.object({
    email: z.email(),
    password: z.string().min(8)
})

export const createAuctionSchema = z.object({
    title: z.string().min(3),
    description: z.string().min(10),
    photo: z.array(z.string()).optional().default([]),
    startPrice: z.number().int().positive(),
    durationHours: z.number().min(1), // We'll calculate endTime from this
    startTime: z.string().optional()
});