const Binance = require("node-binance-api");

const { TradeDetailsSchema } = require("../backend/models/tradeDetails.js");

const binance = new Binance().options({
  APIKEY: "whfiekZqKdkwa9fEeUupVdLZTNxBqP1OCEuH2pjyImaWt51FdpouPPrCawxbsupK",
  APISECRET: "E4IcteWOQ6r9qKrBZJoBy4R47nNPBDepVXMnS3Lf2Bz76dlu0QZCNh82beG2rHq4",
  useServerTime: true,
  test: false,
});

const ENVUSERID = process.env.USER_ID || "68abfd1efba13b46a8c12fad";
async function checkOrders(symbol) {
  try {
    const foundTread = await TradeDetailsSchema.findOne({
      symbol: symbol,
      createdBy: ENVUSERID,
    });

    if (!foundTread) return;
    console.log(`foundTread`, foundTread);

    const { tradeDetails } = response.data?.data;
    const { stopLossOrderId, objectId } = tradeDetails;

    if (!stopLossOrderId) {
      console.log(`No stopLossOrderId found for ${symbol}`);
      return;
    }

    const stopLossStatus = await binance.futuresOrderStatus(symbol, {
      orderId: parseInt(stopLossOrderId),
    });
    console.log(`stopLossStatus`, stopLossStatus?.status);

    if (
      stopLossStatus?.status === "FILLED" ||
      stopLossStatus?.status === "EXPIRED"
    ) {
      console.log(`Stop loss order filled for ${symbol}`);

      await TradeDetailsSchema.findOneAndUpdate(
        {
          _id: objectId,
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
