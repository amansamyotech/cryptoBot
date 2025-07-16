const mongoose = require("mongoose");
const { Schema, model, Types } = mongoose;

const tradeSchema = new Schema(
  {
    symbol: {
      type: String,
      required: true,
      trim: true,
    },
    orderId: {
      type: String,
      // required: true,
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

    sellingPrice: {
      type: Types.Decimal128,
    },
    sellQuantity: {
      type: Types.Decimal128,
    },
    profit: {
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
