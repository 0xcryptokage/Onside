require("dotenv").config();
const { renderYellowCard, renderRedCard } = require("./lib/cardRenderer");
const { postGoalCard } = require("./lib/telegramPoster");
const { postGoalTweet, isConfigured } = require("./lib/twitterPoster");

async function main() {
  console.log("Twitter configured:", isConfigured);

  // Test yellow card
  const yellowBuffer = await renderYellowCard({
    homeTeam: "Argentina",
    awayTeam: "Spain",
    homeCount: 1,
    awayCount: 0,
    bookedTeam: "Argentina",
    eventAtSeconds: 2150,
    currentSeconds: 2180,
  });
  console.log("Yellow card rendered, size:", yellowBuffer.length);
  await postGoalCard(yellowBuffer, "YELLOW CARD! Argentina booked (test post)");
  await postGoalTweet(yellowBuffer, "YELLOW CARD! Argentina booked (test post)");
  console.log("Yellow card posted!");

  // Test red card
  const redBuffer = await renderRedCard({
    homeTeam: "Argentina",
    awayTeam: "Spain",
    homeCount: 1,
    awayCount: 0,
    bookedTeam: "Argentina",
    eventAtSeconds: 4820,
    currentSeconds: 4850,
  });
  console.log("Red card rendered, size:", redBuffer.length);
  await postGoalCard(redBuffer, "RED CARD! Argentina down to 10 (test post)");
  await postGoalTweet(redBuffer, "RED CARD! Argentina down to 10 (test post)");
  console.log("Red card posted!");
}

main().catch((err) => console.error("Error:", err));