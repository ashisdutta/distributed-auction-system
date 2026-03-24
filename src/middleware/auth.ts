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
        c.set('userName', payload.name)
        
        await next();
    } catch (error) {
        return c.json({ error: "Unauthorized: Invalid or expired token" }, 401);
    }
};


// //------------------------- for testing ---------------------------
// import { type Context, type Next } from 'hono';
// import { verify } from 'hono/jwt';
// import { getCookie } from 'hono/cookie';

// export const authMiddleware = async (c: Context, next: Next) => {
//     //1. THE LOAD TESTING BACKDOOR (Only works in local development)
//     if (process.env.NODE_ENV !== 'production' && c.req.header('x-load-test-token') === 'super-secret-k6-token') {
//         // Generate a random ID between 1 and 100 so Postgres thinks these are 100 different people
//         const randomId = `test-user-${Math.floor(Math.random() * 100)}`;
        
//         c.set('userId', randomId);
//         c.set('userName', `Bot ${randomId}`);
        
//         return next();
//     }

//     const token = getCookie(c, 'auth_token');

//     if (!token) {
//         return c.json({ error: "Unauthorized: No token found" }, 401);
//     }

//     try {
//         const payload = await verify(token, process.env.JWT_SECRET as string, "HS256");
//         c.set('userId', payload.id);
//         c.set('userName', payload.name);
        
//         await next();
//     } catch (error) {
//         return c.json({ error: "Unauthorized: Invalid or expired token" }, 401);
//     }
// };