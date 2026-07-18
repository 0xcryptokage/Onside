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
 * Every entry is keyed by `${fixtureId}:${platform}` (platform = "twitter"
 * or "telegram") so the two platforms are tracked completely independently
 * — an X handle and a Telegram username aren't the same identity space,
 * so each platform gets its own prompt, its own reply window, and its own
 * "first correct predictor" result.
 */
function entryKey(fixtureId, platform) {
  return `${fixtureId}:${platform}`;
}

/**
 * Records a new prediction prompt for a fixture on a specific platform.
 * `promptPostedAt` should be the real timestamp the prompt went out
 * (Date.now() at post time) — replies are only accepted within 30 minutes.
 */
function recordPrompt(fixtureId, platform, promptId, homeTeam, awayTeam, promptPostedAt = Date.now()) {
  const data = loadPredictions();
  data[entryKey(fixtureId, platform)] = {
    fixtureId,
    platform,
    promptId,
    homeTeam,
    awayTeam,
    promptPostedAt,
    resolved: false,
    predictions: {},
  };
  savePredictions(data);
}

function getEntry(fixtureId, platform) {
  const data = loadPredictions();
  return data[entryKey(fixtureId, platform)] ?? null;
}

/** True if we're still within the 30-minute window for this fixture+platform's prompt. */
function isWindowOpen(fixtureId, platform) {
  const entry = getEntry(fixtureId, platform);
  if (!entry) return false;
  return Date.now() - entry.promptPostedAt < PREDICTION_WINDOW_MS;
}

function addReplies(fixtureId, platform, replies, candidateTeams, parsePredictionFromText) {
  const data = loadPredictions();
  const entry = data[entryKey(fixtureId, platform)];
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
function getFirstCorrectPredictor(fixtureId, platform, actualWinnerTeam) {
  const entry = getEntry(fixtureId, platform);
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

function markResolved(fixtureId, platform) {
  const data = loadPredictions();
  const key = entryKey(fixtureId, platform);
  if (data[key]) {
    data[key].resolved = true;
    savePredictions(data);
  }
}

module.exports = {
  recordPrompt,
  addReplies,
  markResolved,
  getEntry,
  getFirstCorrectPredictor,
  isWindowOpen,
  PREDICTION_WINDOW_MS,
};
