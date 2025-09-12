const BotConfig = require("../backend/models/botConfig.model.js");

async function setBotStopped(userId, error_message = "") {
  try {
    await BotConfig.findOneAndUpdate(
      { userId },
      { $set: { container_status: false, error_message: error_message } },
      { new: true }
    );
    console.log(`⚠️ Bot marked as stopped for user: ${userId}`);
  } catch (err) {
    console.error("❌ Failed to set bot stopped:", err.message);
  }
}

module.exports = { setBotStopped };
