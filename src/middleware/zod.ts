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
    // Fix: If you are sending a single string, use this:
    photo: z.union([z.string(), z.array(z.string())])
        .optional()
        .default([])
        .transform((val) => {
            // If it's already an array, return it. 
            // If it's a string, wrap it: [val]. 
            // If empty, return empty array [].
            if (!val) return [];
            return Array.isArray(val) ? val : [val];
        }),
    startPrice: z.coerce.number().int().positive(),
    durationHours: z.coerce.number().min(1), 
    startTime: z.string().datetime().optional()
});