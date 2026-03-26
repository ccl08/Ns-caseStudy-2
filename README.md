# Ns-caseStudy-2 — Gmail Thread Status Chrome Extension

> A Chrome Extension that analyses the content of open Gmail threads and surfaces a contextual **status badge** directly inside the Gmail UI — built as a case study for the Nous Growth Associate interview process.

---

## Table of Contents

1. [Overview](#overview)
2. [How It Works](#how-it-works)
3. [Architecture](#architecture)
4. [Chrome Extension Deep Dive](#chrome-extension-deep-dive)
   - [Manifest (manifest.json)](#manifest-manifestjson)
   - [Content Script](#content-script)
   - [Background / Service Worker](#background--service-worker)
   - [Popup UI](#popup-ui)
5. [File Structure](#file-structure)
6. [Installation & Local Setup](#installation--local-setup)
7. [Usage](#usage)
8. [Status Logic](#status-logic)
9. [Tech Stack](#tech-stack)
10. [Development Notes](#development-notes)
11. [Roadmap / Future Improvements](#roadmap--future-improvements)
12. [Author](#author)

---

## Overview

**Gmail Thread Status** is a Chrome Extension that activates automatically when a user opens Gmail (`mail.google.com`). It reads the visible content of the currently open email thread and assigns a human-readable **status label** — for example `Awaiting Reply`, `Action Required`, `Resolved`, or `FYI Only` — displayed as an unobtrusive badge injected into the Gmail interface.

The goal of this project was to demonstrate:

- The ability to build a real browser-native tool with no backend dependency
- DOM observation and mutation handling inside a dynamic single-page application (Gmail)
- Lightweight NLP-style keyword classification on email thread content
- Clean extension architecture following Manifest V3 standards

---

## How It Works

```
User opens Gmail
      │
      ▼
Content Script activates on mail.google.com
      │
      ▼
MutationObserver watches for thread panel to open
      │
      ▼
Thread body text is extracted from the DOM
      │
      ▼
Status classifier runs keyword/pattern matching
      │
      ▼
Status badge is injected into the Gmail thread header
      │
      ▼
Badge updates automatically when user opens a different thread
```

The extension never sends any email data to an external server. All processing happens locally in the browser.

---

## Architecture

```
Ns-caseStudy-2/
│
├── extension/               ← Chrome Extension root (loaded in chrome://extensions)
│   ├── manifest.json        ← Extension configuration (Manifest V3)
│   ├── content.js           ← Content script: DOM injection + thread reading
│   ├── background.js        ← Service worker: lifecycle management
│   ├── classifier.js        ← Status logic: keyword matching engine
│   ├── popup.html           ← Extension popup UI (toolbar icon click)
│   ├── popup.js             ← Popup behaviour
│   ├── styles.css           ← Badge + popup styling
│   └── icons/               ← Extension icons (16, 48, 128px)
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
│
├── tests/                   ← Unit tests for classifier logic
│   └── classifier.test.js
│
├── .gitignore
└── README.md
```

---

## Chrome Extension Deep Dive

### Manifest (`manifest.json`)

The extension uses **Manifest V3**, the current standard for Chrome Extensions. Key permissions declared:

```json
{
  "manifest_version": 3,
  "name": "Gmail Thread Status",
  "version": "1.0.0",
  "description": "Surfaces a status badge inside Gmail based on thread content.",
  "permissions": ["activeTab", "scripting", "storage"],
  "host_permissions": ["https://mail.google.com/*"],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["https://mail.google.com/*"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  }
}
```

**Why `host_permissions` on `mail.google.com`?**
Manifest V3 requires explicit host permissions for content scripts to access page DOM. Without this, the content script cannot read thread content.

**Why `storage`?**
Used to persist user preferences (e.g. custom status keywords, badge colour theme) across sessions without a backend.

---

### Content Script (`content.js`)

This is the core of the extension. It runs inside every Gmail page and is responsible for:

1. **Detecting when a thread opens** — Gmail is a React-based SPA. There is no page reload when switching between threads. The content script uses a `MutationObserver` to watch for changes to the thread container DOM node.

```javascript
const observer = new MutationObserver(() => {
  const threadContainer = document.querySelector('[data-thread-id]');
  if (threadContainer) {
    processThread(threadContainer);
  }
});

observer.observe(document.body, { childList: true, subtree: true });
```

2. **Extracting thread text** — Once a thread panel is detected, it scrapes the visible text content of each email in the thread using Gmail's internal DOM selectors.

3. **Calling the classifier** — The extracted text is passed to `classifier.js` which returns a `{ status, confidence }` object.

4. **Injecting the badge** — A styled `<div>` badge is injected adjacent to the thread subject line. If a badge already exists (from a previous thread), it is replaced.

```javascript
function injectBadge(status) {
  const existing = document.getElementById('gmail-status-badge');
  if (existing) existing.remove();

  const badge = document.createElement('div');
  badge.id = 'gmail-status-badge';
  badge.className = `status-badge status-${status.toLowerCase().replace(' ', '-')}`;
  badge.textContent = status;

  const subjectLine = document.querySelector('h2[data-legacy-thread-id]');
  if (subjectLine) subjectLine.insertAdjacentElement('afterend', badge);
}
```

---

### Background / Service Worker (`background.js`)

The service worker handles extension lifecycle events:

- **`chrome.runtime.onInstalled`** — Sets default storage values on first install (default status labels, badge colours).
- **Tab activation listener** — Resets badge state when the user navigates away from Gmail.

Because Manifest V3 service workers are ephemeral (they stop when not in use), no persistent state is held here — all state lives in `chrome.storage.local`.

---

### Popup UI (`popup.html` + `popup.js`)

When the user clicks the extension icon in the Chrome toolbar, a small popup appears showing:

- The **current detected status** of the open thread
- A **legend** of all possible statuses and their colour codes
- A toggle to **enable/disable** the extension without removing it

The popup communicates with the content script via `chrome.tabs.sendMessage` / `chrome.runtime.onMessage`.

---

## File Structure

```
Ns-caseStudy-2/
├── extension/
│   ├── manifest.json       Manifest V3 config — permissions, content scripts, icons
│   ├── content.js          Main content script — DOM observer, badge injection
│   ├── background.js       Service worker — install events, tab lifecycle
│   ├── classifier.js       Status classifier — keyword rules, confidence scoring
│   ├── popup.html          Popup template — shown on toolbar icon click
│   ├── popup.js            Popup logic — reads current status, handles toggle
│   ├── styles.css          Badge styles + popup styles
│   └── icons/
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
├── tests/
│   └── classifier.test.js  Unit tests for status classification logic
├── .gitignore
└── README.md
```

---

## Installation & Local Setup

### Prerequisites

- Google Chrome (version 88+, Manifest V3 support)
- Git

### Steps

**1. Clone the repository**

```bash
git clone https://github.com/ccl08/Ns-caseStudy-2.git
cd Ns-caseStudy-2
```

**2. Open Chrome Extensions manager**

Navigate to: `chrome://extensions`

**3. Enable Developer Mode**

Toggle **Developer mode** on (top right of the page).

**4. Load the extension**

Click **Load unpacked** and select the `extension/` folder inside the cloned repo.

```
Ns-caseStudy-2/
└── extension/    ← select this folder
```

**5. Open Gmail**

Navigate to `https://mail.google.com`. The extension activates automatically on page load.

**6. Open any email thread**

A status badge will appear below the thread subject line within ~1 second of the thread opening.

---

## Usage

| Action | Result |
|---|---|
| Open Gmail | Extension activates automatically |
| Open an email thread | Status badge appears below subject |
| Switch to another thread | Badge updates to reflect new thread content |
| Click toolbar icon | Popup shows current status + controls |
| Toggle extension off | Badge hidden, no DOM changes made |

---

## Status Logic

The classifier (`classifier.js`) uses a **keyword + pattern matching** approach. Each email thread's text is scored against a set of rule definitions:

| Status | Example Triggers |
|---|---|
| `Action Required` | "please", "could you", "can you", "by [date]", "deadline", "ASAP", "urgent" |
| `Awaiting Reply` | "let me know", "waiting to hear", "following up", "any update", "please confirm" |
| `Resolved` | "thank you", "thanks", "done", "completed", "all sorted", "no further action" |
| `FYI Only` | "for your information", "just to let you know", "heads up", "no action needed" |
| `Meeting / Calendar` | "meeting", "call", "schedule", "availability", "calendar invite", "zoom" |
| `Unknown` | Default when no rule matches with sufficient confidence |

**Confidence scoring:** Each rule carries a weight. The classifier sums weights for all matching patterns and assigns the status with the highest total score. A minimum confidence threshold (default `0.3`) is required before a non-`Unknown` status is returned.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Extension platform | Chrome Extensions API (Manifest V3) |
| Language | Vanilla JavaScript (ES2020) |
| DOM observation | MutationObserver API |
| State persistence | chrome.storage.local |
| Messaging | chrome.runtime messaging API |
| Styling | CSS3 (no framework) |
| Testing | Jest (classifier unit tests) |

No external libraries, no build step, no bundler required — the extension loads directly from source files.

---

## Development Notes

**Why no backend?**
The design decision to keep everything client-side was deliberate. Email thread content is sensitive data. Sending it to an external API (even one you control) introduces latency, privacy concerns, and dependency on network availability. Local classification with keyword rules is fast, private, and works offline.

**Why MutationObserver instead of Gmail API?**
Gmail does not expose a public JavaScript API for reading thread content from within a browser extension. The Gmail REST API exists but requires OAuth authentication and is intended for server-to-server integrations. MutationObserver on the DOM gives us what we need without any auth overhead.

**Gmail SPA considerations**
Gmail's DOM structure changes between sessions and across Google Workspace vs personal accounts. The selectors in `content.js` target data attributes (`data-thread-id`, `data-legacy-thread-id`) which are more stable than class names, which Google minifies and rotates regularly.

---

## Roadmap / Future Improvements

- [ ] **LLM-backed classification** — Replace keyword rules with a call to a local or remote LLM for richer, context-aware status detection
- [ ] **Custom status labels** — Allow users to define their own statuses and keyword rules via the popup settings panel
- [ ] **Multi-thread summary view** — Show status badges on the inbox thread list view, not just inside open threads
- [ ] **Keyboard shortcut** — Trigger badge refresh manually via configurable hotkey
- [ ] **Export / reporting** — Let users export thread status history as CSV for follow-up tracking
- [ ] **Firefox support** — Adapt manifest for cross-browser compatibility using WebExtensions API

---

## Author

**Chris Céspedes**
Growth Marketing Analyst | MBA Candidate, Alliance Manchester Business School
[github.com/ccl08](https://github.com/ccl08)

---

*Built as part of the Nous Growth Associate case study process.*
