const mongoose = require("mongoose");
const { Schema, model, Types } = mongoose;

const tradeSchema = new Schema(
  {
    symbol: {
      type: String,
    },
    orderId: {
      type: String,
    },
    buyingTimeCoinPrice: {
      type: Types.Decimal128,
    },
    quantity: {
      type: Types.Decimal128,
    },
    buyingAmount: {
      type: Types.Decimal128,
    },

    sellingTimeCurrentPrice: {
      type: Types.Decimal128,
    },

    profitAmount: {
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

module.exports = model("Trade", tradeSchema);
