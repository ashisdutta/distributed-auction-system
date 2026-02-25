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