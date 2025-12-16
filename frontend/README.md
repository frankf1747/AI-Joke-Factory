# Frontend

Simple web interface for the AI Joke Factory.

## Features

- Get random jokes from the backend
- View all available jokes
- Real-time backend status indicator
- Responsive design with gradient styling

## Running the Frontend

Simply open `index.html` in your web browser:

```bash
cd frontend
# On macOS
open index.html

# On Linux
xdg-open index.html

# On Windows
start index.html
```

Or use a simple HTTP server:

```bash
# Python 3
python3 -m http.server 8080

# Node.js (if you have http-server installed)
npx http-server -p 8080
```

Then navigate to `http://localhost:8080`

## Prerequisites

Make sure the backend server is running on `http://localhost:3000` before using the frontend.

## Files

- `index.html` - Main HTML structure
- `styles.css` - Styling and layout
- `app.js` - Frontend logic and API calls
