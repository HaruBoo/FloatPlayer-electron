# FloatPlayer (Electron)

[🇯🇵 日本語](./README.md) | 🇺🇸 English

A cross-platform (Windows / macOS) floating player that always stays on top. Watch YouTube, photos (screenshots, etc.), and saved videos alongside whatever else you're working on.

This is a port of the [Swift/AppKit version (macOS-only)](https://github.com/HaruBoo/FloatPlayer) to Electron, sharing a single codebase across both operating systems.

> **Note**: The developer doesn't own a Windows machine, so the Windows build is only verified automatically via GitHub Actions (windows-latest) — build and packaging succeed, but real-world interaction hasn't been manually tested. Bug reports and PRs are very welcome.

---

## Features

- **YouTube playback** — Embedded playback via the official IFrame Player API (no downloading)
- **Photo / screenshot display** — File picker, drag & drop, and clipboard paste
- **Looping local video playback**
- **Auto-floating screenshots** — Take a screenshot and a chrome-less, image-only window automatically pops up (watches Desktop on macOS, Pictures/Screenshots on Windows). Drag anywhere to move, resize freely from any edge, and adjust opacity via scroll or the right-click menu
- **Clipboard-only screenshots too** (opt-in, off by default) — Also picks up screenshots that only copy to the clipboard without saving a file (e.g. Cmd+Ctrl+Shift+4); enable it from the tray menu
- **Two independent opacity sliders** — Fade the media and the UI separately
- **Smart window layering** — Both the main panel and screenshot floating windows float on top only while active, and drop behind other apps otherwise
- **Chapter extraction** — Pulls chapter timestamps from a video's description via the YouTube Data API v3

## Requirements

- Node.js 20+

## Setup

```sh
git clone https://github.com/HaruBoo/FloatPlayer-electron.git
cd FloatPlayer-electron
npm install
npm start
```

## Building packages

```sh
npm run build:mac    # macOS .dmg
npm run build:win    # Windows installer (.exe)
npm run build:all    # both
```

`electron-builder` can produce a Windows package even from a Mac (no code signing is done, so Windows SmartScreen may show a warning).

## Usage

The interaction model matches the macOS/Swift version. See the [macOS README](https://github.com/HaruBoo/FloatPlayer#usage) for full feature details. Key differences:

- Controlled from the menu bar (macOS) or system tray icon (Windows)
- The chapter-fetching API key is stored in the browser's localStorage

## Tech Stack

Electron / Node.js / chokidar (folder watching) / YouTube IFrame Player API / YouTube Data API v3

## License

Personal project. No license has been set.
