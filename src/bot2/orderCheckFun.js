const Binance = require("node-binance-api");
const axios = require("axios");

const API_ENDPOINT = "http://localhost:3001/api/buySell/";

const binance = new Binance().options({
  APIKEY: "whfiekZqKdkwa9fEeUupVdLZTNxBqP1OCEuH2pjyImaWt51FdpouPPrCawxbsupK",
  APISECRET: "E4IcteWOQ6r9qKrBZJoBy4R47nNPBDepVXMnS3Lf2Bz76dlu0QZCNh82beG2rHq4",
  useServerTime: true,
  test: false,
});

async function checkOrders(symbol) {
  try {
    const response = await axios.get(`${API_ENDPOINT}find-treads/${symbol}`);
    console.log(`response.data?.data`, response.data?.data);
    const { found } = response.data?.data;
    if (!found) return;

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

    if (stopLossStatus?.status === "FILLED") {
      console.log(`Stop loss order filled for ${symbol}`);

      const data = await axios.put(`${API_ENDPOINT}${objectId}`, {
        data: { status: "1" },
      });

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
