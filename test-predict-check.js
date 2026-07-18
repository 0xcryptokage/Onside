require("dotenv").config();
const predictionStore = require("./lib/predictionStore");
const { fetchReplies, parsePredictionFromText } = require("./lib/twitterReader");
const { fetchNewMessages } = require("./lib/telegramReader");

const TEST_FIXTURE_ID = 999999001;
const HOME_TEAM = "France";
const AWAY_TEAM = "England";

async function main() {
  const twitterEntry = predictionStore.getEntry(TEST_FIXTURE_ID, "twitter");
  const telegramEntry = predictionStore.getEntry(TEST_FIXTURE_ID, "telegram");

  if (!twitterEntry && !telegramEntry) {
    console.log("No prompt found — run test-predict-post.js first.");
    return;
  }

  if (twitterEntry) {
    console.log("Twitter window open?", predictionStore.isWindowOpen(TEST_FIXTURE_ID, "twitter"));
    try {
      const replies = await fetchReplies(twitterEntry.promptId, process.env.TWITTER_BOT_USERNAME || "Onsidelive_bot");
      console.log("Raw Twitter replies fetched:", replies.length);
      console.log(replies);
      predictionStore.addReplies(TEST_FIXTURE_ID, "twitter", replies, [HOME_TEAM, AWAY_TEAM], parsePredictionFromText);
    } catch (err) {
      console.error("Twitter fetch failed:", err.message);
    }
  }

  if (telegramEntry) {
    console.log("Telegram window open?", predictionStore.isWindowOpen(TEST_FIXTURE_ID, "telegram"));
    try {
      const messages = await fetchNewMessages();
      console.log("Raw Telegram messages fetched:", messages.length);
      console.log(messages);
      predictionStore.addReplies(TEST_FIXTURE_ID, "telegram", messages, [HOME_TEAM, AWAY_TEAM], parsePredictionFromText);
    } catch (err) {
      console.error("Telegram fetch failed:", err.message);
    }
  }

  console.log("\n--- What got recorded ---");
  console.log("Twitter:", JSON.stringify(predictionStore.getEntry(TEST_FIXTURE_ID, "twitter")?.predictions, null, 2));
  console.log("Telegram:", JSON.stringify(predictionStore.getEntry(TEST_FIXTURE_ID, "telegram")?.predictions, null, 2));

  console.log("\nIf your reply shows up above, run: node test-predict-resolve.js");
}

main().catch((err) => console.error("Error:", err));
