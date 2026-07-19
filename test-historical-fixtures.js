require("dotenv").config();
const { callWithAuth } = require("./lib/txlineAuth");

// July 6, 2026 — the real date of the Mexico v England match we already
// proved settled on-chain in the Verdict project. If startEpochDay works
// for historical queries, this fixture should show up.
const EPOCH_DAY = 20640;

async function main() {
  console.log(`Testing /api/fixtures/snapshot?startEpochDay=${EPOCH_DAY} (July 6, 2026)...`);
  try {
    const result = await callWithAuth(
      `/api/fixtures/snapshot?startEpochDay=${EPOCH_DAY}`,
      process.env.TXLINE_API_TOKEN
    );
    console.log(`Got ${result.length} fixtures:`);
    console.log(JSON.stringify(result, null, 2));

    const mexEng = result.find(
      (f) =>
        (f.Participant1 === "Mexico" && f.Participant2 === "England") ||
        (f.Participant1 === "England" && f.Participant2 === "Mexico")
    );
    if (mexEng) {
      console.log("\n✅ FOUND the Mexico v England fixture:", JSON.stringify(mexEng, null, 2));
    } else {
      console.log("\n❌ Mexico v England fixture NOT in the results.");
    }
  } catch (err) {
    console.error("Failed:", err.message);
  }
}

main().catch((err) => console.error("Error:", err));
