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
        jokeDisplay.innerHTML = '';
        const errorP = document.createElement('p');
        errorP.className = 'setup';
        errorP.style.color = '#dc3545';
        errorP.textContent = '⚠️ Error: Could not connect to backend. Make sure the server is running on port 3000.';
        jokeDisplay.appendChild(errorP);
        console.error('Error fetching joke:', error);
    } finally {
        getJokeBtn.disabled = false;
        getJokeBtn.textContent = 'Get a Random Joke';
    }
}

// Display a single joke
function displayJoke(joke) {
    // Clear existing content
    jokeDisplay.innerHTML = '';
    
    // Create elements safely to prevent XSS
    const setupP = document.createElement('p');
    setupP.className = 'setup';
    setupP.textContent = joke.setup;
    
    const punchlineP = document.createElement('p');
    punchlineP.className = 'punchline';
    punchlineP.textContent = joke.punchline;
    
    jokeDisplay.appendChild(setupP);
    jokeDisplay.appendChild(punchlineP);
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
    // Clear and add title
    allJokesContainer.innerHTML = '';
    const title = document.createElement('h2');
    title.style.textAlign = 'center';
    title.style.marginBottom = '20px';
    title.style.color = '#333';
    title.textContent = 'All Jokes';
    allJokesContainer.appendChild(title);
    
    // Create joke cards safely
    jokes.forEach(joke => {
        const jokeCard = document.createElement('div');
        jokeCard.className = 'joke-card';
        
        const setupP = document.createElement('p');
        setupP.className = 'setup';
        setupP.textContent = joke.setup;
        
        const punchlineP = document.createElement('p');
        punchlineP.className = 'punchline';
        punchlineP.textContent = joke.punchline;
        
        jokeCard.appendChild(setupP);
        jokeCard.appendChild(punchlineP);
        allJokesContainer.appendChild(jokeCard);
    });
    
    allJokesContainer.classList.remove('hidden');
}
