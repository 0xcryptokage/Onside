require("dotenv").config();
const { callWithAuth } = require("./lib/txlineAuth");

const FIXTURE_ID = 18192996; // Mexico v England, known finished match, 2-3

async function main() {
  console.log(`Testing /api/scores/updates/${FIXTURE_ID} (Mexico v England)...`);
  try {
    const result = await callWithAuth(
      `/api/scores/updates/${FIXTURE_ID}`,
      process.env.TXLINE_API_TOKEN
    );

    const entries = Array.isArray(result) ? result : [result];
    console.log(`Got ${entries.length} entries.\n`);

    // Count occurrences of each Action type — this is the key check.
    // If this endpoint gives a real event log, we should see MULTIPLE
    // "goal" entries (5 total, since the match finished 2-3), multiple
    // "corner" entries (many), etc. — unlike /snapshot which only ever
    // gives exactly one of each.
    const counts = {};
    for (const e of entries) {
      const action = e.Action || "(no action)";
      counts[action] = (counts[action] || 0) + 1;
    }

    console.log("Action type counts:");
    for (const [action, count] of Object.entries(counts).sort()) {
      console.log(`  ${action}: ${count}`);
    }

    const goalEntries = entries.filter((e) => e.Action === "goal");
    console.log(`\nGoal entries found: ${goalEntries.length}`);
    goalEntries.forEach((e, i) => {
      console.log(`  Goal ${i + 1}: Seq=${e.Seq}, PlayerId=${e.Data?.PlayerId}, GoalType=${e.Data?.GoalType}, Clock=${e.Clock?.Seconds}`);
    });

    require("fs").writeFileSync(
      "updates-output.json",
      JSON.stringify(entries, null, 2)
    );
    console.log("\nFull output also saved to updates-output.json");
  } catch (err) {
    console.error("Failed:", err.message);
    if (err.response) {
      console.error("Status:", err.response.status);
      console.error("Body:", JSON.stringify(err.response.data, null, 2));
    }
  }
}

main().catch((err) => console.error("Error:", err));
