# ChaleBuddy Backend API

> Node.js + Express + MongoDB REST API for India's #1 Solo Travel Companion Platform.

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your MongoDB URI and email credentials

# 3. Seed the database with sample data
npm run seed

# 4. Start development server
npm run dev
```

Server runs at `http://localhost:5000`

## 📋 API Endpoints

| Method | Route | Description | Auth |
|--------|-------|-------------|------|
| GET | `/api/health` | Health check | — |
| POST | `/api/auth/register` | Register user | — |
| POST | `/api/auth/login` | Login | — |
| GET | `/api/auth/me` | Get profile | JWT |
| GET | `/api/guides` | List guides | — |
| GET | `/api/guides/featured` | Featured guides | — |
| GET | `/api/guides/:id` | Guide detail | — |
| POST | `/api/guides/:id/reviews` | Add review | JWT |
| GET | `/api/stays` | List stays | — |
| GET | `/api/stays/cities` | Available cities | — |
| GET | `/api/stays/featured` | Featured stays | — |
| GET | `/api/transport` | List transport | — |
| GET | `/api/transport/search` | Search routes | — |
| POST | `/api/bookings` | Create booking | Optional |
| GET | `/api/bookings/my` | My bookings | JWT |
| PATCH | `/api/bookings/:id/cancel` | Cancel | JWT |
| POST | `/api/contact` | Submit contact | — |
| POST | `/api/contact/newsletter/subscribe` | Subscribe | — |
| POST | `/api/trips` | Create trip | Optional |
| GET | `/api/trips` | List trips | — |
| POST | `/api/trips/:id/join` | Join request | Optional |
| POST | `/api/guide-applications` | Apply as guide | — |
| GET | `/api/admin/dashboard` | Admin stats | Admin JWT |

## 🔍 Query Parameters

All list endpoints support:
- `?page=1&limit=20` — Pagination
- `?sort=-rating` — Sort (prefix `-` for descending)
- `?search=varanasi` — Text search
- `?type=Heritage` — Filter by field
- `?rating[gte]=4.5` — Range filters

## 🔐 Authentication

Send JWT in header: `Authorization: Bearer <token>`

Admin credentials after seeding:
- Email: `admin@chalebuddy.in`
- Password: `Admin@123`

## 📁 Project Structure

```
chalebuddy-backend/
├── server.js              # Entry point
├── config/db.js           # MongoDB connection
├── models/                # Mongoose schemas
│   ├── User.js
│   ├── Guide.js
│   ├── Stay.js
│   ├── Transport.js
│   ├── Booking.js
│   ├── Contact.js
│   ├── GuideApplication.js
│   ├── Trip.js
│   └── Newsletter.js
├── controllers/           # Business logic
├── routes/                # Express routes
├── middleware/            # Auth, error handling, validation
├── utils/                 # Logger, email, API features
└── scripts/seed.js        # Database seeder
```
