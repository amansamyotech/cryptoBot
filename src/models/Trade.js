const mongoose = require("mongoose");
const { Schema, model, Types } = mongoose;

const tradeSchema = new Schema(
  {
    symbol: {
      type: String,
      required: true,
    },
    orderId: {
      type: String,
      required: true,
    },
    currentPrice: {
      type: Types.Decimal128,
      required: true,
    },
    quantity: {
      type: Types.Decimal128,
      required: true,
    },
    buyingAmount: {
      type: Types.Decimal128,
      required: true,
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
