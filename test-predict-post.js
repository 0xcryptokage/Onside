require("dotenv").config();
const { TwitterApi } = require("twitter-api-v2");
const TelegramBot = require("node-telegram-bot-api");
const predictionStore = require("./lib/predictionStore");
const { renderPredictionPromptCard } = require("./lib/cardRenderer");

// Set to false to test Telegram only, without touching Twitter/X at all
// (saves API credits while you're still testing the mechanism).
const POST_TO_TWITTER = true;

const TEST_FIXTURE_ID = 999999001; // fake ID, won't collide with real TxLINE fixtures
const HOME_TEAM = "France";
const AWAY_TEAM = "England";
const TEMPLATE = "./assets/templates/goal_1.png";

async function main() {
  const imageBuffer = await renderPredictionPromptCard({
    templatePath: TEMPLATE,
    homeTeam: HOME_TEAM,
    awayTeam: AWAY_TEAM,
  });
  const caption = `[TEST] Who wins? ${HOME_TEAM} or ${AWAY_TEAM}? Reply with your pick! You have 30 minutes.`;

  if (POST_TO_TWITTER) {
    const client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessSecret: process.env.TWITTER_ACCESS_SECRET,
    });
    const mediaId = await client.v1.uploadMedia(imageBuffer, { mimeType: "image/png" });
    const tweet = await client.v2.tweet({ text: caption, media: { media_ids: [mediaId] } });
    predictionStore.recordPrompt(TEST_FIXTURE_ID, "twitter", tweet.data.id, HOME_TEAM, AWAY_TEAM, Date.now());
    console.log("Posted to Twitter. Tweet ID:", tweet.data.id);
    console.log(`Reply to it here: https://twitter.com/i/web/status/${tweet.data.id}`);
  } else {
    console.log("Skipping Twitter (POST_TO_TWITTER = false).");
  }

  // Post to Telegram
  const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
  await bot.sendPhoto(process.env.TELEGRAM_CHAT_ID, imageBuffer, { caption });
  predictionStore.recordPrompt(TEST_FIXTURE_ID, "telegram", null, HOME_TEAM, AWAY_TEAM, Date.now());
  console.log("Posted to Telegram channel — go reply in your linked discussion group.");

  console.log("\nNow go reply with a team name (e.g. 'France!'), then run: node test-predict-check.js");
}

main().catch((err) => console.error("Error:", err));