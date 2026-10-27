import mongoose from 'mongoose';

const bookSchema = new mongoose.Schema({
  book_id: { type: String, required: true }, title: { type: String, required: true },
  isbn: String, genre: String, publication_date: Date, status: String, mrp: Number,
  author_royalty_per_copy: Number, total_copies_sold: { type: Number, default: 0 },
  total_royalty_earned: { type: Number, default: 0 }, royalty_paid: { type: Number, default: 0 },
  royalty_pending: { type: Number, default: 0 }, last_royalty_payout_date: Date,
  print_partner: String, available_on: [String]
}, { _id: false });

const authorSchema = new mongoose.Schema({
  author_id: { type: String, unique: true, required: true }, name: { type: String, required: true },
  email: { type: String, unique: true, required: true, lowercase: true }, passwordHash: { type: String, required: true },
  phone: String, city: String, joined_date: Date, role: { type: String, enum: ['author','admin'], default: 'author' }, books: [bookSchema]
}, { timestamps: true });

const messageSchema = new mongoose.Schema({
  by: { type: String, enum: ['author','admin'], required: true }, name: { type: String, required: true },
  text: { type: String, required: true, maxlength: 4000 }, at: { type: Date, default: Date.now }
}, { _id: false });
const noteSchema = new mongoose.Schema({ by: String, text: { type: String, maxlength: 2000 }, at: { type: Date, default: Date.now } }, { _id: false });
const attachmentSchema = new mongoose.Schema({
  name: { type: String, required: true, maxlength: 180 },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  data: { type: Buffer, required: true }
});
const ticketSchema = new mongoose.Schema({
  ticket_id: { type: String, unique: true, required: true }, author_id: { type: String, index: true, required: true },
  author_name: String, book_id: String, subject: { type: String, required: true, maxlength: 140 },
  description: { type: String, required: true, maxlength: 1200 },
  status: { type: String, enum: ['open','in_progress','resolved','closed'], default: 'open', index: true },
  category: { type: String, enum: ['royalty','metadata','printing','distribution','production','general'], required: true, index: true },
  category_label: String, priority: { type: String, enum: ['Low','Medium','High','Critical'], required: true, index: true },
  priority_score: Number, classification_source: {type:String,enum:['ai','rules','admin'],default:'rules'}, classification_confidence:Number,
  createdAt: { type: Date, default: Date.now, index: true }, assignee: String,
  messages: [messageSchema], notes: [noteSchema], attachments: [attachmentSchema]
}, { versionKey: false });
ticketSchema.index({ status: 1, priority_score: -1, createdAt: 1 });

export const Author = mongoose.model('Author', authorSchema);
export const Ticket = mongoose.model('Ticket', ticketSchema);
