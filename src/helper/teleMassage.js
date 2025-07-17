const axios = require("axios");
require("dotenv").config();
let chatId = "959391801";
async function sendTelegram(message) {
  try {
    // const token = process.env.TELEGRAM_BOT_TOKEN;
    const token = "7936580103:AAEegwJYFXFhLRUb5t48qb2ohjspfsYpa6U";
    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    await axios.post(url, {
      chat_id: chatId,
      text: message,
    });

    console.log(`📬 Telegram sent to ${chatId}: ${message}`);
  } catch (err) {
    console.error("❌ Telegram send error:", err.message);
  }
}

module.exports = { sendTelegram };
