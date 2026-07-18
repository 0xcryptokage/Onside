# Onside — live World Cup alerts, verified predictions

Watches live World Cup fixtures via TxLINE, detects real match events (by
watching the actual stat numbers change — goals, cards — not by guessing
at event labels), renders branded alert cards, and posts them to Telegram
and Twitter/X. Also runs a "who wins?" prediction game on both platforms:
fans reply with their pick within a 30-minute window, and whoever called
it first (and correctly) gets their own decorative "Called it first!" card.

## What it does

- **Goal / Yellow Card / Red Card alerts** — auto-detected, auto-posted,
  with a randomized template pick per event type for visual variety
- **"Who wins?" prediction prompts** — posted at kickoff, image-based,
  inviting replies on both Telegram and Twitter/X
- **30-minute reply window** — predictions after the window closes are
  ignored, even if fetched late
- **"Called it first!" resolution** — at full time, finds whoever predicted
  correctly earliest (per platform, independently) and posts a card with
  their real profile picture

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env` — see the comments in `.env.example` for what each variable
is and where to get it. The two less obvious ones:

- **`TELEGRAM_DISCUSSION_GROUP_ID`** — your channel needs a *linked
  discussion group* for people to be able to reply at all (a Telegram
  channel alone is broadcast-only). See "Setting up the discussion group"
  below.
- **`TWITTER_BEARER_TOKEN`** — a separate, read-only credential from your
  posting keys, needed specifically to search/read replies.

Then run:
```bash
node index.js
```

## Finding your Telegram chat ID

1. Add your bot to the group/channel you want it posting in
2. Send any message in that chat
3. Visit `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in a browser
4. Look for `"chat":{"id": ...}` in the response

## Setting up the discussion group (for predictions to work)

A Telegram channel can't receive direct replies by default. To let people
predict:

1. Create a new Telegram group
2. In your channel's settings → **Discussion** → link that group
3. Add your bot to the new group too, as an admin
4. Send a test message in the group, check `getUpdates` the same way as
   above — the group's `chat.id` (shown as `type: "supergroup"`) is your
   `TELEGRAM_DISCUSSION_GROUP_ID`
5. **Recommended**: turn off "Remain Anonymous" for admins in the group's
   settings — otherwise admin replies (including your own testing) show up
   under the generic `GroupAnonymousBot` identity instead of a real
   username, and we can't fetch a profile picture for that.

## Setting up Twitter/X

1. Go to developer.x.com, apply for a developer account (pay-per-use
   pricing as of Feb 2026 — posting costs ~$0.015/tweet, reading costs
   less; a few dollars covers a full hackathon demo comfortably)
2. Create a Project + App
3. **Critical**: set permissions to "Read and Write" *before* generating
   your Access Token — if you generate the token first and change
   permissions after, you'll need to regenerate the token
4. Generate all five credentials: API Key, API Key Secret, Access Token,
   Access Token Secret, and the separate read-only **Bearer Token**
5. Add all five to `.env`, plus `TWITTER_BOT_USERNAME`
6. The bot activates Twitter posting automatically once these are present
   — no code changes needed

Until configured, the bot works completely fine on Telegram alone —
Twitter posting/reading just silently skips with a log message.

## Testing the prediction flow without a live match

Three scripts let you test the whole predict → reply → resolve flow using
a fake fixture, without waiting for a real match:

```bash
node test-predict-post.js     # posts the "WHO WINS?" prompt
# → go reply to it yourself, on Telegram and/or Twitter
node test-predict-check.js    # fetches + parses your reply
node test-predict-resolve.js France   # simulates "France won", posts the winner card
```

`test-predict-post.js` has a `POST_TO_TWITTER` toggle at the top — set to
`false` to test Telegram only, without spending any X API credits.

## Known limitations (being upfront about these)

- **No player-level data** — TxLINE's feed (as far as we've confirmed by
  actually testing it) only gives team-level stat changes, not who
  scored/was booked. Cards show the team, not the player.
- **Draws aren't resolvable in the prediction game** — the current design
  only matches team-name predictions, so if a match ends in a draw, nobody
  can have "predicted" that outcome correctly. Known gap, not a bug.
- **Simultaneous events**: if both teams score/get booked within the same
  ~12-second poll window, only one card posts (defaults to the home team).
  Rare edge case.
- **Reply-window resolution timing**: matching a reply to a specific
  prompt on Telegram uses a simplified "any message in the discussion
  group during the 30-minute window" rule, rather than strict reply-chain
  matching (which would need extra complexity around Telegram's
  channel-to-group auto-forwarding).
- **Prediction prompt template**: currently reuses the goal card
  backgrounds. A dedicated background is planned but not yet built.

## Project structure

```
index.js                    — main polling loop (goals/cards, prompts, resolution)
lib/txlineAuth.js           — JWT/API token management with auto-refresh
lib/txlineData.js           — fixture + score fetching, stat diffing
lib/cardRenderer.js         — all card rendering (goal/yellow/red/prompt/winner)
lib/telegramPoster.js       — Telegram sendPhoto
lib/telegramReader.js       — Telegram discussion group message reading
lib/twitterPoster.js        — Twitter/X posting
lib/twitterReader.js        — Twitter/X reply reading + parsing
lib/predictionStore.js      — platform-independent prediction tracking
lib/state.js                — persisted dedup state for match stats
data/teamFlags.js           — team name → flag PNG mapping
assets/templates/           — goal/yellow/red card template PNGs
assets/flags-png/           — 271 pre-rendered flag PNGs
assets/fonts/                — bundled Poppins font files
assets/ball_circle.png      — pre-masked ball graphic
test-predict-*.js           — manual prediction-flow test scripts
```
