require("dotenv").config();
const { callWithAuth } = require("./lib/txlineAuth");

// Testing the real scores/stats snapshot endpoint against a match we KNOW
// already happened and is settled: Mexico v England, FixtureId 18192996
// (found via the historical fixtures test).
const FIXTURE_ID = 18192996;

async function main() {
  console.log(`Testing /api/scores/snapshot/${FIXTURE_ID} (Mexico v England)...`);
  try {
    const result = await callWithAuth(
      `/api/scores/snapshot/${FIXTURE_ID}`,
      process.env.TXLINE_API_TOKEN
    );

    console.log(`Got ${Array.isArray(result) ? result.length : "non-array"} entries:`);
    console.log(JSON.stringify(result, null, 2));

    // Quick sanity checks on the things we actually care about
    const entries = Array.isArray(result) ? result : [result];

    entries.forEach((entry, i) => {
      console.log(`\n--- Entry ${i} ---`);
      if (entry.Stats) {
        console.log("Stats keys present:", Object.keys(entry.Stats));
      }
      if (entry.Data) {
        console.log("Data keys present:", Object.keys(entry.Data));
      }
      if (entry.Lineups) {
        console.log(`Lineups present, length: ${entry.Lineups.length}`);
      }
      if (entry.PlayerId) {
        console.log("PlayerId found on this entry:", entry.PlayerId);
      }
    });
  } catch (err) {
    console.error("Failed:", err.message);
    if (err.response) {
      console.error("Status:", err.response.status);
      console.error("Body:", JSON.stringify(err.response.data, null, 2));
    }
  }
}

main().catch((err) => console.error("Error:", err));
