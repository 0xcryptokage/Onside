require("dotenv").config();
const path = require("path");
const {
  getWorldCupFixtures,
  isKickedOff,
  getScoreSnapshot,
  extractMatchState,
} = require("./lib/txlineData");
const {
  renderGoalCard,
  renderYellowCard,
  renderRedCard,
  renderFirstCorrectCard,
  renderPredictionPromptCard,
} = require("./lib/cardRenderer");
const { postGoalCard } = require("./lib/telegramPoster");
const { postGoalTweet, isConfigured: twitterReady } = require("./lib/twitterPoster");
const { loadState, saveState } = require("./lib/state");
const predictionStore = require("./lib/predictionStore");
const { fetchReplies, parsePredictionFromText } = require("./lib/twitterReader");
const { fetchNewMessages, getTelegramProfilePhotoUrl } = require("./lib/telegramReader");
const { TwitterApi } = require("twitter-api-v2");

const POLL_INTERVAL_MS = 12_000;
const REPLY_POLL_EVERY_N_CYCLES = 5; // ~every 60s at 12s/cycle — reply reads cost money, poll less often
const BALL_IMAGE = path.join(__dirname, "assets/ball_circle.png");
const CARD_TEMPLATES = [
  path.join(__dirname, "assets/templates/goal_1.png"),
  path.join(__dirname, "assets/templates/goal_2.png"),
];
function randomTemplate() {
  return CARD_TEMPLATES[Math.floor(Math.random() * CARD_TEMPLATES.length)];
}

let cycleCount = 0;

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

    const imageBuffer = await renderGoalCard({
      homeTeam: home, awayTeam: away,
      homeGoals: current.goalsHome, awayGoals: current.goalsAway,
      scoredAtSeconds: current.clock.Seconds, scoringTeam,
      currentSeconds: current.clock.Seconds, ballImagePath: BALL_IMAGE,
    });
    const caption = `GOAL! ${scoringTeam} scores! ${home} ${current.goalsHome}-${current.goalsAway} ${away}`;
    await postGoalCard(imageBuffer, caption);
    if (twitterReady) await postGoalTweet(imageBuffer, caption);
  }

  // --- Yellow cards ---
  const homeYellow = current.yellowHome > prev.yellowHome;
  const awayYellow = current.yellowAway > prev.yellowAway;
  if ((homeYellow || awayYellow) && current.clock) {
    const bookedTeam = homeYellow ? home : away;
    console.log(`Yellow card: ${bookedTeam}`);
    const imageBuffer = await renderYellowCard({
      homeTeam: home, awayTeam: away, bookedTeam,
      eventAtSeconds: current.clock.Seconds, currentSeconds: current.clock.Seconds,
    });
    const caption = `YELLOW CARD! ${bookedTeam} booked (${home} v ${away})`;
    await postGoalCard(imageBuffer, caption);
    if (twitterReady) await postGoalTweet(imageBuffer, caption);
  }

  // --- Red cards ---
  const homeRed = current.redHome > prev.redHome;
  const awayRed = current.redAway > prev.redAway;
  if ((homeRed || awayRed) && current.clock) {
    const bookedTeam = homeRed ? home : away;
    console.log(`Red card: ${bookedTeam}`);
    const imageBuffer = await renderRedCard({
      homeTeam: home, awayTeam: away, bookedTeam,
      eventAtSeconds: current.clock.Seconds, currentSeconds: current.clock.Seconds,
    });
    const caption = `RED CARD! ${bookedTeam} down to 10 (${home} v ${away})`;
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
      templatePath: randomTemplate(),
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
            username: winner.username, profileImageUrl, predictedTeam: winner.team,
          });
          const caption = `Called it first! @${winner.username} correctly predicted ${winnerTeam} (${home} v ${away})`;
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