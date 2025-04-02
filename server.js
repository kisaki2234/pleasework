// to load the environment variables from the .env file
require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const winston = require('winston'); // For logging

const app = express();
const PORT = process.env.PORT || 3000; // Allows dynamic port assignment

// when Configuring winston for logging
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/server.log' })
    ]
});

// The middleware setups 
app.use(express.json()); // Parse JSON request bodies
app.use(cors()); // Enable cross-origin requests
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files from 'public' folder

// The openRouter.ai Chat API Route
app.post('/chat', async (req, res) => {
    const userMessage = req.body?.message;

    if (!userMessage) {
        return res.status(400).json({ reply: 'Message is required' });
    }

    if (!process.env.OPENROUTER_API_KEY) {
        return res.status(500).json({ reply: 'OpenRouter API key is missing in the .env file.' });
    }

    try {
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'deepseek/deepseek-r1:free',
                messages: [{ role: 'user', content: userMessage }],
            },
            {
                headers: { 
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        res.json({ reply: response.data.choices[0].message.content });
    } catch (error) {
        logger.error(`Error connecting to OpenRouter: ${error.response?.data || error.message}`);
        res.status(500).json({ reply: 'Error connecting to OpenRouter. Please try again later.' });
    }
});

// Web search API Route (i used serpAPI)
app.post('/search', async (req, res) => {
    const query = req.body?.query;

    if (!query) {
        return res.status(400).json({ results: [], error: 'Query is required' });
    }

    if (!process.env.SERPAPI_KEY) {
        return res.status(500).json({ error: 'SerpAPI key is missing in the .env file.' });
    }

    try {
        const response = await axios.get('https://serpapi.com/search', {
            params: {
                q: query,
                api_key: process.env.SERPAPI_KEY
            }
        });

        res.json({ results: response.data.organic_results });
    } catch (error) {
        logger.error(`Error performing web search: ${error.response?.data || error.message}`);
        res.status(500).json({ results: [], error: 'Error performing web search. Please try again later.' });
    }
});

// Serve the frontend index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Default route for unhandled paths
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found. Please use /chat or /search' });
});

// Basic error handler (for unhandled errors)
app.use((err, req, res, next) => {
    logger.error(`Unhandled error: ${err.message}`);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
});

// Finnally start the server🙂
app.listen(PORT, () => {
    logger.info(`Active Server running on http://localhost:${PORT}`);
});
