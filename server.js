// Load environment variables from the .env file
require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const winston = require('winston');

const app = express();
const PORT = process.env.PORT || 3000;

// Enhanced CORS configuration
const allowedOrigins = [
    'https://chatbot-cwg0.onrender.com', // REPLACE WITH YOUR ACTUAL RENDER URL
    'http://localhost:3000'
];

app.use(cors({
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
//rate limiting
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // Limit each IP to 100 requests per windowMs
});
app.use('/chat', limiter);
// Https enforcement
app.enable('trust proxy');
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && !req.secure) {
    return res.redirect(`https://${req.headers.host}${req.url}`);
  }
  next();
});
// Logging configuration
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level}]: ${message}`)
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: path.join(logsDir, 'server.log') })
    ]
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Handle client-side routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'ok',
        timestamp: new Date().toISOString()
    });
});

// OpenRouter endpoint with required headers
app.post('/chat', async (req, res) => {
    try {
        const userMessage = req.body?.message;
        if (!userMessage) return res.status(400).json({ error: 'Message required' });

        if (!process.env.OPENROUTER_API_KEY) {
            logger.error('OpenRouter API key missing');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'deepseek/deepseek-r1:free',
                messages: [{ role: 'user', content: userMessage }],
                temperature: 0.7,
            },
            {
                headers: { 
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://chatbot-cwg0.onrender.com', //
                    'X-Title': 'Quest Support Chatbot'
                },
                timeout: 10000
            }
        );

        if (!response?.data?.choices?.[0]?.message?.content) {
            throw new Error('Invalid OpenRouter response structure');
        }

        res.json({ reply: response.data.choices[0].message.content });

    } catch (error) {
        logger.error(`OpenRouter Error: ${error.message}`);
        res.status(500).json({ 
            error: error.response?.data?.error?.message || 'Chat service unavailable' 
        });
    }
});

// Search endpoint
app.post('/search', async (req, res) => {
    try {
        const query = req.body?.query;
        if (!query) return res.status(400).json({ error: 'Query required' });

        if (!process.env.SERPAPI_KEY) {
            logger.error('SerpAPI key missing');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const response = await axios.get('https://serpapi.com/search', {
            params: {
                q: query,
                api_key: process.env.SERPAPI_KEY
            },
            timeout: 10000
        });

        res.json({ results: response.data.organic_results || [] });

    } catch (error) {
        logger.error(`SerpAPI Error: ${error.message}`);
        res.status(500).json({ error: 'Search service unavailable' });
    }
});

// Server binding for Render
app.listen(PORT, '0.0.0.0', () => {
    logger.info(`✅ Server running on port ${PORT}`);
});

// Error handling
app.use((err, req, res, next) => {
    logger.error(`Unhandled Error: ${err.message}`);
    res.status(500).json({ error: 'Internal server error' });
});