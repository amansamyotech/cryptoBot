const Binance = require("node-binance-api");
const axios = require("axios");
const API_ENDPOINT = "http://localhost:3000/api/buySell/";

const binance = new Binance().options({
  APIKEY: "tPCOyhkpaVUj6it6BiKQje0WxcJjUOV30EQ7dY2FMcqXunm9DwC8xmuiCkgsyfdG",
  APISECRET: "UpK4CPfKywFrAJDInCAXPmWVSiSs5xVVL2nDes8igCONl3cVgowDjMbQg64fm5pr",
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
    // const { stopLossOrderId, objectId } = tradeDetails;
let stopLossOrderId = "45819419501"
    if (!stopLossOrderId) {
      console.log(`No stopLossOrderId found for ${symbol}`);
      return;
    }

    const stopLossStatus = await binance.futuresOrderStatus(symbol, {
      orderId: stopLossOrderId,
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
checkOrders("1000PEPEUSDT")
module.exports = { checkOrders };
