require("dotenv").config();
const fetch = require("node-fetch");
const { getJwt } = require("./lib/txlineAuth");

const AUTH_HOST = process.env.TXLINE_HOST || "https://txline-dev.txodds.com";
const API_TOKEN = process.env.TXLINE_API_TOKEN;
const FIXTURE_ID = 18192996; // Mexico v England, July 6 2026, finished 2-3

// Parses a raw SSE text body (one or more "field: value" lines per block,
// blocks separated by a blank line) into an array of parsed `data` payloads.
// Mirrors the parseSseBlock/readSseMessages approach from TxLINE's docs,
// but works on a full string instead of a streaming reader, since we're
// fetching a bounded historical replay, not an open live connection.
function parseSseText(rawText) {
  const blocks = rawText.split(/\r?\n\r?\n/);
  const messages = [];

  for (const block of blocks) {
    if (!block.trim()) continue;

    let dataLines = [];
    for (const rawLine of block.split(/\r?\n/)) {
      if (!rawLine || rawLine.startsWith(":")) continue;
      const sep = rawLine.indexOf(":");
      const field = sep === -1 ? rawLine : rawLine.slice(0, sep);
      const value = sep === -1 ? "" : rawLine.slice(sep + 1).replace(/^ /, "");
      if (field === "data") dataLines.push(value);
    }

    if (dataLines.length === 0) continue;
    const joined = dataLines.join("\n");

    try {
      messages.push(JSON.parse(joined));
    } catch (err) {
      console.error("Failed to parse SSE data block as JSON:", joined.slice(0, 100));
    }
  }

  return messages;
}

async function main() {
  console.log(`Testing /api/scores/historical/${FIXTURE_ID} (SSE-aware parsing)...`);

  const jwt = await getJwt();
  const res = await fetch(`${AUTH_HOST}/api/scores/historical/${FIXTURE_ID}`, {
    headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": API_TOKEN },
  });

  console.log("Response status:", res.status);
  console.log("Content-Type:", res.headers.get("content-type"));

  const rawText = await res.text();
  console.log(`Raw body length: ${rawText.length} chars\n`);

  if (!res.ok) {
    console.error("Request failed. Raw body:", rawText.slice(0, 1000));
    return;
  }

  const entries = parseSseText(rawText);
  console.log(`Parsed ${entries.length} SSE data messages.\n`);

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
    "historical-parsed-output.json",
    JSON.stringify(entries, null, 2)
  );
  console.log("\nFull parsed output saved to historical-parsed-output.json");
}

main().catch((err) => console.error("Error:", err));
