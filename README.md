# Personal OS — Backend API

> Fast, scalable backend service for Personal OS powered by Node.js, Express, Prisma ORM, and Neon Serverless PostgreSQL.

---

## 🚀 Overview

The Personal OS backend handles:
- **Authentication**: Email/password registration, password verification, Google Social Auth, and token session verification (`/api/auth/*`).
- **Database & Sync Engine**: Full multi-wallet balance calculations, transactions history, debts (Payables/Receivables), subscriptions, planned purchases, and daily agendas backed by **Neon PostgreSQL**.
- **Real-Time Financial Quotes**: Live ticker price fetching with on-demand daily caching.
- **Serverless & Edge Ready**: Configured for local Express server as well as Vercel Serverless deployment (`/api/index.ts`).

---

## 🛠️ Technology Stack

- **Runtime**: [Node.js](https://nodejs.org/) (ES Modules)
- **Framework**: [Express 5](https://expressjs.com/)
- **Database ORM**: [Prisma 6](https://www.prisma.io/)
- **Database**: [Neon Serverless PostgreSQL](https://neon.tech/)
- **Validation**: [Zod](https://zod.dev/)
- **Security**: [bcryptjs](https://github.com/dcodeIO/bcrypt.js)
- **Deployment**: Local Node or [Vercel](https://vercel.com/) Serverless (`api/index.ts`)

---

## 📁 Project Structure

```
backend/
├── api/                  # Vercel serverless function entrypoint
│   └── index.ts
├── prisma/               # Database schema & migrations
│   └── schema.prisma
├── src/
│   ├── routes/           # Express route controllers (auth, quotes, etc.)
│   │   ├── auth.ts
│   │   └── quotes.ts
│   ├── lib/              # Prisma client singleton & utilities
│   │   └── prisma.ts
│   ├── middleware/       # Request logging & error handling
│   └── index.ts          # Express app entrypoint
├── .env.example          # Environment variables template
├── tsconfig.json         # TypeScript configuration
├── vercel.json           # Vercel serverless routing
└── package.json
```

---

## 🏁 Getting Started

### 1. Prerequisites
- Node.js 18+
- Neon PostgreSQL database instance ([Create a free database on Neon](https://neon.tech))

### 2. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in your Neon connection strings:
```env
DATABASE_URL="postgresql://[user]:[password]@[endpoint]-pooler.[region].aws.neon.tech/neondb?sslmode=require"
DIRECT_URL="postgresql://[user]:[password]@[endpoint].[region].aws.neon.tech/neondb?sslmode=require"
PORT=4000
NODE_ENV=development
```

### 3. Install & Push Schema
```bash
# Install dependencies
npm install

# Generate Prisma Client
npx prisma generate

# Push Prisma schema to Neon Database
npx prisma db push
```

### 4. Run Development Server
```bash
npm run dev
```
The API will be live at `http://localhost:4000`.

---

## 📡 API Endpoints

### 🔐 Authentication (`/api/auth`)
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register a new user with email & password |
| `POST` | `/api/auth/login` | Log in with email & password |
| `POST` | `/api/auth/google` | Sign in / register with Google |
| `GET` | `/api/auth/me` | Verify active session token |

### 📈 Financial Quotes (`/api/quotes`)
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/quotes/:symbol` | Fetch ticker quote with DB caching |
| `POST` | `/api/quotes/batch` | Fetch multiple ticker quotes |

### 🩺 Health & Diagnostics
| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Server liveness check |

---

## ☁️ Deployment (Vercel)

The backend is configured out-of-the-box for Vercel Serverless deployment:
1. Connect this repository to **Vercel**.
2. Add your `DATABASE_URL` and `DIRECT_URL` in the **Vercel Environment Variables** settings.
3. Deploy! The serverless function entrypoint at [`api/index.ts`](api/index.ts) will handle all incoming requests.

---

## 📄 License
MIT
