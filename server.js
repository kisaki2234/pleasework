// Load environment variables from the .env file
require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const winston = require('winston'); // For logging

const app = express();
const PORT = process.env.PORT || 3000; // Allows dynamic port assignment

// Ensure logs directory exists
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

// Configure Winston for logging
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level}]: ${message}`)
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: path.join(logsDir, 'server.log') })
    ]
});

// Log the current date for debugging purposes
logger.info(`Server started on: ${new Date().toLocaleString()}`);

// Middleware setup
app.use(express.json()); // Parse JSON request bodies
app.use(cors()); // Enable cross-origin requests
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files from 'public' folder

// Ensure public/index.html exists
const indexPath = path.join(__dirname, 'public', 'index.html');
if (!fs.existsSync(indexPath)) {
    logger.warn("⚠️ Warning: 'public/index.html' not found. Ensure your frontend files are placed correctly.");
}

// OpenRouter.ai Chat API Route
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

        // Validate response
        if (!response.data || !response.data.choices || response.data.choices.length === 0) {
            throw new Error('Invalid response from OpenRouter API');
        }

        res.json({ reply: response.data.choices[0].message.content });
    } catch (error) {
        logger.error(`Error connecting to OpenRouter: ${error.response?.data || error.message}`);
        res.status(500).json({ reply: 'Error connecting to OpenRouter. Please try again later.' });
    }
});

// Web search API Route (SerpAPI)
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
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(500).json({ error: "Frontend is missing. Please ensure 'public/index.html' is uploaded." });
    }
});

// Error handling middleware (for unhandled errors)
app.use((err, req, res, next) => {
    logger.error(`Unhandled error: ${err.message}`);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
});

// Default route for unhandled paths
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found. Please use /chat or /search' });
});

// Start the server
app.listen(PORT, () => {
    logger.info(`✅ Server running on http://localhost:${PORT}`);
});
