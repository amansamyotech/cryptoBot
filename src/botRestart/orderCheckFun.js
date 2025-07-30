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
      orderId: stopLossOrderId,
    });

    const stopLossOrderStatus = stopLossStatus?.status;
    console.log(`Stop Loss Status for ${symbol}:`, stopLossOrderStatus);

    if (stopLossOrderStatus === "FILLED") {
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
