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
    console.log(`response.data?.data`, response.data?.data);
    const { found } = response.data?.data;
    if (!found) return;

    const { tradeDetails } = response.data?.data;
    const { stopLossOrderId, takeProfitOrderId, objectId } = tradeDetails;

    if (!stopLossOrderId && !takeProfitOrderId) {
      console.log(
        `No stopLossOrderId or takeProfitOrderId found for ${symbol}`
      );
      return;
    }

    // Fetch order statuses
    let stopLossStatus = null;
    let takeProfitStatus = null;

    if (stopLossOrderId) {
      const stopLossRes = await binance.futuresOrderStatus(symbol, {
        orderId: parseInt(stopLossOrderId),
      });
      stopLossStatus = stopLossRes?.status;
      console.log(`stopLossStatus`, stopLossStatus);
    }

    if (takeProfitOrderId) {
      const takeProfitRes = await binance.futuresOrderStatus(symbol, {
        orderId: parseInt(takeProfitOrderId),
      });
      takeProfitStatus = takeProfitRes?.status;
      console.log(`takeProfitStatus`, takeProfitStatus);
    }

    // These are considered terminal states
    const isStopLossFinal = ["FILLED", "EXPIRED", "CANCELED"].includes(
      stopLossStatus
    );
    const isTakeProfitFinal = ["FILLED", "EXPIRED", "CANCELED"].includes(
      takeProfitStatus
    );

    if (isStopLossFinal || isTakeProfitFinal) {
      console.log(
        `Either stopLoss or takeProfit is in final state for ${symbol}. Proceeding to cancel the other if needed.`
      );

      // Cancel the opposite order if it's still NEW
      if (isStopLossFinal && takeProfitOrderId && takeProfitStatus === "NEW") {
        await binance.futuresCancel(symbol, {
          orderId: parseInt(takeProfitOrderId),
        });
        console.log(`Cancelled takeProfitOrderId for ${symbol}`);
      } else if (
        isTakeProfitFinal &&
        stopLossOrderId &&
        stopLossStatus === "NEW"
      ) {
        await binance.futuresCancel(symbol, {
          orderId: parseInt(stopLossOrderId),
        });
        console.log(`Cancelled stopLossOrderId for ${symbol}`);
      }

      // Update DB
      const data = await axios.put(`${API_ENDPOINT}${objectId}`, {
        data: { status: "1" },
      });
      console.log(`Trade marked as closed in DB for ${symbol}`, data?.data);
    } else {
      console.log(
        `Neither Stop Loss nor Take Profit is in a final state for ${symbol}. No action taken.`
      );
    }
  } catch (error) {
    console.error("Error checking order statuses:", error);
  }
}

module.exports = { checkOrderForIndexRebuild };
