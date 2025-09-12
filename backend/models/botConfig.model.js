const mongoose = require("mongoose");
const { commonFields } = require("../plugins");

const botConfigSchema = new mongoose.Schema({
  exchange: {
    type: String,
    enum: ["binance", "coinstore"],
    // required: true,
  },
  telegram_bot_token: {
    type: String,
    // required: true,
  },
  telegram_chat_id: {
    type: String,
    // required: true,
  },
  is_telegram_notification_enable: {
    type: Boolean,
    default: false,
  },
  binance_api_key: {
    type: String,
    required: true,
  },
  binance_api_secret: {
    type: String,
    required: true,
  },
  bot_username: {
    type: String,
    required: true,
  },
  bot_password: {
    type: String,
    required: true,
  },
  bot_instance_ip: {
    type: String,
  },
  bot_server_ip: {
    type: String,
  },
  is_deployed: {
    type: Boolean,
    default: false,
  },
  running_status: {
    type: Boolean,
    default: false,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  containerId: {
    type: String,
  },
  containerName: {
    type: String,
  },
  container_status: {
    type: Boolean,
    default: true,
  },
  error_message : {
    type : String,
  }
});

botConfigSchema.plugin(commonFields);
const BotConfig = mongoose.model("BotConfig", botConfigSchema);

module.exports = BotConfig;
