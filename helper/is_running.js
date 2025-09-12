const BotConfig = require("../backend/models/botConfig.model.js");

async function setBotStopped(userId, error_message = "") {
  console.log(
    `🛠️ [setBotStopped] Called with userId: ${userId}, error_message: ${error_message}`
  );

  try {
    console.log(
      "🔍 [setBotStopped] Attempting to update BotConfig in database..."
    );

    const updateResult = await BotConfig.findOneAndUpdate(
      { userId },
      {
        $set: {
          container_status: false,
          error_message: error_message,
        },
      },
      { new: true }
    );

    console.log("✅ [setBotStopped] Database update result:", updateResult);

    if (updateResult) {
      console.log(
        `⚠️ [setBotStopped] Bot marked as stopped for user: ${userId}`
      );
    } else {
      console.warn(`⚠️ [setBotStopped] No document found for user: ${userId}`);
    }
  } catch (err) {
    console.error("❌ [setBotStopped] Failed to set bot stopped:", err.message);
    console.error(err); // full error object for deeper inspection
  }



  console.log("🧵 [setBotStopped] Function complete");
}

module.exports = { setBotStopped };
