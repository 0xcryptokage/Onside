require("dotenv").config();
const path = require("path");
const predictionStore = require("./lib/predictionStore");
const { renderFirstCorrectCard } = require("./lib/cardRenderer");
const { postGoalCard } = require("./lib/telegramPoster");
const { postGoalTweet, isConfigured: twitterReady } = require("./lib/twitterPoster");
const { getTelegramProfilePhotoUrl } = require("./lib/telegramReader");

const TEST_FIXTURE_ID = 999999001;
const HOME_TEAM = "France";
const AWAY_TEAM = "England";
const TEMPLATE = path.join(__dirname, "assets/templates/goal_1.png");

// Change this to whichever team you actually replied with, to simulate
// "this is who really won"
const WINNER_TEAM = process.argv[2] || HOME_TEAM;

async function main() {
  console.log(`Resolving as if ${WINNER_TEAM} won...`);

  for (const platform of ["twitter", "telegram"]) {
    const entry = predictionStore.getEntry(TEST_FIXTURE_ID, platform);
    if (!entry) {
      console.log(`No ${platform} entry found, skipping.`);
      continue;
    }

    const winner = predictionStore.getFirstCorrectPredictor(TEST_FIXTURE_ID, platform, WINNER_TEAM);
    if (!winner) {
      console.log(`No correct ${platform} predictions found for "${WINNER_TEAM}".`);
      continue;
    }

    console.log(`${platform} winner:`, winner);

    let profileImageUrl = winner.profileImageUrl;
    if (platform === "telegram" && !profileImageUrl && winner.userId) {
      profileImageUrl = await getTelegramProfilePhotoUrl(winner.userId);
      console.log("Fetched Telegram profile photo URL:", profileImageUrl);
    }

    if (!profileImageUrl) {
      console.log(`No profile picture available for ${platform} winner — skipping card.`);
      continue;
    }

    const imageBuffer = await renderFirstCorrectCard({
      templatePath: TEMPLATE,
      homeTeam: HOME_TEAM,
      awayTeam: AWAY_TEAM,
      username: winner.username,
      profileImageUrl,
      predictedTeam: winner.team,
    });

    const caption = `[TEST] Called it first! @${winner.username} correctly predicted ${WINNER_TEAM}`;

    if (platform === "twitter" && twitterReady) {
      await postGoalTweet(imageBuffer, caption);
      console.log("Posted winner card to Twitter!");
    } else if (platform === "telegram") {
      await postGoalCard(imageBuffer, caption);
      console.log("Posted winner card to Telegram!");
    }
  }
}

main().catch((err) => console.error("Error:", err));
