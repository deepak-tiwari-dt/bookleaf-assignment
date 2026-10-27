import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import app, { connectDatabase } from './app.js';
import { seedData } from './seed.js';

const PORT = Number(process.env.PORT || 5001);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await connectDatabase();
console.log(`MongoDB connected: ${mongoose.connection.name}`);
await seedData();

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(root, 'dist')));
  app.get('*', (_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')));
}

app.listen(PORT, () => console.log(`BookLeaf Express API listening on http://localhost:${PORT}`));
