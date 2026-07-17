require("dotenv").config();
const path = require("path");
const {
  getWorldCupFixtures,
  isKickedOff,
  getScoreSnapshot,
  extractMatchState,
} = require("./lib/txlineData");
const { renderGoalCard } = require("./lib/cardRenderer");
const { postGoalCard } = require("./lib/telegramPoster");
const { postGoalTweet, isConfigured: twitterReady } = require("./lib/twitterPoster");
const { loadState, saveState } = require("./lib/state");

const POLL_INTERVAL_MS = 12_000;
const BALL_IMAGE = path.join(__dirname, "assets/ball_circle.png");

async function checkFixture(fixture, state) {
  const key = String(fixture.FixtureId);
  const prev = state[key] || { goalsHome: 0, goalsAway: 0, latestSeq: 0 };

  let snapshotEvents;
  try {
    snapshotEvents = await getScoreSnapshot(fixture.FixtureId);
  } catch (err) {
    console.error(`Failed to fetch snapshot for fixture ${key}:`, err.message);
    return;
  }

  const current = extractMatchState(snapshotEvents);

  // Skip if nothing new since last poll (dedup via Seq)
  if (current.latestSeq <= prev.latestSeq && prev.latestSeq !== 0) {
    state[key] = current;
    return;
  }

  const homeScored = current.goalsHome > prev.goalsHome;
  const awayScored = current.goalsAway > prev.goalsAway;

  if ((homeScored || awayScored) && current.clock) {
    // Edge case: if both teams' goal counts increased between polls (two
    // goals happened in one ~12s window), this picks the home team's name
    // for the "scored at" line rather than posting two separate cards.
    // Rare enough for a hackathon demo not to fix now, but worth knowing.
    const scoringTeam = homeScored ? fixture.Participant1 : fixture.Participant2;

    console.log(
      `Goal detected: ${scoringTeam} scores! ${fixture.Participant1} ${current.goalsHome}-${current.goalsAway} ${fixture.Participant2}`
    );

    const imageBuffer = await renderGoalCard({
      homeTeam: fixture.Participant1,
      awayTeam: fixture.Participant2,
      homeGoals: current.goalsHome,
      awayGoals: current.goalsAway,
      scoredAtSeconds: current.clock.Seconds,
      scoringTeam,
      currentSeconds: current.clock.Seconds,
      ballImagePath: BALL_IMAGE,
    });

    const caption = `GOAL! ${scoringTeam} scores! ${fixture.Participant1} ${current.goalsHome}-${current.goalsAway} ${fixture.Participant2}`;

    await postGoalCard(imageBuffer, caption);
    if (twitterReady) await postGoalTweet(imageBuffer, caption);
  }

  state[key] = current;
}

async function pollOnce() {
  const state = loadState();

  let fixtures;
  try {
    fixtures = await getWorldCupFixtures();
  } catch (err) {
    console.error("Failed to fetch fixtures list:", err.message);
    return;
  }

  const liveCandidates = fixtures.filter(isKickedOff);
  console.log(`Checking ${liveCandidates.length} kicked-off fixtures...`);

  for (const fixture of liveCandidates) {
    await checkFixture(fixture, state);
  }

  saveState(state);
}

async function main() {
  console.log("Onside live-detection service starting...");
  console.log(`Twitter posting: ${twitterReady ? "enabled" : "disabled (no credentials yet)"}`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    await pollOnce().catch((err) => console.error("Poll cycle failed:", err));
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

main();