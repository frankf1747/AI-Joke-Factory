# Backend

Simple Node.js HTTP server that provides joke API endpoints.

## Features

- **GET /api/joke** - Returns a random joke
- **GET /api/jokes** - Returns all available jokes
- **GET /health** - Health check endpoint

## Running the Server

```bash
cd backend
node server.js
```

The server will start on `http://localhost:3000`

## API Response Format

```json
{
  "id": 1,
  "setup": "Why don't scientists trust atoms?",
  "punchline": "Because they make up everything!"
}
```

## No Dependencies

This demo uses only Node.js built-in `http` module - no external dependencies required!
