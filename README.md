<<<<<<< HEAD
# Onside — live World Cup goal alerts

Watches all live World Cup fixtures via TxLINE, detects real goals (by
watching the actual goal-count stats change, not by guessing at event
labels), renders a branded alert card, and posts it to Telegram (and
Twitter/X once configured).

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:
- `TXLINE_API_TOKEN` — already have this from earlier testing
- `TELEGRAM_BOT_TOKEN` — from BotFather (you already have this)
- `TELEGRAM_CHAT_ID` — the chat/channel/group ID to post into (see below
  for how to find it)

Then run:
```bash
node index.js
```

## Finding your Telegram chat ID

1. Add your bot to the group/channel you want it posting in
2. Send any message in that chat
3. Visit `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in a browser
4. Look for `"chat":{"id": ...}` in the response — that number (often
   negative for groups) is your `TELEGRAM_CHAT_ID`

## Setting up Twitter/X (optional, do this whenever ready)

1. Go to developer.x.com, apply for a developer account
2. Create a Project + App
3. **Critical**: in the app's settings, set permissions to "Read and Write"
   (defaults to read-only)
4. Generate API Key, API Key Secret, Access Token, Access Token Secret
5. Add all four to `.env`
6. `npm install twitter-api-v2`
7. The bot will automatically start posting to both platforms — no code
   changes needed, `twitterPoster.js` already checks for these and
   activates itself

Until then, the bot works completely fine on Telegram alone — Twitter
posting just silently skips with a log message.

## What's verified vs. what needs a real test

**Verified working** (proven in earlier testing sessions):
- TxLINE auth flow (JWT + API token + 401 auto-refresh)
- Fixture list fetching
- Card rendering layout (proven in Python/Pillow, ported to node-canvas
  with the same logic)
- Flag mapping + fallback behavior (skip both flags if either team is
  unmapped)

## Project structure

```
index.js                 — main polling loop
lib/txlineAuth.js         — JWT/API token management
lib/txlineData.js         — fixture + score fetching, stat diffing
lib/cardRenderer.js       — node-canvas card rendering
lib/telegramPoster.js     — Telegram sendPhoto
lib/twitterPoster.js      — Twitter/X posting (stub until configured)
lib/state.js              — persisted dedup state
data/teamFlags.js         — team name → flag PNG mapping
assets/templates/         — the two goal card template PNGs
assets/flags-png/         — 271 pre-rendered flag PNGs
assets/fonts/             — bundled Poppins font files
assets/ball_circle.png    — pre-masked ball graphic
```
=======
# Onside
>>>>>>> edffaa8a7bce5d6ea78edac01ddce9ab4e18b82c
