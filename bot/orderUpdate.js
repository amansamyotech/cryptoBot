require("dotenv").config({ path: "../.env" });
const Binance = require("node-binance-api");
const TradeDetails = require("../backend/models/tradeDetails.js");


const binance = new Binance().options({
  APIKEY: process.env.BINANCE_APIKEY || "0kB82SnxRkon7oDJqmCPykl4ar0afRYrScffMnRA3kTR8Qfq986IBwjqNA7fIauI",
  APISECRET: process.env.BINANCE_SECRETKEY || "6TWxLtkLDaCfDh4j4YcLa2WLS99zkZtaQjJnsAeGAtixHIDXjPdJAta5BJxNWrZV",
  useServerTime: true,
  test: false,
});

const ENVUSERID = process.env.USER_ID || "68c3b15834798ae881dd8d3e";

async function checkOrderForIndexRebuild(symbol) {
  try {
    const foundTread = await TradeDetails.findOne({
      symbol,
      status: "0",
      createdBy: ENVUSERID,
    });

    if (!foundTread) return;
    const { stopLossOrderId, takeProfitOrderId } = foundTread;
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
            } catch (err) {
              console.log(`err`, err);
            }
          }
        }
      }

      // Update DB
      await TradeDetails.findOneAndUpdate(
        {
          _id: foundTread?._id,
        },
        { status: "1" },
        { new: true }
      );
      console.log(`Trade closed for ${symbol}`);
    }
  } catch (error) {
    console.error(`Error for ${symbol}:`, error.message);
  }
}

module.exports = { checkOrderForIndexRebuild };
