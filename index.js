require("dotenv").config();
const path = require("path");
const {
  getWorldCupFixtures,
  isKickedOff,
  getScoreSnapshot,
  extractMatchState,
  getPlayerNamesForFixture,
  findLatestScorerId,
  findLatestCardPlayerId,
} = require("./lib/txlineData");
const {
  renderGoalCard,
  renderYellowCard,
  renderRedCard,
  renderFirstCorrectCard,
  renderPredictionPromptCard,
  renderNumberPredictionCard,
  renderCornerCard,
} = require("./lib/cardRenderer");

// Extracts the first integer found in a reply's text, e.g. "I think 4" -> 4,
// "3-2" -> 3 (first number only — good enough for a casual guess reply).
// Returns null if no number is found, so an unparseable reply is simply
// skipped rather than crashing anything.
function parseNumberFromText(text) {
  if (!text) return null;
  const match = text.match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

// Defines the three new numeric-guess prediction types. Each needs a
// unique `category` key (for predictionStore), the on-card question text,
// a way to pull the actual final value out of the match state once it's
// finalized (for resolution), and a `delayMinutes` controlling how long
// after kickoff this prompt waits before posting — staggered so all 4
// prediction cards don't dump into the channel at the exact same second.
const NUMBER_PREDICTIONS = [
  {
    category: "goals",
    questionText: "HOW MANY GOALS?",
    delayMinutes: 3,
    getActualValue: (state) => state.goalsHome + state.goalsAway,
  },
  {
    category: "yellow",
    questionText: "HOW MANY YELLOW CARDS?",
    delayMinutes: 6,
    getActualValue: (state) => state.yellowHome + state.yellowAway,
  },
  {
    category: "red",
    questionText: "HOW MANY RED CARDS?",
    delayMinutes: 9,
    getActualValue: (state) => state.redHome + state.redAway,
  },
];

// True once at least `delayMinutes` have passed since the fixture's
// scheduled kickoff time. Used to stagger prompt posting instead of
// firing all 4 prediction cards in the same poll cycle.
function delayElapsed(fixture, delayMinutes) {
  return Date.now() - getAnchorTime(fixture) >= delayMinutes * 60 * 1000;
}
const { postGoalCard } = require("./lib/telegramPoster");
const { postGoalTweet, isConfigured: twitterReady } = require("./lib/twitterPoster");
const { loadState, saveState } = require("./lib/state");
const predictionStore = require("./lib/predictionStore");
const { fetchReplies, parsePredictionFromText } = require("./lib/twitterReader");
const { fetchNewMessages, getTelegramProfilePhotoUrl } = require("./lib/telegramReader");
const { TwitterApi } = require("twitter-api-v2");

const POLL_INTERVAL_MS = 5_000;
const REPLY_POLL_EVERY_N_CYCLES = 5; // ~every 60s at 12s/cycle — reply reads cost money, poll less often
const BALL_IMAGE = path.join(__dirname, "assets/ball_circle.png");
const CARD_TEMPLATES = [
  path.join(__dirname, "assets/templates/goal_1.png"),
  path.join(__dirname, "assets/templates/goal_2.png"),
];
// Dedicated card art for all prediction prompts (who-wins, goals, yellow,
// red) — distinct from the goal/card-event alert templates above.
const PREDICTION_TEMPLATE = path.join(__dirname, "assets/templates/prediction_1.png");
// Dedicated corner-alert card art.
const CORNER_TEMPLATE = path.join(__dirname, "assets/templates/corner_1.png");
function randomTemplate() {
  return CARD_TEMPLATES[Math.floor(Math.random() * CARD_TEMPLATES.length)];
}

let cycleCount = 0;

// Tracks when THIS bot process first saw each fixture as kicked-off.
// Used to anchor staggered prompt delays — using fixture.StartTime instead
// would misfire if the bot started watching partway through a match
// (exactly what happened earlier tonight: all 4 prompts fired at once
// because more than 9 minutes had already passed since scheduled kickoff
// by the time the bot first checked).
const firstSeenLiveAt = new Map(); // fixtureId -> timestamp (ms)

function getAnchorTime(fixture) {
  if (!firstSeenLiveAt.has(fixture.FixtureId)) {
    firstSeenLiveAt.set(fixture.FixtureId, Date.now());
  }
  return firstSeenLiveAt.get(fixture.FixtureId);
}

/* ------------------------------------------------------------------ */
/* Goal / card detection (existing, now also wired for yellow/red)     */
/* ------------------------------------------------------------------ */

async function checkFixture(fixture, state) {
  const key = String(fixture.FixtureId);
  const prev = state[key] || {
    goalsHome: 0, goalsAway: 0,
    yellowHome: 0, yellowAway: 0,
    redHome: 0, redAway: 0,
    latestSeq: 0,
  };

  let snapshotEvents;
  try {
    snapshotEvents = await getScoreSnapshot(fixture.FixtureId);
  } catch (err) {
    console.error(`Failed to fetch snapshot for fixture ${key}:`, err.message);
    return;
  }

  const current = extractMatchState(snapshotEvents);

  if (current.latestSeq <= prev.latestSeq && prev.latestSeq !== 0) {
    state[key] = current;
    await maybeResolvePredictions(fixture, current);
    return;
  }

  const home = fixture.Participant1;
  const away = fixture.Participant2;

  // --- Goals ---
  const homeScored = current.goalsHome > prev.goalsHome;
  const awayScored = current.goalsAway > prev.goalsAway;
  if ((homeScored || awayScored) && current.clock) {
    const scoringTeam = homeScored ? home : away;
    console.log(`Goal detected: ${scoringTeam} scores! ${home} ${current.goalsHome}-${current.goalsAway} ${away}`);

    // Scorer name lookup — CONFIRMED working against real match data
    // (Mexico v England, FixtureId 18192996). Uses getPlayerNamesForFixture
    // instead of extractPlayerNames directly because the Lineups block
    // only appears once per match (near kickoff), not on every poll —
    // this caches it the first time it's seen and reuses it afterward.
    // Still wrapped defensively: a lookup failure should never break the
    // goal alert itself, it should just omit the scorer's name.
    let scorerName = null;
    try {
      const scorerId = findLatestScorerId(snapshotEvents);
      if (scorerId != null) {
        const playerNames = getPlayerNamesForFixture(fixture.FixtureId, snapshotEvents);
        scorerName = playerNames.get(scorerId) ?? null;
      }
    } catch (err) {
      console.error("Scorer name lookup failed (non-fatal):", err.message);
    }

    const imageBuffer = await renderGoalCard({
      homeTeam: home, awayTeam: away,
      homeGoals: current.goalsHome, awayGoals: current.goalsAway,
      scoredAtSeconds: current.clock.Seconds, scoringTeam,
      currentSeconds: current.clock.Seconds, ballImagePath: BALL_IMAGE,
      scorerName,
    });
    const caption = scorerName
      ? `GOAL! ${scorerName} scores for ${scoringTeam}! ${home} ${current.goalsHome}-${current.goalsAway} ${away}`
      : `GOAL! ${scoringTeam} scores! ${home} ${current.goalsHome}-${current.goalsAway} ${away}`;
    await postGoalCard(imageBuffer, caption);
    if (twitterReady) await postGoalTweet(imageBuffer, caption);
  }

  // --- Yellow cards ---
  const homeYellow = current.yellowHome > prev.yellowHome;
  const awayYellow = current.yellowAway > prev.yellowAway;
  if ((homeYellow || awayYellow) && current.clock) {
    const bookedTeam = homeYellow ? home : away;
    console.log(`Yellow card: ${bookedTeam}`);

    // Player name lookup — same proven pattern as goal scorer lookup.
    // Confirmed against real match data that yellow_card events do carry
    // a resolvable PlayerId. Wrapped defensively so a lookup failure
    // never blocks the alert itself.
    let bookedPlayerName = null;
    try {
      const playerId = findLatestCardPlayerId(snapshotEvents, "yellow_card");
      if (playerId != null) {
        const playerNames = getPlayerNamesForFixture(fixture.FixtureId, snapshotEvents);
        bookedPlayerName = playerNames.get(playerId) ?? null;
      }
    } catch (err) {
      console.error("Yellow card player lookup failed (non-fatal):", err.message);
    }

    const imageBuffer = await renderYellowCard({
      homeTeam: home, awayTeam: away, bookedTeam,
      eventAtSeconds: current.clock.Seconds, currentSeconds: current.clock.Seconds,
      playerName: bookedPlayerName,
    });
    const caption = bookedPlayerName
      ? `YELLOW CARD! ${bookedPlayerName} (${bookedTeam}) booked (${home} v ${away})`
      : `YELLOW CARD! ${bookedTeam} booked (${home} v ${away})`;
    await postGoalCard(imageBuffer, caption);
    if (twitterReady) await postGoalTweet(imageBuffer, caption);
  }

  // --- Red cards ---
  const homeRed = current.redHome > prev.redHome;
  const awayRed = current.redAway > prev.redAway;
  if ((homeRed || awayRed) && current.clock) {
    const bookedTeam = homeRed ? home : away;
    console.log(`Red card: ${bookedTeam}`);

    let bookedPlayerName = null;
    try {
      const playerId = findLatestCardPlayerId(snapshotEvents, "red_card");
      if (playerId != null) {
        const playerNames = getPlayerNamesForFixture(fixture.FixtureId, snapshotEvents);
        bookedPlayerName = playerNames.get(playerId) ?? null;
      }
    } catch (err) {
      console.error("Red card player lookup failed (non-fatal):", err.message);
    }

    const imageBuffer = await renderRedCard({
      homeTeam: home, awayTeam: away, bookedTeam,
      eventAtSeconds: current.clock.Seconds, currentSeconds: current.clock.Seconds,
      playerName: bookedPlayerName,
    });
    const caption = bookedPlayerName
      ? `RED CARD! ${bookedPlayerName} (${bookedTeam}) sent off — down to 10 (${home} v ${away})`
      : `RED CARD! ${bookedTeam} down to 10 (${home} v ${away})`;
    await postGoalCard(imageBuffer, caption);
    if (twitterReady) await postGoalTweet(imageBuffer, caption);
  }

  // --- Corners ---
  const homeCorner = current.cornersHome > prev.cornersHome;
  const awayCorner = current.cornersAway > prev.cornersAway;
  if ((homeCorner || awayCorner) && current.clock) {
    const wonByTeam = homeCorner ? home : away;
    console.log(`Corner: ${wonByTeam} (${current.cornersHome}-${current.cornersAway})`);
    const imageBuffer = await renderCornerCard({
      templatePath: CORNER_TEMPLATE,
      homeTeam: home, awayTeam: away,
      homeCorners: current.cornersHome, awayCorners: current.cornersAway,
      wonByTeam,
      eventAtSeconds: current.clock.Seconds, currentSeconds: current.clock.Seconds,
    });
    const caption = `CORNER! ${wonByTeam} (${home} v ${away})`;
    await postGoalCard(imageBuffer, caption);
    if (twitterReady) await postGoalTweet(imageBuffer, caption);
  }

  state[key] = current;

  await maybeResolvePredictions(fixture, current);
}

/* ------------------------------------------------------------------ */
/* Prediction prompts (posted once, at kickoff)                        */
/* ------------------------------------------------------------------ */

async function maybePostPredictionPrompts(fixture) {
  const fixtureId = fixture.FixtureId;
  const home = fixture.Participant1;
  const away = fixture.Participant2;

  const twitterEntry = predictionStore.getEntry(fixtureId, "twitter");
  const telegramEntry = predictionStore.getEntry(fixtureId, "telegram");

  let imageBuffer;
  if (!twitterEntry || !telegramEntry) {
    imageBuffer = await renderPredictionPromptCard({
      templatePath: PREDICTION_TEMPLATE,
      homeTeam: home,
      awayTeam: away,
    });
  }
  const caption = `Who wins? ${home} or ${away}? Reply with your pick! You have 30 minutes.`;

  if (!twitterEntry && twitterReady) {
    try {
      const client = new TwitterApi({
        appKey: process.env.TWITTER_API_KEY,
        appSecret: process.env.TWITTER_API_SECRET,
        accessToken: process.env.TWITTER_ACCESS_TOKEN,
        accessSecret: process.env.TWITTER_ACCESS_SECRET,
      });
      const mediaId = await client.v1.uploadMedia(imageBuffer, { mimeType: "image/png" });
      const tweet = await client.v2.tweet({ text: caption, media: { media_ids: [mediaId] } });
      predictionStore.recordPrompt(fixtureId, "twitter", tweet.data.id, home, away, Date.now());
      console.log(`Posted Twitter prediction prompt for ${home} v ${away}`);
    } catch (err) {
      console.error("Failed to post Twitter prediction prompt:", err.message);
    }
  }

  if (!telegramEntry) {
    try {
      const TelegramBot = require("node-telegram-bot-api");
      const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
      await bot.sendPhoto(process.env.TELEGRAM_CHAT_ID, imageBuffer, { caption });
      predictionStore.recordPrompt(fixtureId, "telegram", null, home, away, Date.now());
      console.log(`Posted Telegram prediction prompt for ${home} v ${away}`);
    } catch (err) {
      console.error("Failed to post Telegram prediction prompt:", err.message);
    }
  }

  // --- New numeric-guess prompts: total goals / yellow cards / red cards ---
  // Each is fully independent of the who-wins prompt above (own card, own
  // caption, own predictionStore category), so a failure in one doesn't
  // affect the others.
  for (const { category, questionText, delayMinutes } of NUMBER_PREDICTIONS) {
    if (!delayElapsed(fixture, delayMinutes)) continue; // not time yet — stay staggered

    const twEntry = predictionStore.getEntry(fixtureId, "twitter", category);
    const tgEntry = predictionStore.getEntry(fixtureId, "telegram", category);
    if (twEntry && tgEntry) continue;

    let numberImageBuffer;
    try {
      numberImageBuffer = await renderNumberPredictionCard({
        templatePath: PREDICTION_TEMPLATE,
        homeTeam: home,
        awayTeam: away,
        questionText,
      });
    } catch (err) {
      console.error(`Failed to render ${category} prediction card:`, err.message);
      continue;
    }
    const numberCaption = `${questionText} ${home} v ${away}? Reply with your guess! Closest wins. You have 30 minutes.`;

    if (!twEntry && twitterReady) {
      try {
        const client = new TwitterApi({
          appKey: process.env.TWITTER_API_KEY,
          appSecret: process.env.TWITTER_API_SECRET,
          accessToken: process.env.TWITTER_ACCESS_TOKEN,
          accessSecret: process.env.TWITTER_ACCESS_SECRET,
        });
        const mediaId = await client.v1.uploadMedia(numberImageBuffer, { mimeType: "image/png" });
        const tweet = await client.v2.tweet({ text: numberCaption, media: { media_ids: [mediaId] } });
        predictionStore.recordPrompt(fixtureId, "twitter", tweet.data.id, home, away, Date.now(), category);
        console.log(`Posted Twitter "${category}" prediction prompt for ${home} v ${away}`);
      } catch (err) {
        console.error(`Failed to post Twitter "${category}" prediction prompt:`, err.message);
      }
    }

    if (!tgEntry) {
      try {
        const TelegramBot = require("node-telegram-bot-api");
        const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
        await bot.sendPhoto(process.env.TELEGRAM_CHAT_ID, numberImageBuffer, { caption: numberCaption });
        predictionStore.recordPrompt(fixtureId, "telegram", null, home, away, Date.now(), category);
        console.log(`Posted Telegram "${category}" prediction prompt for ${home} v ${away}`);
      } catch (err) {
        console.error(`Failed to post Telegram "${category}" prediction prompt:`, err.message);
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Reply polling (runs less often than the main match-data loop)       */
/* ------------------------------------------------------------------ */

async function pollPredictionReplies(fixture) {
  const fixtureId = fixture.FixtureId;

  if (predictionStore.isWindowOpen(fixtureId, "twitter") && twitterReady) {
    try {
      const entry = predictionStore.getEntry(fixtureId, "twitter");
      const replies = await fetchReplies(entry.promptId, process.env.TWITTER_BOT_USERNAME || "Onsidelive_bot");
      predictionStore.addReplies(
        fixtureId, "twitter", replies,
        [fixture.Participant1, fixture.Participant2], parsePredictionFromText
      );
    } catch (err) {
      console.error("Failed to poll Twitter replies:", err.message);
    }
  }

  if (predictionStore.isWindowOpen(fixtureId, "telegram")) {
    try {
      const messages = await fetchNewMessages();
      predictionStore.addReplies(
        fixtureId, "telegram", messages,
        [fixture.Participant1, fixture.Participant2], parsePredictionFromText
      );
    } catch (err) {
      console.error("Failed to poll Telegram messages:", err.message);
    }
  }

  // --- Numeric-guess replies (goals/yellow/red) ---
  for (const { category } of NUMBER_PREDICTIONS) {
    if (predictionStore.isWindowOpen(fixtureId, "twitter", category) && twitterReady) {
      try {
        const entry = predictionStore.getEntry(fixtureId, "twitter", category);
        const replies = await fetchReplies(entry.promptId, process.env.TWITTER_BOT_USERNAME || "Onsidelive_bot");
        predictionStore.addNumericReplies(fixtureId, "twitter", category, replies, parseNumberFromText);
      } catch (err) {
        console.error(`Failed to poll Twitter "${category}" replies:`, err.message);
      }
    }

    if (predictionStore.isWindowOpen(fixtureId, "telegram", category)) {
      try {
        const messages = await fetchNewMessages();
        predictionStore.addNumericReplies(fixtureId, "telegram", category, messages, parseNumberFromText);
      } catch (err) {
        console.error(`Failed to poll Telegram "${category}" messages:`, err.message);
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Resolution (once the match is finalized)                            */
/* ------------------------------------------------------------------ */

async function maybeResolvePredictions(fixture, current) {
  if (!current.gameFinalised) return;

  const fixtureId = fixture.FixtureId;
  const home = fixture.Participant1;
  const away = fixture.Participant2;

  let winnerTeam = null;
  if (current.goalsHome > current.goalsAway) winnerTeam = home;
  else if (current.goalsAway > current.goalsHome) winnerTeam = away;
  // else: draw — nobody's team-name prediction can be "correct" under the
  // current simple text-matching design. Known limitation, not a bug.

  for (const platform of ["twitter", "telegram"]) {
    const entry = predictionStore.getEntry(fixtureId, platform);
    if (!entry || entry.resolved) continue;
    if (!winnerTeam) {
      predictionStore.markResolved(fixtureId, platform);
      continue;
    }

    const winner = predictionStore.getFirstCorrectPredictor(fixtureId, platform, winnerTeam);
    if (winner) {
      try {
        let profileImageUrl = winner.profileImageUrl;
        if (platform === "telegram" && !profileImageUrl && winner.userId) {
          profileImageUrl = await getTelegramProfilePhotoUrl(winner.userId);
        }
        if (profileImageUrl) {
          const imageBuffer = await renderFirstCorrectCard({
            templatePath: randomTemplate(),
            homeTeam: home, awayTeam: away,
            username: winner.username, profileImageUrl,
            resultHeadline: `${winnerTeam.toUpperCase()} WINS!`,
            commentText: winner.text,
          });
          const caption = winner.text
            ? `Called it first! @${winner.username}: "${winner.text}" — ${winnerTeam} wins! (${home} v ${away})`
            : `Called it first! @${winner.username} correctly predicted ${winnerTeam} (${home} v ${away})`;
          if (platform === "twitter" && twitterReady) {
            await postGoalTweet(imageBuffer, caption);
          } else if (platform === "telegram") {
            await postGoalCard(imageBuffer, caption);
          }
          console.log(`Posted "Called it first!" card for ${platform}: @${winner.username}`);
        } else {
          console.log(`${platform} winner found (@${winner.username}) but no profile picture available — skipped card.`);
        }
      } catch (err) {
        console.error(`Failed to post "Called it first!" card for ${platform}:`, err.message);
      }
    } else {
      console.log(`No correct ${platform} predictions found for fixture ${fixtureId}.`);
    }

    predictionStore.markResolved(fixtureId, platform);
  }

  // --- Resolve the 3 numeric-guess predictions (goals/yellow/red) ---
  // Reuses the same, already-tested renderFirstCorrectCard for the
  // announcement — just passing a different string into `predictedTeam`
  // (e.g. "guessed 4 (actual: 5)") instead of a team name. This avoids
  // writing brand-new, unvalidated canvas code under time pressure.
  for (const { category, getActualValue } of NUMBER_PREDICTIONS) {
    const actualValue = getActualValue(current);

    for (const platform of ["twitter", "telegram"]) {
      const entry = predictionStore.getEntry(fixtureId, platform, category);
      if (!entry || entry.resolved) continue;

      const winner = predictionStore.getClosestPredictor(fixtureId, platform, category, actualValue);
      if (winner) {
        try {
          let profileImageUrl = winner.profileImageUrl;
          if (platform === "telegram" && !profileImageUrl && winner.userId) {
            profileImageUrl = await getTelegramProfilePhotoUrl(winner.userId);
          }
          if (profileImageUrl) {
            const guessLabel = `${winner.guess} (ACTUAL: ${actualValue})`;
            const imageBuffer = await renderFirstCorrectCard({
              templatePath: randomTemplate(),
              homeTeam: home, awayTeam: away,
              username: winner.username, profileImageUrl,
              resultHeadline: `CLOSEST GUESS: ${guessLabel}`,
              commentText: winner.text,
            });
            const caption = winner.text
              ? `Closest guess for ${category}! @${winner.username}: "${winner.text}" — actual was ${actualValue} (${home} v ${away})`
              : `Closest guess for ${category}! @${winner.username} guessed ${winner.guess} (actual: ${actualValue}) (${home} v ${away})`;
            if (platform === "twitter" && twitterReady) {
              await postGoalTweet(imageBuffer, caption);
            } else if (platform === "telegram") {
              await postGoalCard(imageBuffer, caption);
            }
            console.log(`Posted closest-guess card for ${category} on ${platform}: @${winner.username}`);
          } else {
            console.log(`${platform} "${category}" winner found (@${winner.username}) but no profile picture available — skipped card.`);
          }
        } catch (err) {
          console.error(`Failed to post closest-guess card for ${category} on ${platform}:`, err.message);
        }
      } else {
        console.log(`No valid "${category}" guesses found for fixture ${fixtureId} on ${platform}.`);
      }

      predictionStore.markResolved(fixtureId, platform, category);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Main loop                                                           */
/* ------------------------------------------------------------------ */

async function pollOnce() {
  const state = loadState();
  cycleCount++;

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
    await maybePostPredictionPrompts(fixture);
    await checkFixture(fixture, state);

    if (cycleCount % REPLY_POLL_EVERY_N_CYCLES === 0) {
      await pollPredictionReplies(fixture);
    }
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