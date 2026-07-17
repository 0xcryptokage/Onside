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
 * ASSUMPTION TO VERIFY: this assumes each event's `Stats` object uses the
 * same base key numbers confirmed for on-chain proofs (1/2 goals, 3/4
 * yellow cards, 5/6 red cards, 7/8 corners, full-game). The raw snapshot
 * stream may report these under period-offset keys instead (e.g.
 * 1001/2001 for first half). Run this against one real live match and
 * console.log(events) before trusting it fully — see README.
 */
function extractMatchState(events) {
  const stats = {}; // statKey -> latest value
  let clock = null;
  let latestSeq = 0;
  let gameFinalised = false;

  for (const e of events) {
    if (e.Seq > latestSeq) latestSeq = e.Seq;
    if (e.Clock) clock = e.Clock;
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

module.exports = { getWorldCupFixtures, isKickedOff, getScoreSnapshot, extractMatchState };
