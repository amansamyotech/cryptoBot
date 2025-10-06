const axios = require("axios");
const { exchange } = require("./exchanges/ccxtClient");

const API_ENDPOINT = "http://localhost:3001/api/buySell/";

async function checkOrders(symbol) {
  try {
    const response = await axios.get(`${API_ENDPOINT}find-treads/${symbol}`);
    console.log(`response.data?.data`, response.data?.data);

    const { found } = response.data?.data;

    if (!found) return;

    const { tradeDetails } = response.data?.data;
    const { stopLossOrderId, takeProfitOrderId, objectId } = tradeDetails;
    console.log(
      ` stopLossOrderId, takeProfitOrderId,`,
      stopLossOrderId,
      takeProfitOrderId
    );

    console.log(`objectId:`, objectId);

    if (!stopLossOrderId && !takeProfitOrderId) {
      console.log(`No order IDs found for ${symbol}`);
      return;
    }

    // Check stop-loss order status if it exists
    let stopLossStatus = null;
    if (stopLossOrderId) {
      const order = await exchange.fetchOrder(stopLossOrderId, symbol);
      stopLossStatus = order.status;
    }

    // Check take-profit order status if it exists
    let takeProfitStatus = null;
    if (takeProfitOrderId) {
      const order = await exchange.fetchOrder(takeProfitOrderId, symbol);
      takeProfitStatus = order.status;
    }

    const stopLossOrderStatus = stopLossStatus?.status;
    const takeProfitOrderStatus = takeProfitStatus?.status;

    console.log(
      `Stop Loss Status for ${symbol}:`,
      stopLossOrderStatus || "N/A"
    );
    console.log(
      `Take Profit Status for ${symbol}:`,
      takeProfitOrderStatus || "N/A"
    );

    const isStopLossFilled = stopLossOrderStatus === "FILLED";
    const isTakeProfitFilled = takeProfitOrderStatus === "FILLED";

    if (isStopLossFilled || isTakeProfitFilled) {
      console.log(`One of the orders is filled for ${symbol}`);

      // Cancel all remaining orders for this symbol
      try {
        const openOrders = await exchange.fetchOpenOrders(symbol);
        console.log(`Found ${openOrders.length} open orders for ${symbol}`);

        for (const order of openOrders) {
          try {
            await exchange.cancelOrder(order.id, symbol);
            console.log(`Canceled order ${order.orderId} for ${symbol}`);
          } catch (err) {
            console.warn(
              `Failed to cancel order ${order.orderId} for ${symbol}:`,
              err.message
            );
          }
        }
      } catch (err) {
        console.error(
          `Error fetching/canceling open orders for ${symbol}:`,
          err.message
        );
      }
      // Mark trade as closed
      const data = await axios.put(`${API_ENDPOINT}${objectId}`, {
        data: { status: "1" },
      });
      console.log(`Trade marked as closed in DB for ${symbol}`, data?.data);
    } else {
      console.log(
        `Neither order is filled yet for ${symbol}. No action taken.`
      );
    }
  } catch (error) {
    console.error("Error checking or canceling orders:", error);
  }
}
module.exports = { checkOrders };
