# AI Browser Controller

A full-stack AI-powered browser automation tool. Control any webpage with natural language commands.

## Project Structure

```
├── extension/           # Chrome Extension
│   ├── manifest.json    # Extension manifest (V3)
│   ├── content_script.js # DOM scraper + action executor
│   ├── popup.html       # Extension popup UI
│   ├── popup.js         # Popup logic
│   ├── styles.css       # Cursor-like dark theme
│   └── icons/           # Extension icons
│
└── backend/             # Node.js API Server
    ├── package.json
    ├── server.js        # Express server
    ├── routes/
    │   └── agent.js     # AI agent endpoint
    └── prompts/
        └── system_prompt.txt  # LLM system prompt
```

## Quick Start

### 1. Start the Backend

```bash
cd backend
npm install
npm start
```

The server runs on `http://localhost:3001`

### 2. Load the Extension

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the `extension` folder

### 3. Use the Extension

1. Navigate to any webpage
2. Click the extension icon
3. Type a command like "Click the login button"
4. Watch the AI execute your command!

## Features

- **Smart DOM Scraping**: Only captures visible, interactive elements
- **Token Efficient**: Pruned JSON representation saves LLM tokens
- **Multiple Actions**: CLICK, TYPE, SCROLL, WAIT, SELECT, CHECK
- **Visual Feedback**: Elements highlight when interacted with
- **Activity Log**: Track all AI actions

## LLM Integration

The backend includes a placeholder for LLM integration. To connect your preferred AI:

### Gemini (Google)
```javascript
const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
```

### OpenAI
```javascript
const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
```

See `backend/routes/agent.js` for full integration examples.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/analyze` | Analyze DOM and generate actions |
| GET | `/health` | Health check |

### Request Format
```json
{
  "intent": "Click the login button",
  "dom": {
    "url": "https://example.com",
    "title": "Example Page",
    "elements": [...]
  }
}
```

### Response Format
```json
{
  "success": true,
  "actions": [
    {
      "type": "CLICK",
      "targetId": "agent-42",
      "description": "Click login button"
    }
  ]
}
```

## License

MIT
