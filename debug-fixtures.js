require("dotenv").config();
const { getWorldCupFixtures } = require("./lib/txlineData");

getWorldCupFixtures().then((fixtures) => {
  console.log("Total World Cup fixtures returned:", fixtures.length);
  console.log("First 3 fixtures:", JSON.stringify(fixtures.slice(0, 3), null, 2));
  const now = Date.now();
  console.log("Current time (ms):", now);
  const kickedOff = fixtures.filter((f) => f.StartTime <= now);
  console.log("Fixtures with StartTime in the past:", kickedOff.length);
}).catch((err) => console.error("Error:", err));