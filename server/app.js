import express from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { Author, Ticket } from './models.js';
import { categories, priorities, classifyTicket } from './ticketRules.js';
import { knowledgeBase } from './knowledgeBase.js';

const app = express();
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bookleaf_support';
app.disable('x-powered-by'); app.use(express.json({ limit: '6mb' }));
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
app.use(session({
  name: 'bookleaf.sid', secret: process.env.SESSION_SECRET || 'dev-only-change-this-session-secret',
  resave: false, saveUninitialized: false, store: MongoStore.create({ mongoUrl: mongoUri, collectionName: 'sessions' }),
  cookie: { httpOnly: true, sameSite: 'strict', secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production', maxAge: 8*60*60*1000 }
}));

const requireAuth = (req,res,next) => req.session.user ? next() : res.status(401).json({error:'Sign in required'});
const requireRole = role => (req,res,next) => req.session.user?.role===role ? next() : res.status(req.session.user?403:401).json({error:req.session.user?'This action is not allowed for your account':'Sign in required'});
const asyncRoute = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
let connectionPromise;
export function connectDatabase(){
  if(process.env.NODE_ENV==='production'&&!process.env.SESSION_SECRET)throw new Error('SESSION_SECRET is required in production');
  if(mongoose.connection.readyState===1)return Promise.resolve(mongoose.connection);
  if(!connectionPromise)connectionPromise=mongoose.connect(mongoUri).catch(error=>{connectionPromise=null;throw error;});
  return connectionPromise;
}
const publicTicket = (ticket, role) => {
  const t=ticket.toObject?ticket.toObject():ticket;
  if(role!=='admin')delete t.notes;
  t.attachments=(t.attachments||[]).map(({_id,name,mimeType,size})=>({_id,name,mimeType,size}));
  return t;
};
const allowedAttachmentTypes = new Set(['image/jpeg','image/png','image/webp','application/pdf']);
const maxAttachmentSize = 2 * 1024 * 1024;
const maxAttachments = 3;
const maxCombinedAttachmentSize = 4 * 1024 * 1024;
function validAttachmentContent(type,data){
  if(type==='image/jpeg')return data[0]===0xff&&data[1]===0xd8&&data[2]===0xff;
  if(type==='image/png')return data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if(type==='image/webp')return data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP';
  if(type==='application/pdf')return data.subarray(0,5).toString('ascii')==='%PDF-';
  return false;
}

app.post('/api/auth/login', asyncRoute(async(req,res)=>{
  const email=String(req.body.email||'').trim().toLowerCase(), password=String(req.body.password||'');
  const user=await Author.findOne({email});
  if(!user||!await bcrypt.compare(password,user.passwordHash))return res.status(401).json({error:'Email or password is incorrect'});
  req.session.user={id:user.author_id,name:user.name,email:user.email,role:user.role,city:user.city};
  res.json({user:req.session.user});
}));
app.post('/api/auth/logout', requireAuth, (req,res)=>req.session.destroy(()=>res.clearCookie('bookleaf.sid',{sameSite:'strict'}).json({ok:true})));
app.get('/api/auth/me', requireAuth, (req,res)=>res.json({user:req.session.user}));
app.get('/api/auth/demo-accounts', asyncRoute(async(_req,res)=>{
  const accounts=await Author.find({},'author_id name email role').sort({role:1,name:1}).lean();
  res.json({accounts:accounts.map(({author_id,name,email,role})=>({id:author_id,name,email,role}))});
}));

app.get('/api/authors', requireRole('admin'), asyncRoute(async(_req,res)=>{
  const authors=await Author.find({role:'author'}).select('author_id name email city joined_date books').sort({name:1}).lean();
  res.json({authors});
}));

app.get('/api/books', requireAuth, asyncRoute(async(req,res)=>{
  const authorId=req.session.user.role==='admin'?String(req.query.authorId||''):req.session.user.id;
  if(!authorId)return res.status(422).json({error:'authorId is required for admin catalog lookup'});
  const author=await Author.findOne({author_id:authorId}).select('author_id name city joined_date books');
  if(!author)return res.status(404).json({error:'Author not found'});
  res.json({author:{author_id:author.author_id,name:author.name,city:author.city,joined_date:author.joined_date},books:author.books});
}));

app.get('/api/tickets', requireAuth, asyncRoute(async(req,res)=>{
  const filter=req.session.user.role==='admin'?{}:{author_id:req.session.user.id};
  const {status,category,priority,from,to,q}=req.query;
  if(status&&status!=='all')filter.status=status;if(category)filter.category=category;if(priority)filter.priority=priority;
  if(from||to){filter.createdAt={};if(from)filter.createdAt.$gte=new Date(`${from}T00:00:00`);if(to)filter.createdAt.$lte=new Date(`${to}T23:59:59.999`);}
  if(q){const escaped=String(q).slice(0,100).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const ids=(await Author.find({'books.isbn':{$regex:escaped,$options:'i'}},{author_id:1,'books.book_id':1,'books.isbn':1,'books.title':1})).flatMap(a=>a.books.filter(b=>new RegExp(escaped,'i').test(b.isbn||'')||new RegExp(escaped,'i').test(b.title||'')).map(b=>({author_id:a.author_id,book_id:b.book_id})));filter.$or=[{ticket_id:{$regex:escaped,$options:'i'}},{subject:{$regex:escaped,$options:'i'}},{author_name:{$regex:escaped,$options:'i'}},{description:{$regex:escaped,$options:'i'}},...ids.map(x=>({author_id:x.author_id,book_id:x.book_id}))];}
  const tickets=await Ticket.find(filter).sort({priority_score:-1,createdAt:1});res.json({tickets:tickets.map(t=>publicTicket(t,req.session.user.role))});
}));

app.post('/api/tickets', requireRole('author'), asyncRoute(async(req,res)=>{
  const subject=String(req.body.subject||'').trim(),description=String(req.body.description||'').trim(),bookId=String(req.body.bookId||'GENERAL');
  if(subject.length<4||subject.length>140||description.length<10||description.length>1200)return res.status(422).json({error:'Subject must be 4–140 characters and message 10–1,200 characters'});
  if(req.body.attachments!==undefined&&!Array.isArray(req.body.attachments))return res.status(422).json({error:'Attachments must be provided as a file list'});
  const suppliedAttachments=req.body.attachments||[];
  if(suppliedAttachments.length>maxAttachments)return res.status(422).json({error:`Attach up to ${maxAttachments} files`});
  let attachmentTotal=0;
  const attachments=[];
  for(const file of suppliedAttachments){
    const name=String(file?.name||'').trim().replace(/[\\/\0-\x1f]/g,'_').slice(0,180);
    const mimeType=String(file?.mimeType||'').toLowerCase();
    const encoded=String(file?.data||'').replace(/^data:[^,]*;base64,/,'');
    if(!name||!allowedAttachmentTypes.has(mimeType)||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))return res.status(422).json({error:'Attachments must be PDF, JPEG, PNG, or WebP files'});
    const data=Buffer.from(encoded,'base64');
    if(!data.length||data.length>maxAttachmentSize||data.toString('base64').replace(/=+$/,'')!==encoded.replace(/=+$/,'')||!validAttachmentContent(mimeType,data))return res.status(422).json({error:'Each attachment must be a valid PDF, JPEG, PNG, or WebP file up to 2 MB'});
    attachmentTotal+=data.length;
    if(attachmentTotal>maxCombinedAttachmentSize)return res.status(422).json({error:'Combined attachments must be 4 MB or smaller'});
    attachments.push({name,mimeType,size:data.length,data});
  }
  const author=await Author.findOne({author_id:req.session.user.id});
  if(bookId!=='GENERAL'&&!author.books.some(book=>book.book_id===bookId))return res.status(422).json({error:'Choose a title associated with your account'});
  const rules=await classifyTicket({subject,description}), ticketId=`TKT-${Date.now().toString().slice(-6)}${Math.floor(Math.random()*10)}`;
  const ticket=await Ticket.create({ticket_id:ticketId,author_id:author.author_id,author_name:author.name,book_id:bookId,subject,description,status:'open',...rules,messages:[{by:'author',name:author.name,text:description}],notes:[],attachments});
  res.status(201).json({ticket:publicTicket(ticket,'author')});
}));

async function draftReply(ticket){
  const author=await Author.findOne({author_id:ticket.author_id});const book=author?.books.find(b=>b.book_id===ticket.book_id);
  if(process.env.OPENAI_API_KEY){try{const response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',signal:AbortSignal.timeout(15000),headers:{authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4o-mini',max_tokens:400,temperature:.2,messages:[{role:'system',content:`You are a BookLeaf Publishing author-support representative. Draft a concise, empathetic and professional response that acknowledges the concern, gives specific verified facts, owns BookLeaf errors, and states a clear next step and timeline. Use only the policy below and supplied ticket/account facts. Do not invent amounts, dates, bank details, production status or actions. If a needed fact is missing, say the team will verify it and follow up within 48 hours.\n\n${knowledgeBase}`},{role:'user',content:JSON.stringify({author:{name:author?.name,city:author?.city},book:book?{title:book.title,isbn:book.isbn,status:book.status,royalty_pending:book.royalty_pending,total_royalty_earned:book.total_royalty_earned,royalty_paid:book.royalty_paid,last_royalty_payout_date:book.last_royalty_payout_date,print_partner:book.print_partner,available_on:book.available_on}:null,ticket:{category:ticket.category,priority:ticket.priority,subject:ticket.subject,query:ticket.description}})}]})});if(!response.ok)throw new Error(`provider status ${response.status}`);const json=await response.json();const content=json.choices?.[0]?.message?.content;if(content)return {draft:content,source:'ai'};}catch(err){console.error('AI provider unavailable; using policy fallback:',err.message);}}
  const name=author?.name||ticket.author_name;const templates={royalty:`Hi ${name},\n\nI understand the concern about your royalty payment, and I’m sorry for the uncertainty. BookLeaf reconciles royalties quarterly and pays within 45 days of quarter end, once the ₹1,000 minimum is reached. Our team is checking the ledger and bank transfer status for this ticket. We’ll update you with the verified amount and next step within 48 hours.\n\nWarm regards,\nBookLeaf Author Support`,printing:`Hi ${name},\n\nI’m sorry the copies arrived with a print quality issue. Please share clear photos of the affected pages and cover, plus the number of copies affected. Once verified, BookLeaf will arrange a free reprint; standard print turnaround is 5–7 business days.\n\nWarm regards,\nBookLeaf Author Support`,distribution:`Hi ${name},\n\nThanks for flagging the listing issue. We’ve routed it to our distribution team to check the listing and trigger a re-sync if needed. This usually takes 24–48 hours.\n\nWarm regards,\nBookLeaf Author Support`,metadata:`Hi ${name},\n\nThank you for reporting this ISBN or metadata issue. We’ve escalated it to production for verification and will update you within 48 hours with the correction plan.\n\nWarm regards,\nBookLeaf Author Support`,production:`Hi ${name},\n\nThanks for checking in. We’re checking the current production stage and any pending approvals, and will send you a specific timeline within 48 hours.\n\nWarm regards,\nBookLeaf Author Support`};
  return {draft:templates[ticket.category]||`Hi ${name},\n\nThank you for getting in touch. We’re reviewing the details so we can give you an accurate answer. Our team will follow up with the next step within 48 hours.\n\nWarm regards,\nBookLeaf Author Support`,source:'fallback'};
}

app.get('/api/tickets/:id', requireAuth, asyncRoute(async(req,res)=>{
  const ticket=await Ticket.findOne({ticket_id:req.params.id});if(!ticket)return res.status(404).json({error:'Ticket not found'});
  if(req.session.user.role==='author'&&ticket.author_id!==req.session.user.id)return res.status(404).json({error:'Ticket not found'});
  res.json({ticket:publicTicket(ticket,req.session.user.role)});
}));
app.get('/api/tickets/:id/attachments/:attachmentId', requireAuth, asyncRoute(async(req,res)=>{
  const ticket=await Ticket.findOne({ticket_id:req.params.id});
  if(!ticket|| (req.session.user.role==='author'&&ticket.author_id!==req.session.user.id))return res.status(404).json({error:'Attachment not found'});
  const attachment=ticket.attachments.id(req.params.attachmentId);
  if(!attachment)return res.status(404).json({error:'Attachment not found'});
  const safeName=attachment.name.replace(/[^A-Za-z0-9._ -]/g,'_').replace(/["\\]/g,'_');
  const encodedName=encodeURIComponent(attachment.name).replace(/[!'()*]/g,char=>`%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  res.set({'Content-Type':attachment.mimeType,'Content-Length':String(attachment.size),'Content-Disposition':`attachment; filename="${safeName}"; filename*=UTF-8''${encodedName}`,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'});
  res.send(attachment.data);
}));
app.patch('/api/tickets/:id', requireRole('admin'), asyncRoute(async(req,res)=>{
  const update={};if(req.body.status!==undefined){if(!['open','in_progress','resolved','closed'].includes(req.body.status))return res.status(422).json({error:'Invalid ticket status'});update.status=req.body.status;}
  if(req.body.category!==undefined){if(!categories[req.body.category])return res.status(422).json({error:'Invalid ticket category'});update.category=req.body.category;update.category_label=categories[req.body.category];}
  if(req.body.priority!==undefined){if(!priorities.includes(req.body.priority))return res.status(422).json({error:'Invalid priority'});update.priority=req.body.priority;update.priority_score=priorities.indexOf(req.body.priority)+1;}
  if(req.body.category!==undefined||req.body.priority!==undefined){update.classification_source='admin';update.classification_confidence=null;}
  if(req.body.assignee!==undefined)update.assignee=String(req.body.assignee).slice(0,80)||null;
  const ticket=await Ticket.findOneAndUpdate({ticket_id:req.params.id},{$set:update},{new:true,runValidators:true});if(!ticket)return res.status(404).json({error:'Ticket not found'});res.json({ticket:publicTicket(ticket,'admin')});
}));
app.post('/api/tickets/:id/draft', requireRole('admin'), asyncRoute(async(req,res)=>{const ticket=await Ticket.findOne({ticket_id:req.params.id});if(!ticket)return res.status(404).json({error:'Ticket not found'});res.json(await draftReply(ticket));}));
app.post('/api/tickets/:id/reply', requireAuth, asyncRoute(async(req,res)=>{
  const text=String(req.body.message||'').trim();if(text.length<2||text.length>4000)return res.status(422).json({error:'Reply must be 2–4,000 characters'});
  const filter={ticket_id:req.params.id};if(req.session.user.role==='author')filter.author_id=req.session.user.id;
  const ticket=await Ticket.findOne(filter);if(!ticket)return res.status(404).json({error:'Ticket not found'});
  if(req.session.user.role==='author'&&['resolved','closed'].includes(ticket.status))return res.status(409).json({error:'This ticket is resolved; create a new ticket for a follow-up.'});
  ticket.messages.push({by:req.session.user.role,name:req.session.user.name,text});if(req.session.user.role==='admin')ticket.status='in_progress';await ticket.save();res.status(201).json({ticket:publicTicket(ticket,req.session.user.role)});
}));
app.post('/api/tickets/:id/notes', requireRole('admin'), asyncRoute(async(req,res)=>{
  const note=String(req.body.note||'').trim();if(note.length<2||note.length>2000)return res.status(422).json({error:'Note must be 2–2,000 characters'});
  const ticket=await Ticket.findOne({ticket_id:req.params.id});if(!ticket)return res.status(404).json({error:'Ticket not found'});ticket.notes.push({by:req.session.user.name,text:note});await ticket.save();res.status(201).json({ok:true});
}));

app.use('/api',(_req,res)=>res.status(404).json({error:'API endpoint not found'}));
app.use((err,_req,res,_next)=>{console.error(err);if(err.type==='entity.too.large')return res.status(413).json({error:'Request is too large; reduce attachment size and try again'});if(err instanceof mongoose.Error.ValidationError)return res.status(422).json({error:'Ticket data did not pass validation'});res.status(500).json({error:'Unexpected server error'});});

export default app;
