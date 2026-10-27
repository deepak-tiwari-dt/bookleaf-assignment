# BookLeaf Support Portal (MERN)

React author and operations portals backed by an Express REST API and MongoDB.

## Requirements and local setup

- Node.js 18+
- MongoDB Community Server running locally or a MongoDB Atlas URI

```sh
npm install
cp .env.example .env
# Set MONGODB_URI and SESSION_SECRET in .env if needed.
npm run seed
npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api` to Express at `http://localhost:5001`. In production, `npm run build` creates the React bundle in `dist`; set `NODE_ENV=production` and run `npm start` to serve that bundle and the API from port 5001.

The Express API fails to start until MongoDB is available. Set `MONGODB_URI` to a local or Atlas connection string. `.env` is ignored by git.

## Run with Docker

With Docker Compose installed, run `docker compose up --build`. The app is served at <http://localhost:5001> and MongoDB data is stored in a named volume. The Compose defaults are for local evaluation only; set `SESSION_SECRET`, `DEMO_PASSWORD`, and `OPENAI_API_KEY` in the environment for your deployment. Use `COOKIE_SECURE=true` behind HTTPS.

## Demo accounts

All sample authors can sign in using the email recorded in `data.json` and password `demo123`. The operations account is `admin@bookleaf.com` / `demo123`. Startup and `npm run seed` synchronize authors and books from the JSON, add the operations account, and preserve ticket data. Tickets start empty and are created through the author portal. Set `DEMO_PASSWORD` before the first seed to use a different shared demo password.

## Project layout

- `src/` - React SPA, author dashboard, ticket center, operations console, and styles.
- `server/app.js` - Express app, MongoDB connection helper, session middleware, and REST routes.
- `server/index.js` - local Express bootstrap and sample-data seed.
- `netlify/functions/api.js` - Netlify Functions entry point for the Express API.
- `server/models.js` - Mongoose author/book and ticket/message/note schemas and indexes.
- `server/ticketRules.js` - AI classification/priority scoring with deterministic fallback.
- `server/knowledgeBase.js` - compact policy context for reply drafting.
- `server/seed.js` - imports the supplied sample dataset and seeds demo users/tickets.
- `data.json` - supplied sample records, read by the server seed only (not served by Express).

Sessions are stored in MongoDB using `connect-mongo`; cookies are HTTP-only and SameSite Strict. Author routes scope books and tickets to the logged-in author's ID. Operations-only status/category/priority changes, assignment, drafts, and private notes are protected by role middleware. Ticket lists sort by priority then age and refresh in the client every 15 seconds.

Ticket attachments are stored as binary data on the ticket in MongoDB and can only be downloaded by its author or an admin. The form accepts up to 3 PDF, JPEG, PNG, or WebP files, 2 MB each and 4 MB combined. The API checks file signatures, not only browser-supplied MIME types. For production at larger scale, move file bytes to private object storage and retain only metadata in MongoDB.

## REST API

All routes except `POST /api/auth/login` require a session. JSON errors include a useful message. Invalid fields return `422`, unauthorized roles return `403`, and missing/foreign tickets return `404`.

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | Public | Start session with `{email,password}` |
| POST | `/api/auth/logout` | Signed in | Destroy session |
| GET | `/api/auth/me` | Signed in | Current identity and role |
| GET | `/api/auth/demo-accounts` | Public demo selector | Names and emails for the JSON-seeded sample accounts |
| GET | `/api/authors` | Admin | Complete author and book directory from MongoDB |
| GET | `/api/books` | Author | Own book catalog; admin may pass `?authorId=AUTH001` |
| GET | `/api/tickets` | Signed in | Author's tickets or admin queue; filters: `status`, `category`, `priority`, `from`, `to`, `q` |
| POST | `/api/tickets` | Author | Create ticket with `bookId`, `subject`, `description`; category and priority use AI when configured, otherwise rules fallback |
| GET | `/api/tickets/:ticketId` | Signed in | Ticket and messages, scoped to owner for authors |
| GET | `/api/tickets/:ticketId/attachments/:attachmentId` | Signed in | Download attachment when the requester owns its ticket or is an admin |
| PATCH | `/api/tickets/:ticketId` | Admin | Change `status`, `category`, `priority`, `assignee` |
| POST | `/api/tickets/:ticketId/draft` | Admin | Generate a policy-grounded reply draft |
| POST | `/api/tickets/:ticketId/reply` | Signed in | Add an author message or send an admin reply |
| POST | `/api/tickets/:ticketId/notes` | Admin | Add a private operations note |

## AI classification and reply drafting

Set `OPENAI_API_KEY` to enable server-side OpenAI Chat Completions for category/priority classification and admin reply drafts; `OPENAI_MODEL` defaults to `gpt-4o-mini`. Classification asks for a constrained category, priority, and confidence and validates the result. The API sends only the new ticket text for classification, and only the selected ticket, relevant book ledger fields, and concise BookLeaf policy context for a draft. API keys remain on the server. Missing credentials, timeouts, provider errors, or invalid results fall back to deterministic ticket rules and category-specific grounded draft templates; admins can always edit and send a manual response. See `APPROACH.md` for the model and cost strategy.

## Deployment

`Dockerfile` builds the React bundle and runs the Express/MongoDB application in one container. `docker-compose.yml` includes a MongoDB service for local deployment. For a public demo, deploy the container and a managed MongoDB database with a persistent connection URI, HTTPS, a long random `SESSION_SECRET`, and optional server-side `OPENAI_API_KEY`. The app does not include a hosting provider account or publish itself; configure these values in your chosen host before sharing a live URL.

### Deploy to Netlify

`netlify.toml` builds the Vite app to `dist`, deploys the Express API as a Netlify Function, rewrites `/api/*` to that function, and falls back to `index.html` for SPA routes. Connect the repository to Netlify and deploy from the project root. Set these in **Project configuration → Environment variables** with Functions scope: `MONGODB_URI` (Atlas connection string), `SESSION_SECRET` (long random value), and `COOKIE_SECURE=true`. Optionally set `OPENAI_API_KEY` and `OPENAI_MODEL`. Do not put secrets in `netlify.toml`; Netlify configuration-file variables are not exposed to Functions at runtime.

Seed the Netlify database once from a trusted machine with network access to MongoDB Atlas:

```sh
MONGODB_URI="your-atlas-connection-string" DEMO_PASSWORD="demo123" npm run seed
```

The Function does not seed on each cold start. Confirm Atlas network access allows Netlify Function connections. Netlify Functions have a 6 MB buffered request/response limit, so the upload limit is 4 MB combined to leave room for Base64 encoding overhead.

## Known limitations

This is an evaluation prototype. Demo authors share one password; there is no password recovery or account registration. Ticket updates use polling rather than WebSockets/SSE. For production, use individual password lifecycle, request throttling/CSRF protections appropriate to deployment, audit events, attachment malware scanning and private object storage, delivery notifications, and monitoring. Deploy behind HTTPS with managed MongoDB and secrets to create an external demo URL.
