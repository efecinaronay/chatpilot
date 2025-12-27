/**
 * Comet - OpenAI API Client
 * Handles communication with OpenAI (ChatGPT)
 */

const OPENAI_API_BASE = 'https://api.openai.com/v1';

// Model configurations
const MODELS = {
    'gpt-4o': {
        name: 'gpt-4o',
        displayName: 'GPT-4o',
        maxTokens: 4096
    },
    'gpt-4o-mini': {
        name: 'gpt-4o-mini',
        displayName: 'GPT-4o Mini',
        maxTokens: 4096
    },
    'o1-preview': {
        name: 'o1-preview',
        displayName: 'O1 Deep Thinking',
        maxTokens: 4096
    }
};

/**
 * Generate content using OpenAI API
 */
async function generateWithOpenAI(apiKey, modelId, prompt, systemPrompt = null) {
    const model = MODELS[modelId] || MODELS['gpt-4o-mini'];

    const messages = [];

    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }

    messages.push({ role: 'user', content: prompt });

    const response = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: model.name,
            messages: messages,
            temperature: 0.7,
            max_tokens: model.maxTokens
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'No response generated';
}

/**
 * Analyze image with OpenAI Vision (GPT-4o)
 */
async function analyzeImageWithOpenAI(apiKey, imageBase64, prompt, mimeType = 'image/jpeg') {
    const response = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt || 'Describe this image in detail.' },
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:${mimeType};base64,${imageBase64}`
                            }
                        }
                    ]
                }
            ],
            max_tokens: 1000
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `OpenAI Vision error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'Unable to analyze image.';
}

module.exports = {
    MODELS,
    generateWithOpenAI,
    analyzeImageWithOpenAI
};
