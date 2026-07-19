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
- **Player-level detail is genuinely there, not just team-level.** Once we
  understood the schema, we could resolve real scorer and booked-player
  names — including correctly distinguishing penalty goals from open-play
  goals — by cross-referencing lineup data against event player IDs. That
  level of granularity, available live, let us build a noticeably richer
  product than a generic "Team A 1-0 Team B" alert bot.
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
4. **`/api/scores/snapshot/{fixtureId}` sometimes returns stale data during
   live play — confirmed directly, not assumed, via repeated polling and
   cross-checking against real match state.** We observed two distinct
   patterns of this, both on real World Cup fixtures:

   - **Full freeze:** the entire snapshot response — the internal `Seq`
     counter, the match clock, and every stat — stops advancing
     completely, even though the match is actively continuing. We
     confirmed this twice: once mid-match (a fixture stuck showing a 0-3
     score with the clock reading `Seconds: 0`, `Running: false`, while
     the real match had reached 4-6 — verified against
     `/api/scores/historical/`, which had the complete, correct record
     the whole time, proving the underlying data collection was fine and
     only the live-serving layer had stalled), and again later, live on
     the World Cup Final itself (FixtureId `18257739`), where we polled
     `/snapshot` every 5 seconds for over a minute — matching our bot's
     real polling cadence exactly — and captured `Seq` and the clock's
     `Seconds` value both frozen at the same numbers (`Seq 1173`, `6300s`)
     across at least 8 consecutive polls, while play was confirmed
     actively ongoing (not paused, mid-extra-time) at the time. Every
     poll returned a clean `HTTP 200` with no rate-limit headers present,
     ruling out client-side throttling as the cause. (We didn't log the
     `Running` flag specifically during this second freeze, only
     `Seconds`, so we can't say for certain whether the API was reporting
     `Running: true` or `false` in that exact window — worth a more
     precise follow-up test if we get the chance.) This second freeze
     resolved on its own a few minutes later, with no action taken on our
     end — `Seq` and the clock picked back up and continued advancing
     normally, confirming the stall was transient rather than a permanent
     break in the feed for that fixture.
   - **Delayed, batched event delivery (confirmed):** the match clock
     itself kept advancing in real time throughout, but a specific stat
     (`corners`) did not reflect what was actually happening on the pitch
     as it happened — it lagged significantly behind, then jumped
     straight to the correct number once it finally caught up, rather
     than updating incrementally as each real corner occurred. We polled
     `/snapshot` on the same Final fixture (`18257739`) twice, ~4.5
     minutes apart, and saw `Seq` move `707 → 765` and the clock move
     `4351s → 4622s` — both advancing completely normally — while
     `corners` stayed stuck at `2-1` (3 total) both times, even though
     the real match had genuinely reached 9 total corners by then
     (confirmed against a live broadcast). Checking again later, once the
     match clock had reached 113 minutes, the snapshot had finally caught
     up — `corners` jumped straight to `8-1`, reflecting events that had
     actually happened several real-time minutes earlier, delivered all
     at once rather than as they occurred. Goals, yellow cards, and red
     cards did not show this same lag in the same window. Since
     `/snapshot` holds exactly one "latest" entry per event type (see
     point #1), this suggests the corner event type's slot specifically
     fell behind and only periodically catches up, rather than updating
     live — worth investigating for anything built around real-time,
     as-it-happens alerting.

   We can't say for certain how often either pattern occurs or what
   triggers them, but both are real, reproducible, and worth flagging —
   especially for anything built around must-not-miss live alerting.

Overall: a genuinely capable, fast-to-integrate API once these quirks are
understood — most of our build time went into handling real-data edge
cases (event clustering, non-chronological ordering, penalty vs.
open-play goal shapes) rather than fighting the API surface itself. The
live-reliability stalls (points #4-6) were the most significant issue we
encountered, and — given they recurred multiple times on the World Cup
Final itself — are the one thing we'd most want the TxLINE team to
investigate before builders rely on `/snapshot` for time-critical, must-
not-miss consumer alerting at scale.
