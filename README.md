# YouTube Playlist Progress Tracker

A Manifest V3 Chrome extension that automatically tracks your progress through YouTube playlists.

## Features

- **Auto-detection** – detects when you open a YouTube playlist and activates instantly
- **Watched video tracking** – detects watched videos via YouTube's red progress bar
- **Topic extraction** – automatically extracts meaningful keywords from video titles and displays them as a tag cloud
- **Persistent storage** – progress is saved per playlist even after closing the browser
- **SPA navigation support** – works seamlessly with YouTube's single-page app navigation
- **Draggable popup** – drag the popup anywhere on screen
- **Reset progress** – one-click reset for any playlist

## Installation

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `youtube-playlist-tracker` folder
5. The extension is now active!

## Usage

1. Navigate to any YouTube playlist page (URL contains `youtube.com/playlist?list=`)
2. The **Playlist Progress** popup appears in the top-right corner
3. It automatically detects which videos you've started watching
4. Topics are extracted from video titles and shown as chips
5. Click **↺ Reset Progress** to clear saved data for that playlist
6. Click **✕** to dismiss the popup (it reappears on next navigation)

## File Structure

```
youtube-playlist-tracker/
├── manifest.json      # Extension manifest (MV3)
├── content.js         # Main content script (scan, render, SPA watcher)
├── utils.js           # Topic extraction + storage + DOM helpers
├── styles.css         # Popup UI styles (dark theme)
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## How Watched Detection Works

YouTube renders a red `#progress` element under each video thumbnail with a `width` style property indicating how far through the video the user has watched. Any video with `width > 0%` is counted as "watched/started".

## Notes

- Only `storage` permission is required — no special permissions needed
- Data is stored locally via `chrome.storage.local` keyed by playlist ID
- The extension rescans every 2 seconds while on a playlist page to pick up newly watched videos
