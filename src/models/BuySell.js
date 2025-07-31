const mongoose = require("mongoose");
const { Schema, model, Types } = mongoose;

const BuySellSchema = new Schema(
  {
    symbol: {
      type: String,
    },
    side: { type: String },
    placeOrderId: {
      type: String,
    },
    quantity: {
      type: String,
    },
    LongTimeCoinPrice: {
      type: Types.Decimal128,
    },
    stopLossPrice: {
      type: String,
    },
    stopLossOrderId: {
      type: String,
    },
    takeProfitPrice: {
      type: String,
    },
    leverage: {
      type: String,
    },
    marginUsed: {
      type: String,
    },
    profitOrderId: {
      type: String,
    },

    ShortTimeCurrentPrice: {
      type: Types.Decimal128,
    },

    status: {
      type: String,
      default: "0",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = model("BuySell", BuySellSchema);
