require("dotenv").config();
const { callWithAuth } = require("./lib/txlineAuth");

const FIXTURE_ID = 18192996; // Mexico v England, July 6 2026, finished 2-3

async function main() {
  console.log(`Testing /api/scores/historical/${FIXTURE_ID} (Mexico v England)...`);
  try {
    const result = await callWithAuth(
      `/api/scores/historical/${FIXTURE_ID}`,
      process.env.TXLINE_API_TOKEN
    );

    const entries = Array.isArray(result) ? result : result.data || [result];
    console.log(`Got ${entries.length} entries.\n`);

    const counts = {};
    for (const e of entries) {
      const action = e.Action || e.action || "(no action)";
      counts[action] = (counts[action] || 0) + 1;
    }

    console.log("Action type counts (this is the key check):");
    for (const [action, count] of Object.entries(counts).sort()) {
      console.log(`  ${action}: ${count}`);
    }

    const goalEntries = entries.filter((e) => (e.Action || e.action) === "goal");
    console.log(`\nGoal entries found: ${goalEntries.length} (expect 5, since match finished 2-3)`);
    goalEntries.forEach((e, i) => {
      console.log(
        `  Goal ${i + 1}: Seq=${e.Seq ?? e.seq}, PlayerId=${e.Data?.PlayerId ?? e.data?.PlayerId}, ` +
        `GoalType=${e.Data?.GoalType ?? e.data?.GoalType}, Clock=${e.Clock?.Seconds ?? e.clock?.seconds}`
      );
    });

    require("fs").writeFileSync(
      "historical-output.json",
      JSON.stringify(entries, null, 2)
    );
    console.log("\nFull output also saved to historical-output.json");
  } catch (err) {
    console.error("Failed:", err.message);
    if (err.response) {
      console.error("Status:", err.response.status);
      console.error("Body:", JSON.stringify(err.response.data, null, 2));
    }
  }
}

main().catch((err) => console.error("Error:", err));
