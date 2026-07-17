require("dotenv").config();
const { renderGoalCard } = require("./lib/cardRenderer");
const { postGoalCard } = require("./lib/telegramPoster");

async function main() {
  const imageBuffer = await renderGoalCard({
    homeTeam: "Spain",
    awayTeam: "Argentina",
    homeGoals: 2,
    awayGoals: 1,
    scoredAtSeconds: 4034,
    currentSeconds: 4112,
    ballImagePath: "./assets/ball_circle.png",
  });

  console.log("Card rendered, size:", imageBuffer.length);

  await postGoalCard(imageBuffer, "GOAL! Spain 2-1 Argentina (test post)");
  console.log("Posted to Telegram!");
}

main().catch((err) => console.error("Error:", err));