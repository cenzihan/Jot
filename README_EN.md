<p align="center"><img src="assets/icon.png" width="88" alt="Jot icon"></p>

# Jot - Minimal ToDo Agent

<p align="center">Keep today's actions, long-term goals, and completed work in their own places. Bring your own AI when you need help.</p>

<p align="center"><a href="README.md">简体中文</a> · <a href="https://github.com/cenzihan/Jot/releases">Download</a> · <a href="docs/API.md">API docs</a></p>

Jot is a Windows desktop app. It usually stays out of the way as a small, draggable capsule. Open it to manage tasks manually or connect your own model to manage Todo and journal entries through chat. **Jot does not include API credits or require a Jot account.**

![The Today view and AI chat drawer, captured from the running app with isolated demo data](docs/images/chat.png)

> Actual app screenshot with isolated demo data and a test-model reply; no personal records or API keys are shown.

## Why Jot

Short-lived errands should not clutter your long-term list. Jot keeps three things distinct:

| Today | Todo | Completion journal |
| --- | --- | --- |
| Today's actions and ordinary quick notes | Long-term goals with optional deadlines | Finished work and simple statistics |

A Today action may link to a Todo, but completing that action **does not silently complete the whole Todo**. Ordinary notes do not inflate the completion count.

## Features

- **Bring-your-own AI agent:** Connect an OpenAI-compatible or Anthropic provider. Jot uses limited tools to create, edit, and complete records. Replies stream in the chat drawer; changes appear immediately and can be undone. Choose a model, style, and system prompt.
- **Focused task views:** Today is for this day; Todo is for longer-term goals. Review scheduled items in day, week, or month calendar views and finished work in the journal. Add an optional completion note.
- **Memory and voice:** Store preferences you confirm. Generate a short recent summary only when you ask. Configure transcription separately from chat, review the recognized text, then send it.
- **Quiet desktop entry:** The default capsule does not constantly animate. Drag it, use global shortcuts, or import a compatible Codex Pet skin.
- **Local-first records:** Your records stay on this computer. Cloud chat, transcription, or explicitly enabled agent-log summaries send relevant content to the provider you configure.

The AI can manage records and chat within Jot; it **cannot run arbitrary computer commands**. Review important dates and changes because models can make mistakes.

## Default appearance

**Black Default** is the quiet desktop capsule. Open the panel only when you need it.

![Jot Black Default capsule](docs/images/default-black.png)

## Quick start

1. Download the Windows archive from [Releases](https://github.com/cenzihan/Jot/releases). Extract the **entire** folder and run `Jot.exe`; do not move only the exe. The package is currently unsigned.
2. Manual task management works without AI. For chat, enter your own API base URL, model, and key in Settings; configure speech separately. Settings save automatically.
3. `Ctrl + Shift + J` opens the panel; `Ctrl + Shift + Space` starts or stops recording. `Enter` sends a chat message and `Shift + Enter` adds a line break.

## Repository layout

| Directory | Purpose |
| --- | --- |
| `src/` | Electron app, task data layer, AI services, and UI |
| `assets/` | App icon, fonts, and licenses |
| `docs/` | API notes, screenshots, and design history |
| `test/` | Unit and UI tests with isolated data |

Development requires Windows and Node.js 24+: `npm ci`, `npm start`, `npm test`, and `npm run test:ui`. See the [API docs](docs/API.md) and [agent guide](AGENTS.md).

## Privacy and license

Runtime records live in `%APPDATA%\Shiban` for backward compatibility, outside the repository. API keys are encrypted locally and are not included in source or exports. Exports may still contain personal data; do not commit them. Back up your data before downgrading, because older versions may not understand newer records.

Source code is [MIT licensed](LICENSE). Third-party fonts and pet artwork retain their own licenses.
