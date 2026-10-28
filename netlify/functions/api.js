import serverless from 'serverless-http';
import app, { connectDatabase } from '../../server/app.js';

const expressHandler = serverless(app, {
  binary: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
});

export async function handler(event, context) {
  try {
    if (!process.env.SESSION_SECRET) {
      throw new Error('SESSION_SECRET is required for the Netlify API');
    }
    await connectDatabase();
    return await expressHandler(event, context);
  } catch (error) {
    console.error('API initialization failed:', error);
    return {
      statusCode: 503,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'API configuration is incomplete or the database is unavailable.' })
    };
  }
}
