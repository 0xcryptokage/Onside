const { callWithAuth } = require("./txlineAuth");

const API_TOKEN = process.env.TXLINE_API_TOKEN;

async function getWorldCupFixtures() {
  const fixtures = await callWithAuth("/api/fixtures/snapshot", API_TOKEN);
  return fixtures.filter((f) => f.Competition === "World Cup");
}

/**
 * A fixture is "live" if kickoff has passed and it hasn't been finalized.
 * We don't have a clean single boolean from the fixtures snapshot, so we
 * treat anything with StartTime in the past and no explicit finish marker
 * as a candidate, then let the score snapshot confirm actual live state.
 */
function isKickedOff(fixture) {
  return fixture.StartTime <= Date.now();
}

async function getScoreSnapshot(fixtureId) {
  return callWithAuth(`/api/scores/snapshot/${fixtureId}?asOf=${Date.now()}`, API_TOKEN);
}

/**
 * Reduces the raw event array from a score snapshot into the current
 * known values for goals/cards/corners, plus the latest match clock.
 *
 * Stat key mapping CONFIRMED against the official docs
 * (documentation/scores/soccer-feed): 1/2 goals, 3/4 yellow cards,
 * 5/6 red cards, 7/8 corners — full-game totals (period prefix 0).
 */
/**
 * Reduces the raw event array from a score snapshot into the current
 * known values for goals/cards/corners, plus the latest match clock.
 *
 * Stat key mapping CONFIRMED against the official docs
 * (documentation/scores/soccer-feed): 1/2 goals, 3/4 yellow cards,
 * 5/6 red cards, 7/8 corners — full-game totals (period prefix 0).
 *
 * CLOCK SELECTION: the event array is NOT chronologically ordered — it's
 * sorted alphabetically by Action name (confirmed against real snapshot
 * data). So the clock must be taken from whichever event has the HIGHEST
 * Seq among events carrying a Clock field, not just "whichever comes last
 * in array iteration order" — the earlier version of this function did
 * the latter, which caused cards to show a stale/zero match clock
 * whenever an early, alphabetically-later event (e.g. "weather",
 * "venue") happened to override a genuinely later one.
 */
function extractMatchState(events) {
  const stats = {}; // statKey -> latest value
  let clock = null;
  let clockSeq = -Infinity;
  let latestSeq = 0;
  let gameFinalised = false;

  for (const e of events) {
    if (e.Seq > latestSeq) latestSeq = e.Seq;
    if (e.Clock && (e.Seq ?? -Infinity) > clockSeq) {
      clock = e.Clock;
      clockSeq = e.Seq ?? -Infinity;
    }
    if (e.Action === "game_finalised") gameFinalised = true;
    if (e.Stats) {
      for (const [key, value] of Object.entries(e.Stats)) {
        stats[key] = value;
      }
    }
  }

  return {
    goalsHome: stats["1"] ?? 0,
    goalsAway: stats["2"] ?? 0,
    yellowHome: stats["3"] ?? 0,
    yellowAway: stats["4"] ?? 0,
    redHome: stats["5"] ?? 0,
    redAway: stats["6"] ?? 0,
    cornersHome: stats["7"] ?? 0,
    cornersAway: stats["8"] ?? 0,
    clock,
    latestSeq,
    gameFinalised,
  };
}

/**
 * Turns a feed name like "Henderson, Jordan" or "James, Reece (1999)"
 * into a display-friendly "Jordan Henderson" / "Reece (1999) James".
 * Falls back to the raw string if there's no comma to split on.
 */
function formatDisplayName(rawName) {
  if (!rawName) return rawName;
  const commaIndex = rawName.indexOf(",");
  if (commaIndex === -1) return rawName;

  const last = rawName.slice(0, commaIndex).trim();
  const first = rawName.slice(commaIndex + 1).trim();
  return `${first} ${last}`.trim();
}

/**
 * Builds a playerId -> real display name lookup from the Lineups block
 * in a score snapshot.
 *
 * CONFIRMED against real data (Mexico v England, FixtureId 18192996):
 * the snapshot includes ONE entry with a top-level `Lineups` array (one
 * object per team). Each team object has:
 *   - preferredName: the TEAM name (e.g. "Mexico") — not a player
 *   - lineups: array of player entries, each with:
 *       - player.normativeId  <- THIS is the id that matches PlayerId
 *                                 on goal/card events, NOT fixturePlayerId
 *       - player.preferredName <- "Lastname, Firstname" format
 *
 * Cross-checked: a goal event with Data.PlayerId === 658987 matched
 * player.normativeId === 658987 ("Quinones Quinones, Julian Andres"),
 * and PlayerStats also used 658987 as its key. All three data points
 * agree, so normativeId is the correct join key.
 *
 * Note: this Lineups block only appears ONCE per match in the snapshot
 * (near kickoff), not on every poll. Callers should extract it once and
 * cache the result — see getPlayerNamesForFixture() below — rather than
 * expecting it on every call to getScoreSnapshot().
 */
function extractPlayerNames(events) {
  const names = new Map(); // normativeId (number) -> display name (string)

  for (const e of events) {
    const teamGroups = e.Lineups;
    if (!Array.isArray(teamGroups)) continue;

    for (const team of teamGroups) {
      const players = team.lineups;
      if (!Array.isArray(players)) continue;

      for (const entry of players) {
        const id = entry.player?.normativeId;
        const rawName = entry.player?.preferredName;
        if (id != null && rawName) {
          names.set(id, formatDisplayName(rawName));
        }
      }
    }
  }

  return names;
}

// In-memory cache: fixtureId -> Map(playerId -> name)
// The Lineups block is only present once per match, so we grab it the
// first time we see it and reuse it for the rest of that match's polling.
const playerNameCacheByFixture = new Map();

/**
 * Gets the playerId -> name map for a fixture, extracting it from the
 * given events if present and caching it, or falling back to whatever
 * was cached from an earlier poll of the same fixture.
 */
function getPlayerNamesForFixture(fixtureId, events) {
  const extracted = extractPlayerNames(events);
  if (extracted.size > 0) {
    playerNameCacheByFixture.set(fixtureId, extracted);
    return extracted;
  }
  return playerNameCacheByFixture.get(fixtureId) || new Map();
}

/**
 * Finds the PlayerId of whoever scored in the most recent goal.
 *
 * CONFIRMED against a full real match replay (Mexico v England,
 * FixtureId 18192996, /api/scores/historical/) two important things
 * the original implementation got wrong:
 *
 * 1. NOT ALL GOALS ARE `Action: "goal"`. Penalty goals come through as
 *    `Action: "penalty_outcome"` with `Data.Outcome === "Scored"` — they
 *    never carry GoalType. In this real match, 2 of the 5 total goals
 *    were scored penalties. The old code only checked for GoalType, so
 *    it would have silently misattributed both penalty goals to
 *    whichever player scored the last open-play goal instead.
 *
 * 2. EVENTS ARRIVE IN "CLUSTERS", NOT ONE CLEAN EVENT PER GOAL. Each
 *    real goal shows up as 2-3 events at the identical Clock.Seconds,
 *    progressively gaining detail as it's confirmed (bare -> +GoalType
 *    -> +PlayerId). Only the LAST event in a cluster has the PlayerId.
 *
 * 3. EVENT ARRAYS AREN'T NECESSARILY CHRONOLOGICAL. The /snapshot
 *    endpoint returns entries sorted alphabetically by Action, not by
 *    time. So "most recent" must be determined by comparing Seq values
 *    directly, not by scanning array order.
 *
 * This function collects every scoring-type event that has a resolved
 * PlayerId (i.e. survived its cluster's refinement), then returns the
 * one with the highest Seq — regardless of where it sits in the array.
 */
function findLatestScorerId(events) {
  let best = null; // { seq, playerId }

  for (const e of events) {
    const isOpenPlayGoal = e.Action === "goal" && e.Data && e.Data.GoalType;
    const isPenaltyGoal = e.Action === "penalty_outcome" && e.Data && e.Data.Outcome === "Scored";

    if (!isOpenPlayGoal && !isPenaltyGoal) continue;
    if (e.Data.PlayerId == null) continue; // still an unresolved cluster entry

    const seq = e.Seq ?? -Infinity;
    if (!best || seq > best.seq) {
      best = { seq, playerId: e.Data.PlayerId };
    }
  }

  return best ? best.playerId : null;
}

/**
 * Finds the PlayerId of whoever was booked in the most recent yellow or
 * red card event. Same cluster/ordering logic as findLatestScorerId
 * (events arrive as multi-entry clusters at the same Clock.Seconds, only
 * the last one has PlayerId; array order isn't chronological, so Seq
 * must be compared directly) — confirmed against real match data where
 * both yellow_card and red_card events do carry Data.PlayerId once
 * resolved (unlike corners/free_kicks, which never get player-level data).
 *
 * @param {Array} events
 * @param {"yellow_card"|"red_card"} action
 */
function findLatestCardPlayerId(events, action) {
  let best = null; // { seq, playerId }

  for (const e of events) {
    if (e.Action !== action) continue;
    if (!e.Data || e.Data.PlayerId == null) continue; // unresolved cluster entry

    const seq = e.Seq ?? -Infinity;
    if (!best || seq > best.seq) {
      best = { seq, playerId: e.Data.PlayerId };
    }
  }

  return best ? best.playerId : null;
}

module.exports = {
  getWorldCupFixtures,
  isKickedOff,
  getScoreSnapshot,
  extractMatchState,
  extractPlayerNames,
  getPlayerNamesForFixture,
  findLatestScorerId,
  findLatestCardPlayerId,
  formatDisplayName,
};
