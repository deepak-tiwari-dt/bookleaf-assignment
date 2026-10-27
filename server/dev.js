import 'dotenv/config';
import mongoose from 'mongoose';
import app, { connectDatabase } from './app.js';
import { seedData } from './seed.js';

const PORT = Number(process.env.PORT || 5001);

await connectDatabase();
console.log(`MongoDB connected: ${mongoose.connection.name}`);
await seedData();

app.listen(PORT, () => console.log(`BookLeaf Express API listening on http://localhost:${PORT}`));
