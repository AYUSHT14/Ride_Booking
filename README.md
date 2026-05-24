# Ride Booking Server

A complete ride booking backend built with Node.js, Express, MongoDB, Socket.io, and JWT authentication.

## Live Demo

- **Railway deployment:** https://web-production-a457.up.railway.app

## Features

- User signup and login with JWT access/refresh tokens
- Ride creation and management
- Real-time socket notifications with Socket.io
- MongoDB Atlas database support
- Static frontend served from `public/`

## Project Structure

- `app.js` - main server entry
- `config/connect.js` - MongoDB connection helper
- `controllers/` - request handlers for auth, rides, and sockets
- `routes/` - Express routes for authentication and ride operations
- `models/` - Mongoose schemas for `User` and `Ride`
- `middleware/` - authentication and error handling
- `public/` - frontend files, static assets, and upload directory
- `railway.json` / `Procfile` - Railway deployment configuration

## Setup

1. Clone the repo:
   ```bash
   git clone https://github.com/AYUSHT14/Ride_Booking.git
   cd Ride_Booking
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file with the following values:
   ```env
   MONGO_URI=mongodb+srv://<username>:<password>@cluster0.z9xw0xc.mongodb.net/ride_db?retryWrites=true&w=majority
   PORT=3001
   ACCESS_TOKEN_SECRET=your_access_token_secret
   REFRESH_TOKEN_SECRET=your_refresh_token_secret
   ACCESS_TOKEN_EXPIRY=15m
   REFRESH_TOKEN_EXPIRY=7d
   ```

4. Run locally:
   ```bash
   npm start
   ```

## Deployment

This repo is configured for Railway deployment. The live app is currently available at:

- https://web-production-a457.up.railway.app

## Notes

- Do not commit your `.env` file or secrets to GitHub.
- Ensure your MongoDB Atlas user credentials are correct and that your Atlas network access allows Railway.
- The app uses `process.env.PORT`, so Railway will assign the correct port automatically.
