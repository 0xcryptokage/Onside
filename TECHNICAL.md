# Onside — Technical Documentation

## Core Idea
Onside is a live World Cup companion for fans watching on their phone. It
runs two things simultaneously, powered entirely by TxLINE as the live data
source:

1. **Live event alerts** — automatically posts branded cards to Telegram
   and X the moment a goal, yellow card, red card, or corner happens,
   including the real player's name (resolved from TxLINE's lineup data),
   pulled straight from the live match feed — no manual updates.
2. **A four-part prediction game** — "Who wins?", "How many total goals?",
   "How many yellow cards?", "How many red cards?" — posted in a staggered
   sequence after kickoff. Fans reply with their guess; TxLINE's live data
   resolves the winner automatically once the match ends (closest guess
   wins for the numeric games), and the bot posts a "Called it first!"
   card quoting the winner's actual reply next to their profile picture.

## Business / Technical Highlights
- **Zero manual operation.** Once running, the entire event → detect →
  render → post pipeline is autonomous, driven purely by TxLINE data
  changes.
- **Player-level detail**, not just team-level — goal scorers and booked
  players are resolved by name using TxLINE's per-match lineup data,
  cross-referenced against goal/card event player IDs.
- **Runs on TxLINE's free, real-time World Cup tier (service level 12)**
  via a real Solana mainnet subscription — no paid data feed needed to
  operate.
- **Monetization path:** the prediction game format is a natural fit for
  sponsor-branded prediction cards per match, or a premium leaderboard /
  streak-tracking tier across the full 104-game tournament.

## TxLINE Endpoints Used
- `GET /api/fixtures/snapshot` — fetches the current World Cup fixture
  list; used to detect when a match has kicked off.
- `GET /api/scores/snapshot/{fixtureId}` — the core live-polling endpoint,
  called every 5 seconds per live fixture to detect goals/cards/corners
  and pull player lineup data.
- `GET /api/scores/historical/{fixtureId}` — used for post-match
  verification and debugging (see feedback below).
- `POST /auth/guest/start` + `POST /api/token/activate` — mainnet API
  token activation flow.
- **On-chain:** the `subscribe` instruction on TxLINE's mainnet program
  (`9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA`), service level 12,
  for the free real-time World Cup tier.

---

# Feedback on the TxLINE API

**What we liked:**
- The free, real-time World Cup tier or mainnet is a genuinely
  frictionless way for a hackathon builder to get real, live-quality
  access — no paywall, just a low-cost on-chain subscribe call.
- The normalised stat-key schema (goals/cards/corners as consistent
  numeric keys across competitions) made the core detection logic simple
  once understood.

**Where we hit friction:**
1. **`/api/scores/snapshot/{fixtureId}` returns exactly ONE entry per
   event type (the latest), not a full event log.** This wasn't obvious
   from the docs — we only discovered it by testing, and it directly
   affects anyone trying to build scorer-name or player-level detail
   features on top of the live snapshot.
2. **The snapshot response array is sorted alphabetically by `Action`
   name, not chronologically.** This caused a real, hard-to-spot bug in
   our code — we were displaying a stale match clock because we assumed
   array order reflected time order. Worth calling out explicitly in the
   docs, since it's a natural (and wrong) assumption.
3. **Docs/code mismatch on `/api/scores/updates/{fixtureId}`** — the
   Quickstart example shows this as a plain `axios.get` call returning
   JSON, but in practice it returns a `text/event-stream` (SSE) response,
   which broke on first try until we built our own SSE parser.
4. **We experienced an extended live-data stall** on `/snapshot` for one
   real fixture — the endpoint kept returning identical, frozen data for
   an extended period while the match continued (confirmed via the
   `/historical` endpoint, which had the complete, correct data the whole
   time). Worth flagging as a live-reliability edge case, since the
   underlying data collection was fine — only the live-serving layer
   stalled.

Overall: a genuinely capable, fast-to-integrate API once these quirks are
understood — most of our build time went into handling real-data edge
cases (event clustering, non-chronological ordering, penalty vs.
open-play goal shapes) rather than fighting the API surface itself.
