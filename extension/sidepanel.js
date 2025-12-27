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
        this.isMuted = true;
        this.isSpeaking = false;
        this.isContinuousVoice = true;
        this.pendingIntent = null;
        this.isExecuting = false;

        this.init();
    }

    async init() {
        // Elements
        this.mainApp = document.getElementById('mainApp');

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
        this.micToggleBtn = document.getElementById('micToggleBtn');
        this.micStatusLabel = document.querySelector('.mic-status-label');
        this.micIcon = document.querySelector('.mic-icon');
        this.micOffIcon = document.querySelector('.mic-off-icon');
        this.voiceStatusIndicator = document.getElementById('voiceStatusIndicator');
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

        // Initial UI Update
        this.updateContext();

        // Bind events
        this.bindEvents();

        // Listen for context menu actions
        chrome.runtime.onMessage.addListener((msg) => {
            if (msg.type === 'CONTEXT_MENU_ACTION') {
                this.handleContextMenuAction(msg);
            }
        });

        // Auto-resume agent after page navigation
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (changeInfo.status === 'complete' && this.pendingIntent) {
                console.log('Page updated, resuming pending intent:', this.pendingIntent);
                setTimeout(() => {
                    this.executeActions(this.pendingIntent, true);
                }, 1000); // Wait for content scripts to settle
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

        // Voice mode mic toggle
        this.micToggleBtn.addEventListener('click', () => this.toggleMic());

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
            this.updateVoiceModeStatus();
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

    async ensureContentScript(tabId, url) {
        // Skip restricted URLs
        if (!url || url.startsWith('chrome://') || url.startsWith('edge://') || url.startsWith('about:') || url.includes('chrome.google.com/webstore')) {
            console.warn('Restricted URL, content script cannot be injected:', url);
            return false;
        }

        try {
            // Test if script is already there
            const isReady = await new Promise((resolve) => {
                chrome.tabs.sendMessage(tabId, { type: 'PING' }, (response) => {
                    if (chrome.runtime.lastError) resolve(false);
                    else resolve(response?.status === 'ready');
                });
            });

            if (isReady) return true;

            // Not ready, try to inject manually
            console.log('Content script not found in tab, injecting manually...');
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['content_script.js']
            });

            // Wait a moment for script to initialize
            await new Promise(r => setTimeout(r, 200));
            return true;
        } catch (e) {
            console.error('Failed to ensure content script:', e);
            return false;
        }
    }

    async getPrunedDOM() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            if (!tab) return null;

            const isReady = await this.ensureContentScript(tab.id, tab.url);
            if (!isReady) return {
                url: tab.url,
                title: tab.title,
                elements: [],
                error: 'Page restricted or content script failed to load'
            };

            console.log('Scraping DOM from tab:', tab.id);
            return new Promise((resolve) => {
                chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_DOM' }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.warn('Scrape DOM error:', chrome.runtime.lastError.message);
                        resolve(null);
                    } else {
                        resolve(response?.data || null);
                    }
                });
            });
        } catch (e) {
            console.error('getPrunedDOM failed:', e);
            return null;
        }
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

        // Start agent in parallel if it looks like a command
        if (this.isActionIntent(message)) {
            console.log('Action intent detected:', message);
            this.executeActions(message);
        }

        try {
            const pageContent = await this.getPageContent();
            const response = await this.callBackend('/api/chat', {
                message: message,
                pageContext: pageContent,
                model: this.currentModel,
                userId: this.user?.id
            });

            this.hideThinking();
            const text = response.response || response.message || 'I received your message.';
            this.addMessage('ai', text);

        } catch (error) {
            this.hideThinking();
            this.addMessage('ai', `Sorry, I encountered an error: ${error.message}`);
        } finally {
            this.isProcessing = false;
            this.handleInputChange();
        }
    }

    isActionIntent(text) {
        const lower = text.toLowerCase();
        const actionKeywords = [
            'click', 'type', 'enter', 'search', 'scroll', 'open', 'go to', 'visit',
            'put', 'select', 'fill', 'login', 'submit', 'buy', 'order', 'add',
            'cart', 'find', 'show', 'clear', 'check', 'set', 'choose', 'hit',
            'press', 'navigate', 'logout', 'sign in', 'sign up'
        ];

        // Also trigger if it looks like a direct command about the page
        const isCommand = actionKeywords.some(kw => lower.includes(kw));
        const isAskingCapabilty = lower.includes('can you') && (lower.includes('click') || lower.includes('find') || lower.includes('open'));

        return isCommand || isAskingCapabilty;
    }

    async executeActions(intent, isResumption = false) {
        if (this.isExecuting && !isResumption) {
            console.log('Already executing an agent task. Context update will follow.');
            return;
        }

        try {
            this.isExecuting = true;
            this.pendingIntent = intent; // Keep track for navigation resumption
            console.log('Executing actions for intent:', intent);
            this.contextText.textContent = 'Analysing...';
            const dom = await this.getPrunedDOM();

            const response = await this.callBackend('/api/analyze', {
                intent: intent,
                dom: dom || { url: window.location.href, elements: [] }
            });

            if (response.actions && response.actions.length > 0) {
                this.contextText.textContent = `Executing actions...`;

                const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
                if (!tab) return;

                // Ensure content script is present for element actions
                const isReady = await this.ensureContentScript(tab.id, tab.url);

                for (const action of response.actions) {
                    // Handle OPEN_URL natively in the side panel for reliability
                    if (action.type === 'OPEN_URL') {
                        let url = action.value;
                        if (!url.startsWith('http')) url = 'https://' + url;
                        await chrome.tabs.update(tab.id, { url: url });
                        this.contextText.textContent = 'Navigating...';
                        this.isExecuting = false; // Allow resumption listener to take over
                        return; // Stop further actions as page is changing
                    }

                    if (!isReady) {
                        console.warn('Cannot execute element action: Page restricted');
                        continue;
                    }

                    // For other actions, send to content script with retry/error handling
                    await new Promise((resolve) => {
                        chrome.tabs.sendMessage(tab.id, {
                            type: 'EXECUTE_ACTIONS',
                            actions: [action]
                        }, (resp) => {
                            if (chrome.runtime.lastError) {
                                console.warn('Action failed:', chrome.runtime.lastError.message);
                                resolve({ success: false });
                            } else {
                                resolve(resp || { success: true });
                            }
                        });
                    });
                }
            } else {
                console.log('No actions generated for intent:', intent);
                this.contextText.textContent = 'Task complete';
                this.pendingIntent = null; // Task finished or no more actions
            }
        } catch (e) {
            console.error('Agent execution error:', e);
            this.contextText.textContent = 'Agent Error';
            this.pendingIntent = null;
        } finally {
            this.isExecuting = false;
            setTimeout(() => this.updateContext(), 2000);
        }
    }

    addMessage(type, text) {
        const div = document.createElement('div');
        div.className = 'chat-message';

        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (type === 'user') {
            div.innerHTML = `
        <div class="message-avatar user">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </div>
        <div class="message-content">
          <div class="message-header">
            <span class="message-name">You</span>
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
            <span class="message-name">ChatPilot</span>
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

    safeStartRecognition() {
        if (!this.recognition || this.isMuted) return;
        try {
            this.recognition.start();
            this.isListening = true;
        } catch (e) {
            if (e.name === 'InvalidStateError') {
                console.warn('Recognition already started');
            } else {
                console.error('Safe start error:', e);
            }
        }
    }

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
            console.log('Voice session ended. isMuted:', this.isMuted, 'isListening:', this.isListening, 'isSpeaking:', this.isSpeaking);
            if (!this.isMuted && this.isListening && !this.isSpeaking && this.currentMode === 'voice') {
                console.log('Auto-restarting voice recognition...');
                this.safeStartRecognition();
            }
        };

        this.recognition.onerror = (event) => {
            console.error('Speech error:', event.error);
            this.isListening = false;
            this.micBtn?.classList.remove('recording');

            // Handle specific errors
            if (event.error === 'not-allowed') {
                this.voiceStatus.textContent = 'Microphone access denied';
                this.addMessage('ai', '🎤 Microphone access was denied. Please allow microphone access in Chrome settings:\n\n1. Click the lock icon in the address bar\n2. Set Microphone to "Allow"\n3. Reload the page');
            } else if (event.error === 'no-speech') {
                console.warn('Speech error: no-speech (ignoring and keeping alive)');
                // No need to reset UI for no-speech if we want to keep listening
                if (!this.isMuted && this.currentMode === 'voice') {
                    this.voiceStatus.textContent = 'Listening...';
                }
            } else if (event.error === 'network') {
                this.voiceStatus.textContent = 'Network error';
            } else if (event.error === 'aborted') {
                this.voiceStatus.textContent = 'Enable mic';
            } else {
                this.voiceStatus.textContent = 'Error: ' + event.error;
            }
        };
    }

    toggleMic() {
        if (!this.recognition) {
            this.voiceStatus.textContent = 'Voice not supported';
            return;
        }

        if (!this.isMuted) {
            // Mute
            this.isMuted = true;
            this.isListening = false;
            this.recognition.stop();
            if (this.synthesis) this.synthesis.cancel();

            this.micToggleBtn.classList.remove('active');
            this.micIcon.style.display = 'block';
            this.micOffIcon.style.display = 'none';
            this.micStatusLabel.textContent = 'Mic is Muted';
            this.voiceStatusIndicator.classList.remove('active');
            this.voiceStatus.textContent = 'Mic is off';
        } else {
            // Unmute / Start Listening
            this.isMuted = false;
            this.isListening = true;
            this.voiceTranscript.textContent = 'Listening...';
            this.voiceResponse.innerHTML = '';

            this.micToggleBtn.classList.add('active');
            this.micIcon.style.display = 'block';
            this.micOffIcon.style.display = 'none';
            this.micStatusLabel.textContent = 'Mic is ON';
            this.voiceStatusIndicator.classList.add('active');
            this.voiceStatus.textContent = 'Listening...';

            try {
                this.recognition.start();
            } catch (e) {
                console.error('Recognition start error:', e);
            }
        }
    }

    // This is now called when switching TO voice mode view
    updateVoiceModeStatus() {
        if (this.isMuted) {
            this.voiceStatus.textContent = 'Mic is off';
            this.voiceStatusIndicator.classList.remove('active');
        } else if (this.isSpeaking) {
            this.voiceStatus.textContent = 'Speaking...';
            this.voiceStatusIndicator.classList.add('thinking');
        } else {
            this.voiceStatus.textContent = 'Listening...';
            this.voiceStatusIndicator.classList.add('active');
        }
    }

    toggleVoiceMode() {
        // Redundant with switchMode, but kept for compatibility
        this.switchMode('voice');
    }

    toggleDictation() {
        if (!this.recognition) return;

        if (this.isListening) {
            this.isListening = false;
            this.recognition.stop();
            this.micBtn.classList.remove('recording');
        } else {
            this.safeStartRecognition();
            this.micBtn.classList.add('recording');
        }
    }

    speakText(text) {
        if (!this.synthesis) return;

        // Stop any current speech
        this.synthesis.cancel();
        this.isSpeaking = true;
        this.updateVoiceModeStatus();

        const utterance = new SpeechSynthesisUtterance(text.replace(/<[^>]+>/g, ''));
        utterance.rate = 1.05;
        utterance.pitch = 1.0;

        // When AI starts speaking, stop listening to avoid hearing itself
        utterance.onstart = () => {
            if (!this.isMuted && this.isListening) {
                try { this.recognition.stop(); } catch (e) { }
            }
        };

        // When AI finishes, start listening again for "Natural Conversation"
        utterance.onend = () => {
            this.isSpeaking = false;
            if (!this.isMuted) {
                this.isListening = true;
                try {
                    this.safeStartRecognition();
                    this.voiceStatusIndicator.classList.remove('thinking');
                    this.voiceStatusIndicator.classList.add('active');
                    this.voiceStatus.textContent = 'Listening...';
                } catch (e) {
                    console.error('Restart recognition error:', e);
                }
            } else {
                this.updateVoiceModeStatus();
            }
        };

        this.synthesis.speak(utterance);
    }

    async processVoiceCommand(transcript) {
        // Stop listening while processing
        this.isListening = false;
        try { this.recognition.stop(); } catch (e) { }

        this.voiceStatus.textContent = 'Thinking...';

        // Trigger agent actions in parallel
        if (this.isActionIntent(transcript)) {
            this.executeActions(transcript);
        }

        try {
            const pageContent = await this.getPageContent();
            const response = await this.callBackend('/api/chat', {
                message: transcript,
                pageContext: pageContent,
                model: 'gpt-4o', // Priority for voice
                isVoice: true
            });

            const text = response.response || response.message || 'Done.';
            this.voiceResponse.innerHTML = this.formatResponse(text);

            // Speak response naturally
            this.speakText(text);

        } catch (error) {
            this.voiceStatus.textContent = 'Error: ' + error.message;
            this.voiceStatusIndicator.classList.remove('thinking');

            if (!this.isMuted) {
                setTimeout(() => {
                    this.safeStartRecognition();
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
