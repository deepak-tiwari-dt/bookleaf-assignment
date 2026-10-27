import 'dotenv/config';
import mongoose from 'mongoose';
import app, { connectDatabase } from './app.js';

const port = Number(process.env.PORT || 10000);

await connectDatabase();
console.log(`MongoDB connected: ${mongoose.connection.name}`);

app.listen(port, '0.0.0.0', () => {
  console.log(`BookLeaf server listening on port ${port}`);
});
