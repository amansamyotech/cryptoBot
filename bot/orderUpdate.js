const Binance = require("node-binance-api");

const TradeDetails = require("../backend/models/tradeDetails.js");

const binance = new Binance().options({
  APIKEY: "whfiekZqKdkwa9fEeUupVdLZTNxBqP1OCEuH2pjyImaWt51FdpouPPrCawxbsupK",
  APISECRET: "E4IcteWOQ6r9qKrBZJoBy4R47nNPBDepVXMnS3Lf2Bz76dlu0QZCNh82beG2rHq4",
  useServerTime: true,
  test: false,
});

const ENVUSERID = process.env.USER_ID || "68a5c721b414893e08247236";
async function checkOrders(symbol) {
  try {
    const foundTread = await TradeDetails.findOne({
      symbol,
      createdBy: ENVUSERID,
    });

    if (!foundTread) return;
    console.log(`foundTread`, foundTread);

    if (!foundTread?.stopLossOrderId) {
      console.log(`No stopLossOrderId found for ${symbol}`);
      return;
    }

    const stopLossStatus = await binance.futuresOrderStatus(symbol, {
      orderId: parseInt(foundTread?.stopLossOrderId),
    });
    console.log(`stopLossStatus`, stopLossStatus?.status);

    if (
      stopLossStatus?.status === "FILLED" ||
      stopLossStatus?.status === "EXPIRED"
    ) {
      console.log(`Stop loss order filled for ${symbol}`);

      await TradeDetails.findOneAndUpdate(
        {
          _id: foundTread?._id,
          createdBy: ENVUSERID,
        },
        { status: "1" },
        { new: true }
      );
      console.log(`Trade marked as closed in DB for ${symbol}`, data?.data);
    } else {
      console.log(
        `Stop loss order not filled yet for ${symbol}. No action taken.`
      );
    }
  } catch (error) {
    console.error("Error checking stop loss order status:", error);
  }
}

module.exports = { checkOrders };
