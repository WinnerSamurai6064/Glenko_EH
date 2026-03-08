import { getStore } from "@netlify/blobs";
import { neon } from '@neondatabase/serverless';

export default async (request, context) => {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Connect to Neon & Netlify Blobs
    const sql = neon(process.env.DATABASE_URL);
    const imageStore = getStore("images");

    // --- API: Public Routes ---
    if (path === '/api/menu' && method === 'GET') {
        const results = await sql`SELECT * FROM menu ORDER BY id DESC`;
        return Response.json(results);
    }
    
    if (path === '/api/offers' && method === 'GET') {
        const results = await sql`SELECT * FROM offers ORDER BY id DESC`;
        return Response.json(results);
    }

    // Serve Images from Netlify Blobs
    if (path.startsWith('/api/images/')) {
        const key = path.replace('/api/images/', '');
        const blob = await imageStore.get(key, { type: 'blob' });
        if (!blob) return new Response('Not found', { status: 404 });
        
        return new Response(blob, {
            headers: { 'Content-Type': blob.type || 'image/jpeg' }
        });
    }

    // --- API: Admin Protected Routes ---
    if (path.startsWith('/api/admin')) {
        const authHeader = request.headers.get('Authorization');
        if (authHeader !== `Bearer ${process.env.ADMIN_PASSWORD}`) {
            return new Response('Unauthorized', { status: 401 });
        }

        const table = path.includes('offers') ? 'offers' : 'menu';

        if (method === 'POST') {
            const formData = await request.formData();
            const title = formData.get('title');
            const price = formData.get('price');
            const description = formData.get('description') || '';
            const file = formData.get('image');

            if (!title || !price || !file) return new Response('Missing fields', { status: 400 });

            // Save to Netlify Blobs
            const fileName = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
            await imageStore.set(fileName, await file.arrayBuffer(), {
                metadata: { type: file.type }
            });
            const imageUrl = `/api/images/${fileName}`;

            // Save to Neon Database
            if (table === 'offers') {
                await sql`INSERT INTO offers (title, description, price, image_url) VALUES (${title}, ${description}, ${price}, ${imageUrl})`;
            } else {
                await sql`INSERT INTO menu (title, price, image_url) VALUES (${title}, ${price}, ${imageUrl})`;
            }
            return new Response('Added successfully', { status: 200 });
        }

        if (method === 'DELETE') {
            const { id } = await request.json();
            if (table === 'offers') {
                await sql`DELETE FROM offers WHERE id = ${id}`;
            } else {
                await sql`DELETE FROM menu WHERE id = ${id}`;
            }
            return new Response('Deleted successfully', { status: 200 });
        }
    }

    return new Response("Not Found", { status: 404 });
}

// Route all /api/* requests to this function
export const config = {
    path: "/api/*"
};
