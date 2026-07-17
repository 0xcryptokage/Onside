require("dotenv").config();
const { renderGoalCard } = require("./lib/cardRenderer");
const { postGoalCard } = require("./lib/telegramPoster");
const { postGoalTweet, isConfigured } = require("./lib/twitterPoster");

async function main() {
  console.log("Twitter configured:", isConfigured);

  const imageBuffer = await renderGoalCard({
    homeTeam: "France",
    awayTeam: "England",
    homeGoals: 1,
    awayGoals: 0,
    scoredAtSeconds: 2210,
    scoringTeam: "France",
    currentSeconds: 2245,
    ballImagePath: "./assets/ball_circle.png",
  });

  console.log("Card rendered, size:", imageBuffer.length);

  await postGoalCard(imageBuffer, "GOAL! France scores! France 1-0 England (test post)");
  console.log("Posted to Telegram!");

  await postGoalTweet(imageBuffer, "GOAL! France scores! France 1-0 England (test post)");
  console.log("Posted to X!");
}

main().catch((err) => console.error("Error:", err));