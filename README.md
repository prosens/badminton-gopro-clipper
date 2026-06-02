# 🏸 Badminton GoPro Video Clipper & Stitcher

A professional, local-first web application designed for badminton players to virtually scrub, clip, and stich continuous GoPro match recordings into individual, lossless game-specific videos in seconds. Features an integrated **double-clickable native macOS launcher** and **automated YouTube uploads** directly to specific channel playlists!

---

## ⚡ Key Features

1. **✂️ Lossless Chapter Stitching**: Uses `ffmpeg` to split and stitch games across GoPro file boundaries without re-encoding, preserving 100% original video/audio quality with zero rendering latency.
2. **📈 Continuous Visual Timeline**: Maps multiple continuous files into a single virtual player, letting you scrub across file chapters seamlessly.
3. **🚀 Double-Clickable macOS App**: Packaged into a native `Badminton GoPro Clipper.app` bundle with a custom high-resolution neon-green icon and background process automation.
4. **📁 YouTube Playlists Selection & Creation**: Connects directly to the YouTube Data API to list active playlists, create new playlists on-the-fly, and assign uploads automatically.
5. **⏳ Asynchronous Auto-Uploads**: Auto-uploads completed splits in the background while subsequent game exports continue in parallel!
6. **👥 Global Multi-Profile Manager**: Easily switch between multiple YouTube channel profiles or run in offline/simulation mode with a single click.

---

## 📂 Project Structure

```
badminton-game-cutter/
├── Badminton GoPro Clipper.app/   # Native double-clickable macOS App Bundle
├── public/                       # Frontend SPA (HTML5 player, styling, timeline controller)
│   ├── app.js                    # Core player scrubbing, splits, and API connector logic
│   ├── index.html                # Cyber-athletic glassmorphic workspace layout
│   └── style.css                 # Vibrant dark-indigo/neon-green styling system
├── server.js                     # Express.js backend (FFmpeg cuts stream, YouTube API controller)
├── package.json                  # Application dependency declarations
└── .gitignore                    # Local storage and credentials exclude rules
```

---

## 🛠️ Installation & Setup

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) and [FFmpeg](https://ffmpeg.org/) installed on your machine.
*(If you are on macOS with Homebrew, simply run `brew install node ffmpeg`).*

### 1. Install Dependencies
Navigate to the project folder and install the Express backend dependencies:
```bash
npm install
```

### 2. Start the Application

#### Option A: Native macOS App (Recommended)
Simply double-click the **`Badminton GoPro Clipper`** application inside this folder!
- You will receive a native macOS system notification.
- The backend server will automatically boot in the background.
- Your default web browser will open instantly to `http://localhost:4000`.
- *Note: You can copy or move the `Badminton GoPro Clipper.app` to your `/Applications` folder or Desktop for immediate access.*

#### Option B: Terminal Startup
If you prefer running it from the command line:
```bash
npm start
```
Then, open your browser and navigate to **`http://localhost:4000`**.

---

## 🔒 Security & Local Data Persistence
All login tokens, client credentials, and profile settings are stored **strictly locally** on your machine inside `global_youtube_profiles.json`. This file is gitignored by default to prevent uploading your private tokens/secrets to public GitHub repositories.
