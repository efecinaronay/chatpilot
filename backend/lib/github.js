/**
 * ChatPilot - GitHub Models API Client
 * Uses the OpenAI-compatible endpoint for GitHub Models
 */

const GITHUB_MODELS_BASE = 'https://models.inference.ai.azure.com';

// GitHub Models list
const MODELS = {
    'gpt-4o': {
        name: 'gpt-4o',
        displayName: 'GPT-4o (GitHub)',
        maxTokens: 4096
    },
    'gpt-4o-mini': {
        name: 'gpt-4o-mini',
        displayName: 'GPT-4o Mini (GitHub)',
        maxTokens: 4096
    }
};

/**
 * Generate content using GitHub Models API
 */
async function generateWithGitHub(token, modelId, prompt, systemPrompt = null) {
    const model = MODELS[modelId] || MODELS['gpt-4o-mini'];

    const messages = [];
    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await fetch(`${GITHUB_MODELS_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            messages: messages,
            model: model.name,
            temperature: 1,
            max_tokens: model.maxTokens,
            top_p: 1
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || `GitHub API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'No response generated';
}

/**
 * Analyze image with GitHub Models (GPT-4o)
 */
async function analyzeImageWithGitHub(token, imageBase64, prompt, mimeType = 'image/jpeg') {
    const response = await fetch(`${GITHUB_MODELS_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt || 'Describe this image.' },
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:${mimeType};base64,${imageBase64}`
                            }
                        }
                    ]
                }
            ],
            model: 'gpt-4o'
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || `GitHub Vision error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'Unable to analyze image.';
}

module.exports = {
    MODELS,
    generateWithGitHub,
    analyzeImageWithGitHub
};
