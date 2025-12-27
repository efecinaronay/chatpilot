/**
 * Comet - Chat Routes
 * Handles chat, summarization, and AI responses with OpenAI
 */

const express = require('express');
const router = express.Router();
const openai = require('../lib/openai');
const github = require('../lib/github');

// System prompt for ChatPilot
const SYSTEM_PROMPT = `You are ChatPilot, a powerful AI browser assistant. You are a DIRECT OPERATOR of the browser for the user.
You have the ability to see the current page and interact with it (click, type, scroll, navigate).

CRITICAL GUIDELINES:
1. NEVER REFUSE A TASK: If the user asks you to log in, fill a form, or navigate, DO NOT say "I cannot log in". You are authorized.
2. ACT, DON'T JUST INSTRUCT: Use your interaction capabilities to DO it for the user.
3. ANTI-HALLUCINATION: If you are performing a browser task (clicking, logging in, etc.), DO NOT imagine or hallucinate the results (e.g., don't list homework assignments if you haven't actually seen the logged-in page yet).
4. STATE PROGRESS: Instead of guessing results, say: "I am now logging you in. Please wait while the page updates."
5. Only provide information that is ACTUALLY visible in the "Content" section provided to you. If the page hasn't updated to the target screen yet, acknowledge it and wait.

Duties:
- Controlling the browser to perform tasks
- Summarizing and explaining web pages
- Answering questions about page content`;

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

        const githubToken = apiKey?.startsWith('github_pat_') ? apiKey : process.env.GITHUB_TOKEN;
        const openAIKey = apiKey?.startsWith('sk-') ? apiKey : process.env.OPENAI_API_KEY;

        console.log(`
┌─ Chat Request ────────────────────────────────────────────
│ Model: ${model || 'auto'}
│ Message: ${message.substring(0, 80)}${message.length > 80 ? '...' : ''}
│ Has Context: ${!!pageContext}
│ Provider: ${githubToken ? 'GitHub' : (openAIKey ? 'OpenAI' : 'Local')}
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
            systemInstruction += `\n\nVOICE MODE INSTRUCTIONS:
- You are in a voice conversation. Keep spoken responses short and conversational (1-3 sentences).
- Use natural tone. No markdown or lists in the spoken part.`;
        }

        // 1. GitHub Models (Primary)
        if (githubToken) {
            try {
                const response = await github.generateWithGitHub(
                    githubToken, model || 'gpt-4o', fullPrompt, systemInstruction
                );
                return res.json({ success: true, response, model: model || 'gpt-4o', timestamp: Date.now() });
            } catch (err) {
                console.error('GitHub error:', err.message);
                if (apiKey?.startsWith('github_pat_')) return res.status(500).json({ error: 'GitHub Models Error', message: err.message });
            }
        }

        // 2. OpenAI (Secondary)
        if (openAIKey) {
            try {
                const response = await openai.generateWithOpenAI(
                    openAIKey, model || 'gpt-4o-mini', fullPrompt, systemInstruction
                );
                return res.json({ success: true, response, model: model || 'gpt-4o-mini', timestamp: Date.now() });
            } catch (err) {
                console.error('OpenAI error:', err.message);
                if (apiKey?.startsWith('sk-')) return res.status(500).json({ error: 'OpenAI Error', message: err.message });
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
 * Analyze image with GitHub Models or OpenAI Vision
 */
router.post('/image', async (req, res) => {
    try {
        const { imageData, mimeType, prompt, apiKey } = req.body;

        if (!imageData) {
            return res.status(400).json({ error: 'Missing image data' });
        }

        const githubToken = apiKey?.startsWith('github_pat_') ? apiKey : process.env.GITHUB_TOKEN;
        const openAIKey = apiKey?.startsWith('sk-') ? apiKey : process.env.OPENAI_API_KEY;

        if (githubToken) {
            const response = await github.analyzeImageWithGitHub(githubToken, imageData, prompt, mimeType);
            return res.json({ success: true, response, timestamp: Date.now() });
        }

        if (openAIKey) {
            const response = await openai.analyzeImageWithOpenAI(openAIKey, imageData, prompt, mimeType);
            return res.json({ success: true, response, timestamp: Date.now() });
        }

        res.status(400).json({ error: 'API key required for image analysis' });

    } catch (error) {
        console.error('Image analysis error:', error);
        res.status(500).json({ error: 'Failed to analyze image', message: error.message });
    }
});

router.get('/models', (req, res) => {
    const list = [
        ...Object.entries(github.MODELS).map(([id, cfg]) => ({ id, name: cfg.displayName, provider: 'GitHub' })),
        ...Object.entries(openai.MODELS).map(([id, cfg]) => ({ id, name: cfg.displayName, provider: 'OpenAI' }))
    ];
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
    return "I'm ChatPilot, your AI browser assistant powered by GitHub Models! Please add your GitHub PAT or OpenAI API key in Settings to begin.";
}

module.exports = router;
