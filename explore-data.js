require("dotenv").config();
const { getWorldCupFixtures, getScoreSnapshot } = require("./lib/txlineData");

async function main() {
  console.log("=== Fetching World Cup fixtures ===");
  const fixtures = await getWorldCupFixtures();
  console.log(`Found ${fixtures.length} fixtures:`);
  console.log(JSON.stringify(fixtures, null, 2));

  if (fixtures.length === 0) {
    console.log("\nNo fixtures currently in the snapshot — nothing more to fetch.");
    return;
  }

  // Grab the first fixture's live score snapshot too, so you can see the
  // raw event/stat shape, not just the fixture list.
  const target = fixtures[0];
  console.log(`\n=== Fetching score snapshot for ${target.Participant1} v ${target.Participant2} (${target.FixtureId}) ===`);
  const events = await getScoreSnapshot(target.FixtureId);
  console.log(`Got ${events.length} events:`);
  console.log(JSON.stringify(events, null, 2));
}

main().catch((err) => console.error("Error:", err));
