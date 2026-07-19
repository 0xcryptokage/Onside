require("dotenv").config();
const { callWithAuth } = require("./lib/txlineAuth");

const CANDIDATE_PATHS = [
  "/api/fixtures/history",
  "/api/fixtures/snapshot/history",
  "/api/scores/history",
  "/api/scores/updates",
  "/api/fixtures/updates",
];

async function tryPath(path) {
  try {
    const result = await callWithAuth(path, process.env.TXLINE_API_TOKEN);
    console.log(`✅ ${path} — SUCCESS`);
    console.log(JSON.stringify(result, null, 2).slice(0, 500));
  } catch (err) {
    console.log(`❌ ${path} — ${err.message}`);
  }
  console.log("---");
}

async function main() {
  for (const path of CANDIDATE_PATHS) {
    await tryPath(path);
  }
}

main().catch((err) => console.error("Error:", err));
