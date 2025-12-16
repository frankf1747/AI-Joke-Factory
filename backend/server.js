const http = require('http');

const PORT = 3000;
// CORS: Allow requests from the frontend (which runs on port 8080)
// For production, set ALLOWED_ORIGIN env var to your frontend's actual URL
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:8080';

// Sample jokes database
const jokes = [
  { id: 1, setup: "Why don't scientists trust atoms?", punchline: "Because they make up everything!" },
  { id: 2, setup: "What do you call a fake noodle?", punchline: "An impasta!" },
  { id: 3, setup: "Why did the scarecrow win an award?", punchline: "He was outstanding in his field!" },
  { id: 4, setup: "What do you call a bear with no teeth?", punchline: "A gummy bear!" },
  { id: 5, setup: "Why don't eggs tell jokes?", punchline: "They'd crack each other up!" }
];

const server = http.createServer((req, res) => {
  // Enable CORS for frontend access (restricted to specific origin for security)
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Route: Get a random joke
  if (req.url === '/api/joke' && req.method === 'GET') {
    const randomJoke = jokes[Math.floor(Math.random() * jokes.length)];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(randomJoke));
  }
  // Route: Get all jokes
  else if (req.url === '/api/jokes' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(jokes));
  }
  // Route: Health check
  else if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', message: 'AI Joke Factory is running!' }));
  }
  // 404 Not Found
  else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  }
});

server.listen(PORT, () => {
  console.log(`🎭 AI Joke Factory Backend running on http://localhost:${PORT}`);
  console.log(`Available endpoints:`);
  console.log(`  GET /api/joke  - Get a random joke`);
  console.log(`  GET /api/jokes - Get all jokes`);
  console.log(`  GET /health    - Health check`);
});
