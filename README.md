# AI-Joke-Factory
Web-based simulation for Operation Management class

## Project Structure

```
ai-joke-factory/
├── frontend/       # Web UI for the joke factory
├── backend/        # Node.js API server
├── shared/         # Shared utilities and types
└── README.md
```

## Quick Start Demo

This repository includes a simple demonstration of frontend-backend integration.

### 1. Start the Backend Server

```bash
cd backend
node server.js
```

The backend will run on `http://localhost:3000`

### 2. Open the Frontend

Open `frontend/index.html` in your web browser, or run a local server:

```bash
cd frontend
python3 -m http.server 8080
```

Then navigate to `http://localhost:8080`

### 3. Try It Out!

- Click "Get a Random Joke" to fetch a joke from the backend
- Click "Show All Jokes" to see all available jokes
- The status indicator shows if the backend is online

## Features

- 🎭 Random joke generation
- 📝 Browse all jokes
- 🔄 Real-time backend health check
- 🎨 Modern, responsive UI
- 🚀 Zero dependencies (uses built-in Node.js modules)

## About

This is a demonstration project showing how frontend and backend components work together in a web application.
