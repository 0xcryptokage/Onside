const TelegramBot = require("node-telegram-bot-api");

let bot = null;

function getBot() {
  if (!bot) {
    bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
  }
  return bot;
}

async function postGoalCard(imageBuffer, caption) {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) {
    console.warn("TELEGRAM_CHAT_ID not set — skipping Telegram post");
    return;
  }
  await getBot().sendPhoto(chatId, imageBuffer, { caption });
}

module.exports = { postGoalCard };
