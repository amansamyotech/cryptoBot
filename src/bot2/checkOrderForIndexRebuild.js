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

    // Check order statuses
    const orders = [];
    if (stopLossOrderId) {
      try {
        const res = await binance.futuresOrderStatus(symbol, {
          orderId: parseInt(stopLossOrderId),
        });
        orders.push({ id: stopLossOrderId, status: res?.status });
      } catch (e) {
        orders.push({ id: stopLossOrderId, status: "ERROR" });
      }
    }
    if (takeProfitOrderId) {
      try {
        const res = await binance.futuresOrderStatus(symbol, {
          orderId: parseInt(takeProfitOrderId),
        });
        orders.push({ id: takeProfitOrderId, status: res?.status });
      } catch (e) {
        orders.push({ id: takeProfitOrderId, status: "ERROR" });
      }
    }

    // Check if any order is FILLED, CANCELED, or EXPIRED
    const shouldClose = orders.some(
      (o) =>
        o.status === "FILLED" ||
        o.status === "CANCELED" ||
        o.status === "EXPIRED" ||
        o.status === "ERROR"
    );

    if (shouldClose) {
      console.log(`Closing trade for ${symbol}. Order statuses:`, orders);

      // Cancel all open orders for symbol
      try {
        await binance.futuresCancelAll(symbol);
      } catch (e) {
        console.log(
          `Cancel all failed for ${symbol}, trying individual cancel`
        );
        for (const order of orders) {
          if (order.status === "NEW") {
            try {
              await binance.futuresCancel(symbol, parseInt(order.id));
            } catch (err) {}
          }
        }
      }

      // Update DB
      await axios.put(`${API_ENDPOINT}${objectId}`, { data: { status: "1" } });
      console.log(`Trade closed for ${symbol}`);
    }
  } catch (error) {
    console.error(`Error for ${symbol}:`, error.message);
  }
}

module.exports = { checkOrderForIndexRebuild };
