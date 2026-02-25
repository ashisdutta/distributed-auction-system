import { type Context, type Next } from 'hono';
import { verify } from 'hono/jwt';
import { getCookie } from 'hono/cookie';

export const authMiddleware = async (c: Context, next: Next) => {
    const token = getCookie(c, 'auth_token');

    if (!token) {
        return c.json({ error: "Unauthorized: No token found" }, 401);
    }

    try {
        const payload = await verify(token, process.env.JWT_SECRET as string, "HS256");
        c.set('userId', payload.id);
        
        await next();
    } catch (error) {
        return c.json({ error: "Unauthorized: Invalid or expired token" }, 401);
    }
};