/**
 * Comet - Chat Routes
 * Handles chat, summarization, and AI responses with OpenAI
 */

const express = require('express');
const router = express.Router();
const openai = require('../lib/openai');

// System prompt for Comet
const SYSTEM_PROMPT = `You are Comet, a helpful AI browser assistant powered by ChatGPT. You help users:
- Summarize and explain web pages
- Answer questions about page content
- Extract information from pages
- Assist with general queries

Guidelines:
- Be concise and helpful
- Use bullet points for lists
- Format responses for readability
- If asked about a page, use the provided context
- Be friendly but professional`;

/**
 * POST /api/chat
 * Main chat endpoint focused on OpenAI
 */
router.post('/', async (req, res) => {
    try {
        const { message, pageContext, model, userId, apiKey } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Missing required field: message' });
        }

        // Routing: sk- is OpenAI, others are treated as Gemini or fallback
        const openAIKey = apiKey?.startsWith('sk-') ? apiKey : process.env.OPENAI_API_KEY;
        const geminiKey = (apiKey && !apiKey.startsWith('sk-')) ? apiKey : process.env.GEMINI_API_KEY;

        console.log(`
┌─ Chat Request ────────────────────────────────────────────
│ Model: ${model || 'auto'}
│ Message: ${message.substring(0, 80)}${message.length > 80 ? '...' : ''}
│ Has Context: ${!!pageContext}
│ Provider: ${openAIKey ? 'OpenAI' : (geminiKey ? 'Gemini' : 'Local')}
└───────────────────────────────────────────────────────────
    `);

        // Build prompt
        let fullPrompt = message;
        if (pageContext) {
            fullPrompt = `Page Title: ${pageContext.title || 'Unknown'}\nPage URL: ${pageContext.url || 'Unknown'}\n\nContent:\n${pageContext.text?.substring(0, 12000) || 'None'}\n\n---\n\nRequest: ${message}`;
        }

        // Voice instruction
        let systemInstruction = SYSTEM_PROMPT;
        if (req.body.isVoice) {
            systemInstruction = `You are Comet, a helpful AI in a voice conversation. 
- Keep responses short and conversational (1-3 sentences).
- Use natural tone. No markdown or lists.`;
        }

        // Primary: OpenAI
        if (openAIKey) {
            try {
                const response = await openai.generateWithOpenAI(
                    openAIKey, model || 'gpt-4o-mini', fullPrompt, systemInstruction
                );
                return res.json({ success: true, response, model: model || 'gpt-4o-mini', timestamp: Date.now() });
            } catch (err) {
                console.error('OpenAI error:', err.message);

                // If it's a quota error, provide a helpful message
                if (err.message.includes('quota')) {
                    return res.status(402).json({
                        error: 'Quota Exceeded',
                        message: 'Your OpenAI account has run out of credits or hit its limit. Please check your billing at platform.openai.com.'
                    });
                }

                return res.status(500).json({ error: 'OpenAI Error', message: err.message });
            }
        }

        // 3. Fallback
        const localResponse = generateLocalResponse(message, pageContext);
        res.json({ success: true, response: localResponse, model: 'local', timestamp: Date.now() });

    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({ error: 'Failed to process chat', message: error.message });
    }
});

/**
 * POST /api/chat/image
 * Analyze image with OpenAI Vision
 */
router.post('/image', async (req, res) => {
    try {
        const { imageData, mimeType, prompt, apiKey } = req.body;

        if (!imageData) {
            return res.status(400).json({ error: 'Missing image data' });
        }

        const openAIKey = apiKey?.startsWith('sk-') ? apiKey : process.env.OPENAI_API_KEY;

        if (openAIKey) {
            const response = await openai.analyzeImageWithOpenAI(openAIKey, imageData, prompt, mimeType);
            return res.json({ success: true, response, timestamp: Date.now() });
        }

        res.status(400).json({ error: 'OpenAI API key required for image analysis' });

    } catch (error) {
        console.error('Image analysis error:', error);
        res.status(500).json({ error: 'Failed to analyze image', message: error.message });
    }
});

/**
 * GET /api/chat/models
 * List ChatGPT models
 */
router.get('/models', (req, res) => {
    const list = Object.entries(openai.MODELS).map(([id, cfg]) => ({
        id,
        name: cfg.displayName,
        provider: 'OpenAI'
    }));
    res.json({ models: list });
});

/**
 * Local response generation (fallback when no API key)
 */
function generateLocalResponse(message, pageContext) {
    const lower = message.toLowerCase();

    // Summarization
    if (pageContext && (lower.includes('summarize') || lower.includes('summary'))) {
        const text = pageContext.text || '';
        const title = pageContext.title || 'this page';
        const sentences = text.replace(/\s+/g, ' ').split(/[.!?]+/).filter(s => s.trim().length > 30 && s.trim().length < 300).slice(0, 6);
        if (sentences.length > 0) {
            return `**Summary of "${title}"**\n\n${sentences.map(s => '• ' + s.trim()).join('\n')}\n\n*Please add your OpenAI API key for a full ChatGPT summary.*`;
        }
        return `I couldn't extract enough content from "${title}" to summarize.`;
    }

    // Default
    return "I'm Comet, your AI browser assistant powered by ChatGPT! Please add your OpenAI API key in Settings to begin.";
}

module.exports = router;
