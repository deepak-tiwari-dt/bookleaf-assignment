import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { Author, Ticket } from './models.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const sample = JSON.parse(fs.readFileSync(path.join(here, 'data.json'), 'utf8'));
const passwordHash = await bcrypt.hash(process.env.DEMO_PASSWORD || 'demo123', 10);

export async function seedData() {
  const ids=sample.authors.map(author=>author.author_id);
  await Author.deleteMany({role:'author',author_id:{$nin:ids}});
  for (const source of sample.authors) {
    const {author_id,name,email,phone,city,joined_date,books}=source;
    await Author.findOneAndUpdate({author_id}, {
      $set: {name,email,phone,city,joined_date,books,role:'author'},
      $setOnInsert: {passwordHash}
    }, {upsert:true,new:true,runValidators:true,setDefaultsOnInsert:true});
  }
  await Author.findOneAndUpdate({author_id:'OPS001'}, {
    $set: {name:'BookLeaf Operations',email:'admin@bookleaf.com',role:'admin'},
    $setOnInsert: {passwordHash}
  }, {upsert:true,setDefaultsOnInsert:true});

  // Remove only the three demonstration tickets created by the previous prototype.
  await Ticket.deleteMany({ticket_id:{$in:['TKT-8402','TKT-7821','TKT-8459']}});
  console.log(`JSON sync complete: ${sample.authors.length} authors, ${sample.authors.reduce((n,a)=>n+a.books.length,0)} books; tickets are created through the portal.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bookleaf_support');
  await seedData();
  await mongoose.disconnect();
}
