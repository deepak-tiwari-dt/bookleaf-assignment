# BookLeaf Author Support Portal

The repository contains two applications: a React/Vite client in `client/` and an Express API in `server/`. Netlify publishes the client and runs the API through a Function, while local development runs them as separate processes.

- `client/` — React and Vite author and operations portals.
- `server/` — Express REST API, MongoDB models, and sample data.

## Run locally

Requirements: Node.js 20+ and a local MongoDB instance or MongoDB Atlas URI.

```sh
npm install
npm --prefix client install
npm --prefix server install
cp server/.env.example server/.env
# Set MONGODB_URI and SESSION_SECRET in server/.env.
npm run seed
npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api` to Express at <http://localhost:5001>. Demo password: `demo123`; operations account: `admin@bookleaf.com`.

## Deploy on Netlify

Connect the repository to Netlify and use the repository root as the base directory. `netlify.toml` builds `client/`, publishes `client/dist`, routes `/api/*` to the Express Function, and sends other paths to the SPA. The Netlify Function entry point is `netlify/functions/api.js`.

Set these environment variables in the Netlify site settings:

- `MONGODB_URI` — MongoDB Atlas connection string. Do not use the localhost URI from `server/.env.example`.
- `SESSION_SECRET` — long random secret.
- `COOKIE_SECURE=true` and `SESSION_COOKIE_SAME_SITE=lax` for the same-origin site and API.
- `CORS_ORIGINS` — the exact deployed Netlify site origin, without a trailing slash.
- `OPENAI_API_KEY` — optional; enables AI classification and response drafts.
- `OPENAI_MODEL` — optional; defaults to `gpt-4o-mini`.

Seed the hosted database once from a machine that can reach Atlas:

```sh
MONGODB_URI="your-atlas-connection-string" DEMO_PASSWORD="demo123" npm run seed
```

Attachments are capped at 3 MB combined to leave room for Base64 encoding.

## Sample accounts

The supplied dataset in `server/data.json` seeds 10 authors and 18 books. Each author signs in with the email in that file. Operations account: `admin@bookleaf.com`. The default shared password is `demo123`; set `DEMO_PASSWORD` when seeding to use a different password.

## Project layout

- `client/src/` — React author dashboard, support center, operations console, and styles.
- `client/.env.example` — frontend API URL example.
- `netlify.toml` — client build, API function, and SPA routing configuration.
- `netlify/functions/api.js` — Express-to-function adapter.
- `server/app.js` — Express API application.
- `server/dev.js` — local API bootstrap.
- `server/models.js` — Mongoose schemas and indexes.
- `server/ticketRules.js` — AI classification and deterministic fallback.
- `server/knowledgeBase.js` — BookLeaf policy context for draft replies.
- `server/seed.js` and `server/data.json` — sample data import.

## API overview

All routes except login and the demo-account selector require a session. Authors can only read their own books and tickets. Admin-only routes are protected by role checks.

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | Public | Start a session |
| POST | `/api/auth/logout` | Signed in | End a session |
| GET | `/api/auth/me` | Signed in | Get the current account |
| GET | `/api/auth/demo-accounts` | Public | List seeded demo accounts |
| GET | `/api/books` | Author | List the author's books |
| GET | `/api/authors` | Admin | Browse authors and their books |
| GET | `/api/tickets` | Signed in | List tickets with filters |
| POST | `/api/tickets` | Author | Create a ticket and optional attachments |
| GET | `/api/tickets/:ticketId` | Signed in | Read a ticket and conversation |
| GET | `/api/tickets/:ticketId/attachments/:attachmentId` | Signed in | Download an authorized attachment |
| PATCH | `/api/tickets/:ticketId` | Admin | Update ticket status, category, priority, or assignee |
| POST | `/api/tickets/:ticketId/draft` | Admin | Generate a policy-grounded response draft |
| POST | `/api/tickets/:ticketId/reply` | Signed in | Add an author or admin response |
| POST | `/api/tickets/:ticketId/notes` | Admin | Add a private operations note |

## AI and uploads

Set `OPENAI_API_KEY` to enable server-side classification, priority scoring, and response drafting. `OPENAI_MODEL` defaults to `gpt-4o-mini`. Classification sends only the new ticket text; drafting sends the selected ticket, relevant book facts, and compact policy context. Without a key or when the provider fails, deterministic rules and grounded templates keep the workflow available.

Attachments are stored in MongoDB, checked by file signature, and downloadable only by the ticket's author or an admin. The form accepts up to 3 PDF, JPEG, PNG, or WebP files, 1.5 MB each and 3 MB combined. For production at larger scale, move files to private object storage and scan them before use.

## Known limitations

Demo authors share a password. There is no account registration or password recovery. Ticket updates use 15-second polling. Before production, add individual account onboarding, CSRF and rate controls, durable audit trails, attachment scanning, notifications, and monitoring.
