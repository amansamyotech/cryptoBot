const Binance = require("node-binance-api");
const axios = require("axios");

const API_ENDPOINT = "http://localhost:3000/api/buySell/";

const binance = new Binance().options({
  APIKEY: "tPCOyhkpaVUj6it6BiKQje0WxcJjUOV30EQ7dY2FMcqXunm9DwC8xmuiCkgsyfdG",
  APISECRET: "UpK4CPfKywFrAJDInCAXPmWVSiSs5xVVL2nDes8igCONl3cVgowDjMbQg64fm5pr",
  useServerTime: true,
  test: false,
});

async function orderCheckFunForFix(symbol) {
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
      stopLossStatus = await binance.futuresOrderStatus(symbol, {
        orderId: stopLossOrderId,
      });
    }

    // Check take-profit order status if it exists
    let takeProfitStatus = null;
    if (takeProfitOrderId) {
      takeProfitStatus = await binance.futuresOrderStatus(symbol, {
        orderId: takeProfitOrderId,
      });
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

      // Cancel stop-loss if not filled and exists
      if (stopLossOrderId && !isStopLossFilled) {
        const recheckStopLoss = await binance.futuresOrderStatus(symbol, {
          orderId: stopLossOrderId,
        });
        if (
          recheckStopLoss?.status !== "CANCELED" &&
          recheckStopLoss?.status !== "FILLED"
        ) {
          await binance.futuresCancel(symbol, { orderId: stopLossOrderId });
          console.log(`Stop Loss order canceled for ${symbol}`);
        } else {
          console.log(`Stop Loss already canceled or filled for ${symbol}`);
        }
      }

      // Cancel take-profit if not filled and exists
      if (takeProfitOrderId && !isTakeProfitFilled) {
        const recheckTakeProfit = await binance.futuresOrderStatus(symbol, {
          orderId: takeProfitOrderId,
        });
        if (
          recheckTakeProfit?.status !== "CANCELED" &&
          recheckTakeProfit?.status !== "FILLED"
        ) {
          await binance.futuresCancel(symbol, { orderId: takeProfitOrderId });
          console.log(`Take Profit order canceled for ${symbol}`);
        } else {
          console.log(`Take Profit already canceled or filled for ${symbol}`);
        }
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
module.exports = { orderCheckFunForFix };
