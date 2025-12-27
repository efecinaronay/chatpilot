/**
 * Comet Side Panel - Main Controller
 * Handles chat, voice mode, summarization, and page interaction
 */

class CometPanel {
    constructor() {
        this.backendUrl = 'http://localhost:3001';
        this.user = null;
        this.currentMode = 'chat';
        this.isProcessing = false;
        this.recognition = null;
        this.synthesis = window.speechSynthesis;
        this.isListening = false;
        this.currentModel = 'gpt-4o-mini';

        this.init();
    }

    async init() {
        // Elements
        this.loginScreen = document.getElementById('loginScreen');
        this.mainApp = document.getElementById('mainApp');
        this.googleLoginBtn = document.getElementById('googleLoginBtn');

        // Toolbar
        this.modeBtns = document.querySelectorAll('.mode-btn');
        this.settingsBtn = document.getElementById('settingsBtn');
        this.userAvatar = document.getElementById('userAvatar');
        this.modelSelect = document.getElementById('modelSelect');
        this.contextText = document.getElementById('contextText');

        // Views
        this.chatView = document.getElementById('chatView');
        this.voiceView = document.getElementById('voiceView');
        this.summarizeView = document.getElementById('summarizeView');

        // Chat
        this.chatContainer = document.getElementById('chatContainer');
        this.chatWelcome = document.getElementById('chatWelcome');
        this.chatInput = document.getElementById('chatInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.attachBtn = document.getElementById('attachBtn');
        this.micBtn = document.getElementById('micBtn');
        this.fileInput = document.getElementById('fileInput');
        this.chips = document.querySelectorAll('.chip');

        // Voice
        this.voiceOrb = document.getElementById('voiceOrb');
        this.voiceStatus = document.getElementById('voiceStatus');
        this.voiceTranscript = document.getElementById('voiceTranscript');
        this.voiceResponse = document.getElementById('voiceResponse');

        // Summarize
        this.summarizeContent = document.getElementById('summarizeContent');
        this.refreshSummary = document.getElementById('refreshSummary');

        // Settings
        this.settingsPanel = document.getElementById('settingsPanel');
        this.closeSettings = document.getElementById('closeSettings');
        this.backendUrlInput = document.getElementById('backendUrl');
        this.apiKeyInput = document.getElementById('apiKey');
        this.logoutBtn = document.getElementById('logoutBtn');

        // Initialize speech recognition
        this.initSpeechRecognition();

        // Load settings and models
        await this.loadSettings();
        await this.loadModels();

        // Check auth
        await this.checkAuth();

        // Bind events
        this.bindEvents();

        // Listen for context menu actions
        chrome.runtime.onMessage.addListener((msg) => {
            if (msg.type === 'CONTEXT_MENU_ACTION') {
                this.handleContextMenuAction(msg);
            }
        });
    }

    async loadModels() {
        try {
            const result = await this.callBackend('/api/chat/models', null, 'GET');
            if (result.models) {
                this.modelSelect.innerHTML = '';
                result.models.forEach(model => {
                    const option = document.createElement('option');
                    option.value = model.id;
                    option.textContent = `${model.name} (${model.provider})`;
                    this.modelSelect.appendChild(option);
                });

                // Restore selected model after loading list
                if (this.currentModel) {
                    this.modelSelect.value = this.currentModel;
                }
            }
        } catch (e) {
            console.error('Failed to load models:', e);
        }
    }

    bindEvents() {
        // Login
        this.googleLoginBtn.addEventListener('click', () => this.handleLogin());
        this.logoutBtn.addEventListener('click', () => this.handleLogout());

        // Mode switching
        this.modeBtns.forEach(btn => {
            btn.addEventListener('click', () => this.switchMode(btn.dataset.mode));
        });

        // Settings
        this.settingsBtn.addEventListener('click', () => this.openSettings());
        this.closeSettings.addEventListener('click', () => this.closeSettingsPanel());
        this.backendUrlInput.addEventListener('input', () => this.saveSettings());
        this.apiKeyInput.addEventListener('input', () => this.saveSettings());

        // Model selection
        this.modelSelect.addEventListener('change', (e) => {
            this.currentModel = e.target.value;
            this.saveSettings();
        });

        // Chat input
        this.chatInput.addEventListener('input', () => this.handleInputChange());
        this.chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        this.sendBtn.addEventListener('click', () => this.sendMessage());

        // Auto-resize textarea
        this.chatInput.addEventListener('input', () => {
            this.chatInput.style.height = 'auto';
            this.chatInput.style.height = Math.min(this.chatInput.scrollHeight, 150) + 'px';
        });

        // Quick chips
        this.chips.forEach(chip => {
            chip.addEventListener('click', () => {
                const prompt = chip.dataset.prompt;
                this.chatInput.value = prompt;
                this.sendMessage();
            });
        });

        // File attachment
        this.attachBtn.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFileAttach(e));

        // Dictation (in chat)
        this.micBtn.addEventListener('click', () => this.toggleDictation());

        // Dictate to page (inserts text into focused field on page)
        const dictatePageBtn = document.getElementById('dictatePageBtn');
        if (dictatePageBtn) {
            dictatePageBtn.addEventListener('click', () => this.toggleDictateToPage());
        }

        // Deep research toggle
        const deepResearchToggle = document.getElementById('deepResearchToggle');
        if (deepResearchToggle) {
            deepResearchToggle.addEventListener('change', (e) => {
                this.deepResearch = e.target.checked;
                this.contextText.textContent = e.target.checked ? 'Deep Research ON' : 'Ready';
            });
        }

        // Voice mode orb
        this.voiceOrb.addEventListener('click', () => this.toggleVoiceMode());

        // Summarize refresh
        this.refreshSummary.addEventListener('click', () => this.summarizePage());
    }

    // Dictate to page - sends speech to focused field on page
    isDictatingToPage = false;

    toggleDictateToPage() {
        if (!this.recognition) {
            this.addMessage('ai', 'Voice not supported in this browser.');
            return;
        }

        const btn = document.getElementById('dictatePageBtn');

        if (this.isDictatingToPage) {
            this.isDictatingToPage = false;
            this.recognition.stop();
            btn?.classList.remove('active');
        } else {
            this.isDictatingToPage = true;
            this.isListening = true;
            btn?.classList.add('active');

            // Override recognition result handler temporarily
            this.recognition.onresult = async (event) => {
                let transcript = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    transcript += event.results[i][0].transcript;
                }

                // Only send final results to page
                if (event.results[event.results.length - 1].isFinal) {
                    try {
                        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                        await chrome.tabs.sendMessage(tab.id, {
                            type: 'DICTATE_TO_PAGE',
                            text: transcript + ' '
                        });
                    } catch (e) {
                        console.error('Dictate to page error:', e);
                    }
                }
            };

            this.recognition.onend = () => {
                if (this.isDictatingToPage) {
                    try { this.recognition.start(); } catch (e) { }
                } else {
                    btn?.classList.remove('active');
                }
            };

            this.recognition.start();
            this.addMessage('ai', 'Dictating to page. Click any text field on the page and speak. Say "period", "comma", "question mark" for punctuation.');
        }
    }

    // ============================================
    // AUTHENTICATION
    // ============================================

    async checkAuth() {
        try {
            const result = await chrome.storage.local.get(['user', 'authToken']);
            if (result.user && result.authToken) {
                this.user = result.user;
                this.showApp();
            } else {
                this.showLogin();
            }
        } catch (e) {
            this.showLogin();
        }
    }

    async handleLogin() {
        try {
            this.googleLoginBtn.disabled = true;
            this.googleLoginBtn.textContent = 'Signing in...';

            const token = await new Promise((resolve, reject) => {
                chrome.identity.getAuthToken({ interactive: true }, (token) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(token);
                    }
                });
            });

            const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to fetch user info');

            const userInfo = await response.json();

            this.user = {
                id: userInfo.id,
                email: userInfo.email,
                name: userInfo.name,
                picture: userInfo.picture
            };

            await chrome.storage.local.set({ user: this.user, authToken: token });
            this.showApp();

        } catch (error) {
            alert('Login failed: ' + error.message);
        } finally {
            this.googleLoginBtn.disabled = false;
            this.googleLoginBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Continue with Google
      `;
        }
    }

    async handleLogout() {
        const result = await chrome.storage.local.get(['authToken']);
        if (result.authToken) {
            await new Promise(resolve => {
                chrome.identity.removeCachedAuthToken({ token: result.authToken }, resolve);
            });
        }
        await chrome.storage.local.remove(['user', 'authToken']);
        this.user = null;
        this.showLogin();
    }

    showLogin() {
        this.loginScreen.style.display = 'flex';
        this.mainApp.style.display = 'none';
    }

    showApp() {
        this.loginScreen.style.display = 'none';
        this.mainApp.style.display = 'flex';

        if (this.user?.picture) {
            this.userAvatar.src = this.user.picture;
        }

        this.updateContext();
    }

    // ============================================
    // SETTINGS
    // ============================================

    async loadSettings() {
        try {
            const result = await chrome.storage.local.get(['backendUrl', 'apiKey', 'model']);
            if (result.backendUrl) {
                this.backendUrl = result.backendUrl;
                this.backendUrlInput.value = result.backendUrl;
            }
            if (result.apiKey) {
                this.apiKeyInput.value = result.apiKey;
            }
            if (result.model) {
                this.currentModel = result.model;
                this.modelSelect.value = result.model;
            }
        } catch (e) { }
    }

    async saveSettings() {
        this.backendUrl = this.backendUrlInput.value;
        await chrome.storage.local.set({
            backendUrl: this.backendUrl,
            apiKey: this.apiKeyInput.value,
            model: this.currentModel
        });
    }

    openSettings() {
        this.settingsPanel.classList.add('visible');
    }

    closeSettingsPanel() {
        this.settingsPanel.classList.remove('visible');
    }

    // ============================================
    // MODE SWITCHING
    // ============================================

    switchMode(mode) {
        this.currentMode = mode;

        // Update buttons
        this.modeBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        // Update views
        document.querySelectorAll('.view').forEach(view => {
            view.classList.remove('active');
        });

        if (mode === 'chat') {
            this.chatView.classList.add('active');
        } else if (mode === 'voice') {
            this.voiceView.classList.add('active');
        } else if (mode === 'summarize') {
            this.summarizeView.classList.add('active');
            this.summarizePage();
        }
    }

    // ============================================
    // PAGE CONTEXT
    // ============================================

    async updateContext() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab?.url) {
                const hostname = new URL(tab.url).hostname;
                this.contextText.textContent = hostname || 'Ready';
            }
        } catch (e) {
            this.contextText.textContent = 'Ready';
        }
    }

    async getPageContent() {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: 'GET_PAGE_CONTENT' }, (response) => {
                resolve(response?.content || null);
            });
        });
    }

    // ============================================
    // CHAT
    // ============================================

    handleInputChange() {
        const hasText = this.chatInput.value.trim().length > 0;
        this.sendBtn.disabled = !hasText || this.isProcessing;
    }

    async sendMessage() {
        const message = this.chatInput.value.trim();
        if (!message || this.isProcessing) return;

        // Hide welcome
        if (this.chatWelcome) {
            this.chatWelcome.style.display = 'none';
        }

        // Add user message
        this.addMessage('user', message);
        this.chatInput.value = '';
        this.chatInput.style.height = 'auto';
        this.handleInputChange();

        // Process
        this.isProcessing = true;
        this.showThinking();

        try {
            const pageContent = await this.getPageContent();
            const response = await this.callBackend('/api/chat', {
                message: message,
                pageContext: pageContent,
                model: this.currentModel,
                userId: this.user?.id
            });

            this.hideThinking();
            this.addMessage('ai', response.response || response.message || 'I received your message.');

        } catch (error) {
            this.hideThinking();
            this.addMessage('ai', `Sorry, I encountered an error: ${error.message}`);
        } finally {
            this.isProcessing = false;
            this.handleInputChange();
        }
    }

    addMessage(type, text) {
        const div = document.createElement('div');
        div.className = 'chat-message';

        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (type === 'user') {
            div.innerHTML = `
        <img class="message-avatar" src="${this.user?.picture || ''}" alt="">
        <div class="message-content">
          <div class="message-header">
            <span class="message-name">${this.user?.name || 'You'}</span>
            <span class="message-time">${time}</span>
          </div>
          <div class="message-text user">${this.escapeHtml(text)}</div>
        </div>
      `;
        } else {
            div.innerHTML = `
        <div class="message-avatar ai">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="8" stroke="white" stroke-width="1.5"/>
            <circle cx="12" cy="12" r="3" fill="white"/>
          </svg>
        </div>
        <div class="message-content">
          <div class="message-header">
            <span class="message-name">Comet</span>
            <span class="message-time">${time}</span>
          </div>
          <div class="message-text">${this.formatResponse(text)}</div>
        </div>
      `;
        }

        this.chatContainer.appendChild(div);
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }

    showThinking() {
        const div = document.createElement('div');
        div.id = 'thinkingIndicator';
        div.className = 'chat-message';
        div.innerHTML = `
      <div class="message-avatar ai">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="8" stroke="white" stroke-width="1.5"/>
          <circle cx="12" cy="12" r="3" fill="white"/>
        </svg>
      </div>
      <div class="message-content">
        <div class="thinking">
          <div class="thinking-dots"><span></span><span></span><span></span></div>
          Thinking...
        </div>
      </div>
    `;
        this.chatContainer.appendChild(div);
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }

    hideThinking() {
        const el = document.getElementById('thinkingIndicator');
        if (el) el.remove();
    }

    // ============================================
    // VOICE MODE
    // ============================================

    initSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            console.warn('Speech recognition not supported');
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';

        this.recognition.onresult = (event) => {
            let transcript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                transcript += event.results[i][0].transcript;
            }

            if (this.currentMode === 'voice') {
                this.voiceTranscript.textContent = transcript;

                // Process on final result
                if (event.results[event.results.length - 1].isFinal) {
                    this.processVoiceCommand(transcript);
                }
            } else {
                // Dictation mode - insert into chat input
                this.chatInput.value = transcript;
                this.handleInputChange();
            }
        };

        this.recognition.onend = () => {
            if (this.isContinuousVoice) {
                // In continuous mode, we handle restarts in speakText onend or after processing
                // Don't reset UI here unless explicitly stopped
                return;
            }

            if (this.isListening) {
                try { this.recognition.start(); } catch (e) { }
            } else {
                this.isListening = false;
                this.voiceOrb?.classList.remove('listening');
                this.micBtn?.classList.remove('recording');
                this.voiceStatus.textContent = 'Tap to speak';
            }
        };

        this.recognition.onerror = (event) => {
            console.error('Speech error:', event.error);
            this.isListening = false;
            this.voiceOrb?.classList.remove('listening');
            this.micBtn?.classList.remove('recording');

            // Handle specific errors
            if (event.error === 'not-allowed') {
                this.voiceStatus.textContent = 'Microphone access denied';
                this.addMessage('ai', '🎤 Microphone access was denied. Please allow microphone access in Chrome settings:\n\n1. Click the lock icon in the address bar\n2. Set Microphone to "Allow"\n3. Reload the page');
            } else if (event.error === 'no-speech') {
                this.voiceStatus.textContent = 'Tap to speak';
            } else if (event.error === 'network') {
                this.voiceStatus.textContent = 'Network error';
            } else if (event.error === 'aborted') {
                this.voiceStatus.textContent = 'Tap to speak';
            } else {
                this.voiceStatus.textContent = 'Error: ' + event.error;
            }
        };
    }

    toggleVoiceMode() {
        if (!this.recognition) {
            this.voiceStatus.textContent = 'Voice not supported';
            return;
        }

        if (this.isListening) {
            this.isListening = false;
            this.isContinuousVoice = false;
            this.recognition.stop();
            if (this.synthesis) this.synthesis.cancel();
            this.voiceOrb.classList.remove('listening');
            this.voiceStatus.textContent = 'Tap to speak';
        } else {
            this.isListening = true;
            this.isContinuousVoice = true;
            this.voiceTranscript.textContent = '';
            this.voiceResponse.innerHTML = '';

            // Initial greeting
            this.speakText("Hi! I'm listening. How can I help you today?");

            this.recognition.start();
            this.voiceOrb.classList.add('listening');
            this.voiceStatus.textContent = 'Listening...';
        }
    }

    toggleDictation() {
        if (!this.recognition) return;

        if (this.isListening) {
            this.isListening = false;
            this.recognition.stop();
            this.micBtn.classList.remove('recording');
        } else {
            this.isListening = true;
            this.recognition.start();
            this.micBtn.classList.add('recording');
        }
    }

    speakText(text) {
        if (!this.synthesis) return;

        // Stop any current speech
        this.synthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text.replace(/<[^>]+>/g, ''));
        utterance.rate = 1.05;
        utterance.pitch = 1.0;

        // When AI starts speaking, stop listening to avoid hearing itself
        utterance.onstart = () => {
            if (this.isContinuousVoice && this.isListening) {
                this.recognition.stop();
            }
        };

        // When AI finishes, start listening again for "Natural Conversation"
        utterance.onend = () => {
            if (this.isContinuousVoice && !this.isListening) {
                this.isListening = true;
                try {
                    this.recognition.start();
                    this.voiceOrb?.classList.add('listening');
                    this.voiceStatus.textContent = 'Listening...';
                } catch (e) { }
            }
        };

        this.synthesis.speak(utterance);
    }

    async processVoiceCommand(transcript) {
        // Stop listening while processing
        this.isListening = false;
        this.recognition.stop();
        this.voiceOrb.classList.remove('listening');
        this.voiceStatus.textContent = 'Processing...';

        try {
            const pageContent = await this.getPageContent();
            const response = await this.callBackend('/api/chat', {
                message: transcript,
                pageContext: pageContent,
                model: this.currentModel,
                userId: this.user?.id,
                isVoice: true
            });

            const text = response.response || response.message || 'Done.';
            this.voiceResponse.innerHTML = this.formatResponse(text);
            this.voiceStatus.textContent = 'Speaking...';

            // Speak response naturally
            this.speakText(text);

        } catch (error) {
            this.voiceStatus.textContent = 'Error: ' + error.message;
            if (this.isContinuousVoice) {
                setTimeout(() => {
                    this.isListening = true;
                    this.recognition.start();
                }, 2000);
            }
        }
    }

    // ============================================
    // SUMMARIZE
    // ============================================

    async summarizePage() {
        this.summarizeContent.innerHTML = `
      <div class="loading-summary">
        <div class="spinner"></div>
        <p>Analyzing page...</p>
      </div>
    `;

        try {
            const pageContent = await this.getPageContent();

            if (!pageContent) {
                this.summarizeContent.innerHTML = '<p>Could not access page content.</p>';
                return;
            }

            const response = await this.callBackend('/api/chat', {
                message: 'Summarize this page in a clear, concise way with bullet points for key information.',
                pageContext: pageContent,
                model: this.currentModel,
                userId: this.user?.id
            });

            this.summarizeContent.innerHTML = this.formatResponse(response.response || 'No summary available.');

        } catch (error) {
            this.summarizeContent.innerHTML = `<p>Error: ${error.message}</p>`;
        }
    }

    // ============================================
    // FILE ATTACHMENT
    // ============================================

    async handleFileAttach(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Hide welcome
        if (this.chatWelcome) {
            this.chatWelcome.style.display = 'none';
        }

        this.addMessage('user', `📎 Attached: ${file.name}`);
        this.showThinking();

        const reader = new FileReader();

        reader.onload = async (e) => {
            try {
                if (file.type.startsWith('image/')) {
                    // Image analysis with Gemini Vision
                    const base64Data = e.target.result.split(',')[1];
                    const settings = await chrome.storage.local.get(['apiKey']);

                    const response = await this.callBackend('/api/chat/image', {
                        imageData: base64Data,
                        mimeType: file.type,
                        prompt: 'Describe this image in detail. What do you see?',
                        apiKey: settings.apiKey
                    });

                    this.hideThinking();
                    this.addMessage('ai', response.response || 'I analyzed the image.');
                } else {
                    // Text file - add content to context
                    const content = e.target.result;
                    this.hideThinking();
                    this.addMessage('ai', `I've read the file. It contains ${content.length} characters. Ask me questions about it!`);
                    // Store for context
                    this.attachedFileContent = content;
                }
            } catch (error) {
                this.hideThinking();
                this.addMessage('ai', `Error processing file: ${error.message}`);
            }
        };

        if (file.type.startsWith('image/')) {
            reader.readAsDataURL(file);
        } else {
            reader.readAsText(file);
        }

        this.fileInput.value = '';
    }

    // ============================================
    // CONTEXT MENU
    // ============================================

    handleContextMenuAction(msg) {
        if (msg.action === 'comet-summarize') {
            this.switchMode('summarize');
        } else if (msg.action === 'comet-explain' && msg.selectedText) {
            this.switchMode('chat');
            this.chatInput.value = `Explain this: "${msg.selectedText}"`;
            this.sendMessage();
        } else if (msg.action === 'comet-chat' && msg.selectedText) {
            this.switchMode('chat');
            this.chatInput.value = `About: "${msg.selectedText}"`;
            this.chatInput.focus();
        }
    }

    // ============================================
    // API
    // ============================================

    async callBackend(endpoint, data = null, method = 'POST') {
        const result = await chrome.storage.local.get(['authToken', 'apiKey']);
        const headers = { 'Content-Type': 'application/json' };

        if (result.authToken) {
            headers['Authorization'] = `Bearer ${result.authToken}`;
        }

        const fetchOptions = {
            method: method,
            headers: headers
        };

        if (method === 'POST') {
            const bodyData = data || {};
            // Add API key to data if available and not already present
            if (result.apiKey && !bodyData.apiKey) {
                bodyData.apiKey = result.apiKey;
            }
            fetchOptions.body = JSON.stringify(bodyData);
        }

        const response = await fetch(`${this.backendUrl}${endpoint}`, fetchOptions);

        if (!response.ok) {
            try {
                const err = await response.json();
                throw new Error(err.message || `Error ${response.status}`);
            } catch {
                throw new Error(`Backend error: ${response.status}`);
            }
        }

        return response.json();
    }

    // ============================================
    // UTILITIES
    // ============================================

    formatResponse(text) {
        let html = this.escapeHtml(text);

        // Bold
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

        // Line breaks
        html = html.replace(/\n/g, '<br>');

        // Bullet points
        html = html.replace(/• (.+?)(<br>|$)/g, '<div style="margin-left:8px;">• $1</div>');

        return html;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => new CometPanel());
