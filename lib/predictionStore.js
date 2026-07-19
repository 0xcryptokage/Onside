const fs = require("fs");
const path = require("path");

const PREDICTIONS_FILE = path.join(__dirname, "../.predictions.json");
const PREDICTION_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

function loadPredictions() {
  if (!fs.existsSync(PREDICTIONS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(PREDICTIONS_FILE, "utf8"));
  } catch {
    return {};
  }
}

function savePredictions(data) {
  fs.writeFileSync(PREDICTIONS_FILE, JSON.stringify(data, null, 2));
}

/**
 * Every entry is keyed by `${fixtureId}:${platform}:${category}`
 * (platform = "twitter" or "telegram"; category defaults to "winner" for
 * the original who-wins game, and is "goals"/"yellow"/"red" for the new
 * numeric-guess prediction types). This keeps all four prediction types
 * completely independent per fixture+platform — separate prompts,
 * separate 30-minute windows, separate results — without touching how
 * the original "winner" game already behaves (its calls are unchanged
 * since category defaults to "winner").
 */
function entryKey(fixtureId, platform, category = "winner") {
  return `${fixtureId}:${platform}:${category}`;
}

/**
 * Records a new prediction prompt for a fixture on a specific platform.
 * `promptPostedAt` should be the real timestamp the prompt went out
 * (Date.now() at post time) — replies are only accepted within 30 minutes.
 */
function recordPrompt(fixtureId, platform, promptId, homeTeam, awayTeam, promptPostedAt = Date.now(), category = "winner") {
  const data = loadPredictions();
  data[entryKey(fixtureId, platform, category)] = {
    fixtureId,
    platform,
    category,
    promptId,
    homeTeam,
    awayTeam,
    promptPostedAt,
    resolved: false,
    predictions: {},
  };
  savePredictions(data);
}

function getEntry(fixtureId, platform, category = "winner") {
  const data = loadPredictions();
  return data[entryKey(fixtureId, platform, category)] ?? null;
}

/** True if we're still within the 30-minute window for this fixture+platform's prompt. */
function isWindowOpen(fixtureId, platform, category = "winner") {
  const entry = getEntry(fixtureId, platform, category);
  if (!entry) return false;
  return Date.now() - entry.promptPostedAt < PREDICTION_WINDOW_MS;
}

function addReplies(fixtureId, platform, replies, candidateTeams, parsePredictionFromText, category = "winner") {
  const data = loadPredictions();
  const entry = data[entryKey(fixtureId, platform, category)];
  if (!entry) return;

  const deadline = entry.promptPostedAt + PREDICTION_WINDOW_MS;

  for (const reply of replies) {
    if (!reply.username) continue;
    if (entry.predictions[reply.username]) continue; // only their first reply counts
    if (reply.createdAt && new Date(reply.createdAt).getTime() > deadline) continue;

    const guess = parsePredictionFromText(reply.text, candidateTeams);
    if (guess) {
      entry.predictions[reply.username] = {
        team: guess,
        text: reply.text ?? null, // raw reply text, for quoting the winner
        profileImageUrl: reply.profileImageUrl ?? null,
        userId: reply.userId ?? null, // needed for Telegram's photo lookup
        repliedAt: reply.createdAt,
      };
    }
  }
  savePredictions(data);
}

/**
 * Returns the earliest-timestamped correct prediction for a fixture+platform,
 * or null if nobody predicted the actual outcome.
 */
function getFirstCorrectPredictor(fixtureId, platform, actualWinnerTeam, category = "winner") {
  const entry = getEntry(fixtureId, platform, category);
  if (!entry) return null;

  let earliest = null;
  for (const [username, pred] of Object.entries(entry.predictions)) {
    if (pred.team !== actualWinnerTeam) continue;
    if (!earliest || new Date(pred.repliedAt) < new Date(earliest.repliedAt)) {
      earliest = { username, ...pred };
    }
  }
  return earliest;
}

/**
 * Same shape as addReplies, but for numeric-guess predictions (total
 * goals / yellow cards / red cards) instead of team picks. Stores a
 * `guess` number per user rather than a `team` string. Only a user's
 * FIRST reply counts, same rule as the winner game.
 */
function addNumericReplies(fixtureId, platform, category, replies, parseNumberFromText) {
  const data = loadPredictions();
  const entry = data[entryKey(fixtureId, platform, category)];
  if (!entry) return;

  const deadline = entry.promptPostedAt + PREDICTION_WINDOW_MS;

  for (const reply of replies) {
    if (!reply.username) continue;
    if (entry.predictions[reply.username]) continue;
    if (reply.createdAt && new Date(reply.createdAt).getTime() > deadline) continue;

    const guess = parseNumberFromText(reply.text);
    if (guess != null) {
      entry.predictions[reply.username] = {
        guess,
        text: reply.text ?? null, // raw reply text, for quoting the winner
        profileImageUrl: reply.profileImageUrl ?? null,
        userId: reply.userId ?? null,
        repliedAt: reply.createdAt,
      };
    }
  }
  savePredictions(data);
}

/**
 * Resolution rule for numeric-guess predictions: CLOSEST guess wins, not
 * exact-match-only — exact guesses on things like "total yellow cards"
 * are rare enough that an exact-only rule would produce no winner most
 * games. Ties (same distance from the actual value) are broken by whoever
 * replied earliest. Returns null if nobody made a valid guess.
 */
function getClosestPredictor(fixtureId, platform, category, actualValue) {
  const entry = getEntry(fixtureId, platform, category);
  if (!entry) return null;

  let best = null;
  for (const [username, pred] of Object.entries(entry.predictions)) {
    const distance = Math.abs(pred.guess - actualValue);
    if (
      !best ||
      distance < best.distance ||
      (distance === best.distance && new Date(pred.repliedAt) < new Date(best.repliedAt))
    ) {
      best = { username, distance, ...pred };
    }
  }
  return best;
}

function markResolved(fixtureId, platform, category = "winner") {
  const data = loadPredictions();
  const key = entryKey(fixtureId, platform, category);
  if (data[key]) {
    data[key].resolved = true;
    savePredictions(data);
  }
}

module.exports = {
  recordPrompt,
  addReplies,
  addNumericReplies,
  markResolved,
  getEntry,
  getFirstCorrectPredictor,
  getClosestPredictor,
  isWindowOpen,
  PREDICTION_WINDOW_MS,
};