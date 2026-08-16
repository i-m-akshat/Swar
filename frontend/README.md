# Swar Frontend — User Interface & Media Intelligence Client 🖥️✨

The **Swar Frontend** is a modern, responsive web application built with **React 18**, **Vite**, and **Vanilla CSS**. It provides synchronized media playback, real-time transcript exploration, dynamic speaker turn colorization, live search highlighting, and biometric voiceprint profile management.

---

## 📑 Table of Contents
1. [Key Features](#-key-features)
2. [Component Architecture](#-component-architecture)
3. [Design System & CSS Tokens](#-design-system--css-tokens)
4. [Development & Build Workflow](#-development--build-workflow)
5. [Environment Configuration](#-environment-configuration)

---

## 🌟 Key Features

* **Synchronized Interactive Playback:** Click any dialogue line in the transcript to jump the video/audio player to the exact millisecond.
* **Variable Playback Speed Controls:** Switch dynamically between `0.75x`, `1.0x`, `1.25x`, `1.5x`, and `2.0x`.
* **Multilingual Selector & Task Switcher:** Choose from 99+ languages or activate English translation mode with a single dropdown.
* **Live Keyword Search:** Instant yellow keyword highlighting (`<mark class="search-highlight">`) across dialogue text.
* **Speaker Roster & Turn Analytics:** View total turn counts per speaker with individual color-coded chips.
* **In-Place Speaker Renaming:** Rename any speaker across the entire recording in 1 click.
* **Biometric Voiceprint Hub:** Modal interface to view enrolled speaker profiles, sample counts, and GDPR delete actions.
* **Export Hub:** Copy clean transcripts to clipboard, download `.txt` transcripts, or export `.srt` subtitle files.
* **System Telemetry HUD:** Displays real-time Whisper GPU decoding latency, Diarization latency, and language detection confidence.

---

## 🏗️ Component Architecture

```text
src/
├── App.jsx                  # Main application component & state coordinator
│   ├── Header Bar           # Logo, telemetry pills, and Voiceprint Library trigger
│   ├── Upload Hub           # File picker, language selector, task mode, process button
│   ├── Main Grid
│   │   ├── Player Panel     # HTML5 video/audio player, playback speed chips, telemetry HUD, speaker roster
│   │   └── Transcript Panel # Search bar, speaker filter dropdown, export buttons, synchronized dialogue turns
│   ├── Speaker Rename Modal # In-place turn renaming + voiceprint enrollment checkbox
│   ├── Voiceprint Library   # GDPR-compliant profile viewer and deletion modal
│   └── Telemetry History    # Historical benchmark analytics table
├── index.css                # Global design system, HSL color tokens, typography, and dark theme
└── main.jsx                 # React root DOM mount
```

---

## 🎨 Design System & CSS Tokens

The interface uses a curated dark palette defined via CSS variables in [`src/index.css`](src/index.css):

```css
:root {
  --bg-base: hsl(222, 16%, 6%);
  --bg-surface: hsl(222, 14%, 10%);
  --bg-elevated: hsl(222, 14%, 14%);
  --bg-hover: hsl(222, 14%, 18%);

  --accent-primary: hsl(38, 92%, 50%);       /* Vibrant Amber */
  --accent-primary-dim: hsl(38, 60%, 20%);
  --accent-success: hsl(150, 70%, 45%);      /* Status Green */
  --accent-info: hsl(210, 80%, 55%);         /* Info Blue */

  --text-primary: hsl(220, 20%, 95%);
  --text-secondary: hsl(220, 10%, 65%);
  --text-muted: hsl(220, 10%, 45%);

  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
}
```

### Speaker Color System:
Distinct semantic color classes (`.spk-1` through `.spk-6`) ensure consistent, high-contrast visual differentiation between dialogue participants.

---

## 🚀 Development & Build Workflow

### Prerequisites:
* **Node.js:** v18.0+ or v20.0+
* **npm:** v9.0+

### 1. Install Dependencies
```bash
cd frontend
npm install
```

### 2. Run Local Development Server
```bash
npm run dev
```
The development server will start at `http://localhost:5173`. Vite proxies API requests to the Fastify backend on port `3000`.

### 3. Production Build
```bash
npm run build
```
Generates optimized static assets in the `dist/` directory, ready to be served by Nginx or static CDNs (Cloudflare Pages, Vercel, Netlify).

---

## 🔧 Environment Configuration

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `VITE_API_URL` | `/api` | Base path for API requests (proxied to backend) |
