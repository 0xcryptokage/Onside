const fs = require("fs");
const path = require("path");

const STATE_FILE = path.join(__dirname, "../.state.json");

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

module.exports = { loadState, saveState };
