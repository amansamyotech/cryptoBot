const mongoose = require("mongoose");
const { Schema, model, Types } = mongoose;

const tradeSchema = new Schema(
  {
    symbol: {
      type: String,
      required: true,
      trim: true,
    },
    buyPrice: {
      type: Types.Decimal128,
      required: true,
    },
    quantity: {
      type: Types.Decimal128,
      required: true,
    },
    purchaseAmount: {
      type: Types.Decimal128,
      required: true,
    },
    isBuy: {
      type: Boolean,
      default: false,
    },
    isSell: {
      type: Boolean,
      default: false,
    },
    sellingPrice: {
      type: Types.Decimal128,
    },
    sellQuantity: {
      type: Types.Decimal128,
    },
    profit: {
      type: Types.Decimal128,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = model("Trade", tradeSchema);
