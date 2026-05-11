# Home Rental Backend API

This is the core API server for the Home Rental platform, providing data and services to both the Admin Dashboard and potential Mobile/Client applications.

## 🚀 Features

- **Authentication**: JWT-based secure login with role-based access control.
- **Property Logic**: API for property listing, status management, and categorization.
- **Financial Module**: 
  - Wallet management for suppliers.
  - Invoicing and billing automation.
  - Payout tracking.
- **Real-time Engine**: Socket.io integration with room-based notifications.
- **Database**: PostgreSQL with custom migration scripts.

## 🛠 Tech Stack

- **Server**: Node.js / Express
- **DB**: PostgreSQL
- **Real-time**: Socket.io
- **Auth**: JWT, Bcrypt
- **Validation**: express-validator

## 📁 Project Structure

- `/controllers`: Handles request logic and database queries.
- `/routes`: Defines API endpoints for auth, properties, bookings, etc.
- `/models`: Database interaction layer.
- `/middleware`: Authentication checks and error handling.
- `/migrations`: Database schema versioning.
- `/utils`: Helper functions and migration runners.

## ⚙️ Configuration

Create a `.env` file in the root directory (refer to `sample.env.md`):

```env
PORT=5000
DATABASE_URL=postgres://user:password@localhost:5432/dbname
JWT_SECRET=your_secret_key
FRONTEND_URL=http://localhost:3000
```

## 🏃 Running the Server

### Development
```bash
npm run dev
```

### Database Migrations
```bash
npm run migrate
```

## 📡 API Endpoints (Summary)

- `GET /api/health`: Server health check.
- `POST /api/auth/login`: User authentication.
- `GET /api/properties`: List rental properties.
- `GET /api/bookings`: Manage rental bookings.
- `GET /api/wallet`: Supplier wallet details.
```
