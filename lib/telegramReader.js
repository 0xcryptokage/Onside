const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const AUTH_HOST = "https://api.telegram.org";
const OFFSET_FILE = path.join(__dirname, "../.telegram-offset.json");

function loadOffset() {
  if (!fs.existsSync(OFFSET_FILE)) return 0;
  try {
    return JSON.parse(fs.readFileSync(OFFSET_FILE, "utf8")).offset ?? 0;
  } catch {
    return 0;
  }
}

function saveOffset(offset) {
  fs.writeFileSync(OFFSET_FILE, JSON.stringify({ offset }));
}

/**
 * Fetches new messages since the last check, using Telegram's getUpdates
 * with an offset so we never re-process the same message twice. Only
 * returns messages from the configured discussion group
 * (TELEGRAM_DISCUSSION_GROUP_ID) — not the channel itself, since channel
 * posts can't be replied to directly.
 */
async function fetchNewMessages() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const discussionGroupId = process.env.TELEGRAM_DISCUSSION_GROUP_ID;
  if (!discussionGroupId) {
    throw new Error("TELEGRAM_DISCUSSION_GROUP_ID not set in .env");
  }

  const offset = loadOffset();
  const res = await fetch(
    `${AUTH_HOST}/bot${token}/getUpdates?offset=${offset}&timeout=0`
  );
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram getUpdates failed: ${JSON.stringify(data)}`);

  let maxUpdateId = offset - 1;
  const messages = [];

  for (const update of data.result) {
    if (update.update_id > maxUpdateId) maxUpdateId = update.update_id;

    const msg = update.message;
    if (!msg || !msg.text) continue;
    if (String(msg.chat.id) !== String(discussionGroupId)) continue;

    messages.push({
      userId: msg.from.id,
      username: msg.from.username || msg.from.first_name || `user${msg.from.id}`,
      text: msg.text,
      createdAt: new Date(msg.date * 1000).toISOString(),
    });
  }

  if (maxUpdateId >= offset) saveOffset(maxUpdateId + 1);

  return messages;
}

/**
 * Fetches a Telegram user's profile photo as a public URL. Only call this
 * for the one person who ends up being the first correct predictor —
 * not for every commenter, to keep API usage down.
 */
async function getTelegramProfilePhotoUrl(userId) {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  const photosRes = await fetch(
    `${AUTH_HOST}/bot${token}/getUserProfilePhotos?user_id=${userId}&limit=1`
  );
  const photosData = await photosRes.json();
  if (!photosData.ok || photosData.result.total_count === 0) return null;

  const fileId = photosData.result.photos[0][0].file_id;
  const fileRes = await fetch(`${AUTH_HOST}/bot${token}/getFile?file_id=${fileId}`);
  const fileData = await fileRes.json();
  if (!fileData.ok) return null;

  return `${AUTH_HOST}/file/bot${token}/${fileData.result.file_path}`;
}

module.exports = { fetchNewMessages, getTelegramProfilePhotoUrl };
