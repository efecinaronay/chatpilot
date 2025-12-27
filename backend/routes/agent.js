/**
 * AI Browser Controller - Agent Routes
 * Handles DOM analysis and action generation
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Load system prompt
const systemPromptPath = path.join(__dirname, '..', 'prompts', 'system_prompt.txt');
let SYSTEM_PROMPT = '';
try {
    SYSTEM_PROMPT = fs.readFileSync(systemPromptPath, 'utf8');
} catch (e) {
    console.warn('System prompt not found, using default');
    SYSTEM_PROMPT = 'You are an AI assistant that controls web browsers.';
}

/**
 * POST /api/analyze
 * Receives user intent + pruned DOM, returns action array
 */
router.post('/analyze', async (req, res) => {
    try {
        const { intent, dom } = req.body;

        // Only require intent - DOM can be empty for some commands
        if (!intent) {
            return res.status(400).json({
                error: 'Missing required field: intent',
                required: ['intent']
            });
        }

        // Create default DOM if not provided
        const safeDom = dom || {
            url: 'unknown',
            title: 'Unknown Page',
            elements: [],
            viewport: { width: 0, height: 0 }
        };

        console.log(`
┌─ New Request ─────────────────────────────────────────────
│ Intent: ${intent}
│ Page: ${safeDom.title} (${safeDom.url})
│ Elements: ${safeDom.elements?.length || 0}
└───────────────────────────────────────────────────────────
    `);

        // Generate actions using LLM
        const actions = await generateActionsWithLLM(intent, safeDom);

        console.log('Generated actions:', JSON.stringify(actions, null, 2));

        res.json({
            success: true,
            intent: intent,
            actions: actions,
            timestamp: Date.now()
        });

    } catch (error) {
        console.error('Analysis error:', error);
        res.status(500).json({
            error: 'Failed to analyze request',
            message: error.message
        });
    }
});

/**
 * Generate actions using OpenAI or fallback to pattern matching
 */
async function generateActionsWithLLM(intent, dom, apiKey) {
    const openAIKey = apiKey?.startsWith('sk-') ? apiKey : process.env.OPENAI_API_KEY;

    if (openAIKey) {
        try {
            const { generateWithOpenAI } = require('../lib/openai');

            const actionPrompt = `You are a browser automation assistant. Based on the user's intent and the available page elements, generate a JSON array of actions to perform.

Available action types:
- CLICK: { type: "CLICK", targetId: "element-id", description: "what this does" }
- TYPE: { type: "TYPE", targetId: "element-id", value: "text to type", description: "what this does" }
- SCROLL: { type: "SCROLL", options: { direction: "up|down", amount: 500 }, description: "what this does" }
- SELECT: { type: "SELECT", targetId: "element-id", value: "option value", description: "what this does" }
- WAIT: { type: "WAIT", options: { duration: 1000 }, description: "why waiting" }

Page: ${dom.title || 'Unknown'} (${dom.url || 'Unknown'})

Available elements:
${JSON.stringify(dom.elements?.slice(0, 50) || [], null, 2)}

User intent: "${intent}"

Respond with ONLY a JSON array of actions. No explanation, just the array.`;

            const response = await generateWithOpenAI(openAIKey, 'gpt-4o', actionPrompt);

            // Try to parse JSON from response
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                const actions = JSON.parse(jsonMatch[0]);
                return Array.isArray(actions) ? actions : [];
            }
        } catch (e) {
            console.error('OpenAI action generation failed:', e.message);
        }
    }

    // Fallback: Use intelligent pattern matching
    return generateDemoActions(intent, dom);
}

/**
 * Demo action generator (replace with LLM in production)
 */
function generateDemoActions(intent, dom) {
    const intentLower = intent.toLowerCase();
    const elements = dom.elements || [];
    const actions = [];

    // Pattern: "click on X" or "click X"
    const clickMatch = intentLower.match(/click\s+(?:on\s+)?(?:the\s+)?[\"']?(.+?)[\"']?$/i);
    if (clickMatch) {
        const target = clickMatch[1].toLowerCase();
        const element = findBestMatch(elements, target, ['button', 'link', 'interactive']);
        if (element) {
            actions.push({
                type: 'CLICK',
                targetId: element.id,
                description: `Click on "${element.label}"`
            });
        }
    }

    // Pattern: "type X in Y" or "enter X in Y"
    const typeMatch = intentLower.match(/(?:type|enter|input)\s+[\"']?(.+?)[\"']?\s+(?:in|into)\s+(?:the\s+)?[\"']?(.+?)[\"']?$/i);
    if (typeMatch) {
        const value = typeMatch[1];
        const target = typeMatch[2].toLowerCase();
        const element = findBestMatch(elements, target, ['input', 'textarea']);
        if (element) {
            actions.push({
                type: 'TYPE',
                targetId: element.id,
                value: value,
                description: `Type "${value}" into "${element.label}"`
            });
        }
    }

    // Pattern: "login" / "sign in"
    if (intentLower.includes('login') || intentLower.includes('sign in')) {
        const loginBtn = findBestMatch(elements, 'login sign in submit', ['button', 'link']);
        if (loginBtn) {
            actions.push({
                type: 'CLICK',
                targetId: loginBtn.id,
                description: `Click login button "${loginBtn.label}"`
            });
        }
    }

    // Pattern: "search for X"
    const searchMatch = intentLower.match(/search\s+(?:for\s+)?[\"']?(.+?)[\"']?$/i);
    if (searchMatch) {
        const query = searchMatch[1];
        const searchInput = findBestMatch(elements, 'search query', ['input']);
        const searchBtn = findBestMatch(elements, 'search submit go', ['button']);

        if (searchInput) {
            actions.push({
                type: 'TYPE',
                targetId: searchInput.id,
                value: query,
                description: `Type "${query}" in search box`
            });
        }
        if (searchBtn) {
            actions.push({
                type: 'CLICK',
                targetId: searchBtn.id,
                description: 'Click search button'
            });
        }
    }

    // Pattern: "scroll down/up"
    if (intentLower.includes('scroll')) {
        const direction = intentLower.includes('up') ? 'up' : 'down';
        actions.push({
            type: 'SCROLL',
            options: { direction, amount: 500 },
            description: `Scroll ${direction}`
        });
    }

    // If no patterns matched, try to find any matching element
    if (actions.length === 0) {
        const anyMatch = findBestMatch(elements, intentLower, null);
        if (anyMatch) {
            actions.push({
                type: 'CLICK',
                targetId: anyMatch.id,
                description: `Click on "${anyMatch.label}"`
            });
        }
    }

    return actions;
}

/**
 * Find best matching element based on label similarity
 */
function findBestMatch(elements, query, preferredTypes) {
    const queryWords = query.toLowerCase().split(/\s+/);
    let bestMatch = null;
    let bestScore = 0;

    for (const element of elements) {
        if (element.disabled) continue;

        const labelLower = (element.label || '').toLowerCase();
        let score = 0;

        // Check word matches
        for (const word of queryWords) {
            if (labelLower.includes(word)) {
                score += word.length;
            }
        }

        // Boost for preferred types
        if (preferredTypes && preferredTypes.includes(element.type)) {
            score *= 1.5;
        }

        // Exact match bonus
        if (labelLower === query) {
            score *= 2;
        }

        if (score > bestScore) {
            bestScore = score;
            bestMatch = element;
        }
    }

    return bestScore > 0 ? bestMatch : null;
}

/**
 * Build prompt for LLM (used when LLM is integrated)
 */
function buildUserPrompt(intent, dom) {
    const elementsJson = JSON.stringify(dom.elements, null, 2);

    return `
## Current Page
- URL: ${dom.url}
- Title: ${dom.title}
- Viewport: ${dom.viewport.width}x${dom.viewport.height}

## User Intent
"${intent}"

## Available Elements
\`\`\`json
${elementsJson}
\`\`\`

Based on the user's intent and available elements, generate the action sequence.
Respond ONLY with a JSON array of actions.
`.trim();
}

module.exports = router;
