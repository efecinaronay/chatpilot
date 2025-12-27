/**
 * Comet - Background Service Worker
 * Handles side panel toggle, context menus, and message routing
 */

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
    await chrome.sidePanel.open({ tabId: tab.id });
});

// Set up context menu items
chrome.runtime.onInstalled.addListener(() => {
    // Create context menu items
    chrome.contextMenus.create({
        id: 'comet-summarize',
        title: 'Summarize with Comet',
        contexts: ['page', 'selection']
    });

    chrome.contextMenus.create({
        id: 'comet-explain',
        title: 'Explain with Comet',
        contexts: ['selection']
    });

    chrome.contextMenus.create({
        id: 'comet-chat',
        title: 'Ask Comet about this',
        contexts: ['selection']
    });

    console.log('Comet extension installed');
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    // Open side panel first
    await chrome.sidePanel.open({ tabId: tab.id });

    // Small delay to let panel initialize
    setTimeout(() => {
        // Send message to side panel
        chrome.runtime.sendMessage({
            type: 'CONTEXT_MENU_ACTION',
            action: info.menuItemId,
            selectedText: info.selectionText || '',
            pageUrl: info.pageUrl
        });
    }, 500);
});

// Handle messages from content script and side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_PAGE_CONTENT') {
        // Get content from the active tab
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            if (tabs[0]) {
                try {
                    const results = await chrome.scripting.executeScript({
                        target: { tabId: tabs[0].id },
                        func: () => {
                            const body = document.body.cloneNode(true);
                            body.querySelectorAll('script, style, noscript, iframe').forEach(el => el.remove());
                            return {
                                title: document.title,
                                url: window.location.href,
                                text: body.innerText.substring(0, 15000)
                            };
                        }
                    });
                    sendResponse({ success: true, content: results[0]?.result });
                } catch (error) {
                    sendResponse({ success: false, error: error.message });
                }
            }
        });
        return true; // Keep channel open for async
    }

    if (message.type === 'OPEN_SIDE_PANEL') {
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            if (tabs[0]) {
                await chrome.sidePanel.open({ tabId: tabs[0].id });
                sendResponse({ success: true });
            }
        });
        return true;
    }
});

// Keep service worker alive
chrome.runtime.onConnect.addListener((port) => {
    console.log('Connected:', port.name);
});
