// Backend API URL
const API_URL = 'http://localhost:3000';

// DOM Elements
const getJokeBtn = document.getElementById('getJokeBtn');
const getAllJokesBtn = document.getElementById('getAllJokesBtn');
const jokeDisplay = document.getElementById('jokeDisplay');
const allJokesContainer = document.getElementById('allJokesContainer');
const backendStatus = document.getElementById('backendStatus');

// Check backend health on load
checkBackendHealth();

// Event Listeners
getJokeBtn.addEventListener('click', getRandomJoke);
getAllJokesBtn.addEventListener('click', getAllJokes);

// Check if backend is running
async function checkBackendHealth() {
    try {
        const response = await fetch(`${API_URL}/health`);
        const data = await response.json();
        
        if (data.status === 'ok') {
            backendStatus.textContent = 'Online ✓';
            backendStatus.className = 'online';
        }
    } catch (error) {
        backendStatus.textContent = 'Offline ✗';
        backendStatus.className = 'offline';
        console.error('Backend is not running:', error);
    }
}

// Get a random joke from the backend
async function getRandomJoke() {
    try {
        getJokeBtn.disabled = true;
        getJokeBtn.textContent = 'Loading...';
        
        const response = await fetch(`${API_URL}/api/joke`);
        
        if (!response.ok) {
            throw new Error('Failed to fetch joke');
        }
        
        const joke = await response.json();
        displayJoke(joke);
        
        // Hide all jokes if visible
        allJokesContainer.classList.add('hidden');
        
    } catch (error) {
        jokeDisplay.innerHTML = `
            <p class="setup" style="color: #dc3545;">
                ⚠️ Error: Could not connect to backend. 
                Make sure the server is running on port 3000.
            </p>
        `;
        console.error('Error fetching joke:', error);
    } finally {
        getJokeBtn.disabled = false;
        getJokeBtn.textContent = 'Get a Random Joke';
    }
}

// Display a single joke
function displayJoke(joke) {
    jokeDisplay.innerHTML = `
        <p class="setup">${joke.setup}</p>
        <p class="punchline">${joke.punchline}</p>
    `;
}

// Get all jokes from the backend
async function getAllJokes() {
    try {
        getAllJokesBtn.disabled = true;
        getAllJokesBtn.textContent = 'Loading...';
        
        const response = await fetch(`${API_URL}/api/jokes`);
        
        if (!response.ok) {
            throw new Error('Failed to fetch jokes');
        }
        
        const jokes = await response.json();
        displayAllJokes(jokes);
        
    } catch (error) {
        allJokesContainer.innerHTML = `
            <p style="color: #dc3545; text-align: center;">
                ⚠️ Error: Could not connect to backend.
            </p>
        `;
        allJokesContainer.classList.remove('hidden');
        console.error('Error fetching jokes:', error);
    } finally {
        getAllJokesBtn.disabled = false;
        getAllJokesBtn.textContent = 'Show All Jokes';
    }
}

// Display all jokes
function displayAllJokes(jokes) {
    allJokesContainer.innerHTML = '<h2 style="text-align: center; margin-bottom: 20px; color: #333;">All Jokes</h2>';
    
    jokes.forEach(joke => {
        const jokeCard = document.createElement('div');
        jokeCard.className = 'joke-card';
        jokeCard.innerHTML = `
            <p class="setup">${joke.setup}</p>
            <p class="punchline">${joke.punchline}</p>
        `;
        allJokesContainer.appendChild(jokeCard);
    });
    
    allJokesContainer.classList.remove('hidden');
}
