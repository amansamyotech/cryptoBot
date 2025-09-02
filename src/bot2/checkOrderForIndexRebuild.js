const Binance = require("node-binance-api");
const axios = require("axios");

const API_ENDPOINT = "http://localhost:3001/api/buySell/";

const binance = new Binance().options({
  APIKEY: "0kB82SnxRkon7oDJqmCPykl4ar0afRYrScffMnRA3kTR8Qfq986IBwjqNA7fIauI",
  APISECRET: "6TWxLtkLDaCfDh4j4YcLa2WLS99zkZtaQjJnsAeGAtixHIDXjPdJAta5BJxNWrZV",
  useServerTime: true,
  test: false,
});

async function checkOrderForIndexRebuild(symbol) {
  try {
    const response = await axios.get(`${API_ENDPOINT}find-treads/${symbol}`);
    const { found, tradeDetails } = response.data?.data || {};
    if (!found || !tradeDetails) return;

    const { stopLossOrderId, takeProfitOrderId, objectId } = tradeDetails;
    if (!stopLossOrderId && !takeProfitOrderId) return;

    // Fetch order statuses
    const orders = [];
    if (stopLossOrderId) {
      const stopLossRes = await binance.futuresOrderStatus(symbol, {
        orderId: parseInt(stopLossOrderId),
      });
      orders.push({ id: stopLossOrderId, status: stopLossRes?.status });
    }
    if (takeProfitOrderId) {
      const takeProfitRes = await binance.futuresOrderStatus(symbol, {
        orderId: parseInt(takeProfitOrderId),
      });
      orders.push({ id: takeProfitOrderId, status: takeProfitRes?.status });
    }

    // Check if any order is FILLED
    const anyFilled = orders.some((o) => o.status === "FILLED");
    if (anyFilled) {
      console.log(
        `An order is FILLED for ${symbol}. Cancelling all other open orders...`
      );

      // Cancel all orders that are not FILLED
      for (const o of orders) {
        if (o.status === "NEW") {
          await binance.futuresCancel(symbol, { orderId: parseInt(o.id) });
          console.log(`Cancelled orderId ${o.id} for ${symbol}`);
        }
      }

      // Update DB
      await axios.put(`${API_ENDPOINT}${objectId}`, { data: { status: "1" } });
      console.log(`Trade marked as closed in DB for ${symbol}`);
    } else {
      console.log(`No order FILLED yet for ${symbol}. No action taken.`);
    }
  } catch (error) {
    console.error("Error checking order statuses:", error);
  }
}

module.exports = { checkOrderForIndexRebuild };
