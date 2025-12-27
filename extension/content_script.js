/**
 * AI Browser Controller - Content Script
 * Scrapes DOM and executes AI-driven actions
 */

(function () {
  'use strict';

  let agentIdCounter = 0;

  // ============================================
  // DOM SCRAPER - Assigns IDs and prunes DOM
  // ============================================

  const INTERACTIVE_SELECTORS = [
    'a[href]',
    'button',
    'input',
    'select',
    'textarea',
    '[role="button"]',
    '[role="link"]',
    '[role="textbox"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="menuitem"]',
    '[role="tab"]',
    '[onclick]',
    '[tabindex]:not([tabindex="-1"])'
  ];

  function isElementVisible(element) {
    if (!element) return false;

    const style = window.getComputedStyle(element);
    if (style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.opacity === '0') {
      return false;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return false;
    }

    // Check if in viewport (with some buffer)
    const inViewport = (
      rect.top < window.innerHeight + 100 &&
      rect.bottom > -100 &&
      rect.left < window.innerWidth + 100 &&
      rect.right > -100
    );

    return inViewport;
  }

  function getElementType(element) {
    const tag = element.tagName.toLowerCase();
    const type = element.type?.toLowerCase();
    const role = element.getAttribute('role');

    if (tag === 'a') return 'link';
    if (tag === 'button' || role === 'button') return 'button';
    if (tag === 'input') {
      if (type === 'submit' || type === 'button') return 'button';
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      return 'input';
    }
    if (tag === 'select') return 'select';
    if (tag === 'textarea') return 'textarea';
    if (role === 'textbox') return 'input';
    if (role === 'menuitem') return 'menuitem';
    if (role === 'tab') return 'tab';

    return 'interactive';
  }

  function getElementLabel(element) {
    // Try multiple sources for a meaningful label
    const sources = [
      element.getAttribute('aria-label'),
      element.getAttribute('title'),
      element.getAttribute('placeholder'),
      element.getAttribute('alt'),
      element.getAttribute('name'),
      element.innerText?.trim().substring(0, 100),
      element.value?.substring(0, 50)
    ];

    for (const source of sources) {
      if (source && source.trim().length > 0) {
        return source.trim();
      }
    }

    return null;
  }

  function scrapeDOM() {
    const elements = [];
    agentIdCounter = 0;

    // Query all interactive elements
    const selector = INTERACTIVE_SELECTORS.join(', ');
    const allElements = document.querySelectorAll(selector);

    allElements.forEach(element => {
      if (!isElementVisible(element)) return;

      // Assign unique agent ID
      const agentId = `agent-${++agentIdCounter}`;
      element.setAttribute('data-agent-id', agentId);

      const rect = element.getBoundingClientRect();
      const label = getElementLabel(element);

      // Skip elements without any identifiable label
      if (!label) return;

      elements.push({
        id: agentId,
        type: getElementType(element),
        tag: element.tagName.toLowerCase(),
        label: label,
        value: element.value || null,
        checked: element.checked ?? null,
        disabled: element.disabled || false,
        position: {
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2)
        }
      });
    });

    return {
      url: window.location.href,
      title: document.title,
      timestamp: Date.now(),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      elements: elements
    };
  }

  // ============================================
  // ACTION EXECUTOR
  // ============================================

  async function executeAction(action) {
    const { type, targetId, value, options } = action;

    const element = document.querySelector(`[data-agent-id="${targetId}"]`);

    if (!element && type !== 'SCROLL' && type !== 'WAIT') {
      return { success: false, error: `Element not found: ${targetId}` };
    }

    try {
      switch (type) {
        case 'CLICK':
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await sleep(200);
          highlightElement(element);
          element.click();
          return { success: true, action: 'clicked', targetId };

        case 'TYPE':
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await sleep(200);
          highlightElement(element);
          element.focus();
          element.value = '';
          // Simulate typing character by character
          for (const char of value) {
            element.value += char;
            element.dispatchEvent(new Event('input', { bubbles: true }));
            await sleep(30);
          }
          element.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true, action: 'typed', targetId, value };

        case 'SCROLL':
          const scrollAmount = options?.amount || 500;
          const direction = options?.direction || 'down';
          window.scrollBy({
            top: direction === 'down' ? scrollAmount : -scrollAmount,
            behavior: 'smooth'
          });
          await sleep(500);
          return { success: true, action: 'scrolled', direction, amount: scrollAmount };

        case 'WAIT':
          const duration = options?.duration || 1000;
          await sleep(duration);
          return { success: true, action: 'waited', duration };

        case 'SELECT':
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          highlightElement(element);
          element.value = value;
          element.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true, action: 'selected', targetId, value };

        case 'CHECK':
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          highlightElement(element);
          element.checked = options?.checked ?? true;
          element.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true, action: 'checked', targetId };

        default:
          return { success: false, error: `Unknown action type: ${type}` };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async function executeActions(actions) {
    const results = [];
    for (const action of actions) {
      const result = await executeAction(action);
      results.push(result);

      if (!result.success && !action.continueOnError) {
        break;
      }

      // Small delay between actions
      await sleep(300);
    }
    return results;
  }

  // ============================================
  // UTILITIES
  // ============================================

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function highlightElement(element) {
    const originalOutline = element.style.outline;
    const originalTransition = element.style.transition;

    element.style.transition = 'outline 0.2s ease';
    element.style.outline = '3px solid #7c3aed';

    setTimeout(() => {
      element.style.outline = originalOutline;
      element.style.transition = originalTransition;
    }, 1000);
  }

  // ============================================
  // MESSAGE HANDLING
  // ============================================

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SCRAPE_DOM') {
      const dom = scrapeDOM();
      sendResponse({ success: true, data: dom });
    }

    else if (message.type === 'EXECUTE_ACTIONS') {
      executeActions(message.actions).then(results => {
        sendResponse({ success: true, results });
      });
      return true; // Keep channel open for async response
    }

    else if (message.type === 'DICTATE_TO_PAGE') {
      // Insert text into the currently focused element
      const activeElement = document.activeElement;
      if (activeElement && (activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.isContentEditable)) {

        // Process punctuation commands
        let text = message.text;
        text = text.replace(/\bperiod\b/gi, '.');
        text = text.replace(/\bcomma\b/gi, ',');
        text = text.replace(/\bquestion mark\b/gi, '?');
        text = text.replace(/\bexclamation mark\b/gi, '!');
        text = text.replace(/\bnew line\b/gi, '\n');
        text = text.replace(/\bnewline\b/gi, '\n');

        if (activeElement.isContentEditable) {
          document.execCommand('insertText', false, text);
        } else {
          const start = activeElement.selectionStart || 0;
          const end = activeElement.selectionEnd || 0;
          const before = activeElement.value.substring(0, start);
          const after = activeElement.value.substring(end);
          activeElement.value = before + text + after;
          activeElement.selectionStart = activeElement.selectionEnd = start + text.length;
          activeElement.dispatchEvent(new Event('input', { bubbles: true }));
        }

        sendResponse({ success: true, inserted: text });
      } else {
        sendResponse({ success: false, error: 'No text field focused on page' });
      }
    }

    else if (message.type === 'PING') {
      sendResponse({ success: true, status: 'ready' });
    }
  });

  // Initial scrape on load
  console.log('[AI Browser Controller] Content script loaded');
})();
