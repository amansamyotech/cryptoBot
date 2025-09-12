const Binance = require("node-binance-api");
const { checkOrderForIndexRebuild } = require("./orderUpdate");
const { checkEntrySignal } = require("../helper/strategy");
const { getUsdtBalance } = require("../helper/getBalance.js");
const TradeDetails = require("../backend/models/tradeDetails.js");

const { setBotStopped } = require("../helper/is_running.js");
const mongoose = require("../backend/db.js");
mongoose.connection.once("open", () => {
  console.log("MongoDB connection is open!");
});
const isProcessing = {};
const binance = new Binance().options({
  APIKEY:
    process.env.BINANCE_APIKEY ||
    "0kB82SnxRkon7oDJqmCPykl4ar0afRYrScffMnRA3kTR8Qfq986IBwjqNA7fIauI",
  APISECRET:
    process.env.BINANCE_SECRETKEY ||
    "6TWxLtkLDaCfDh4j4YcLa2WLS99zkZtaQjJnsAeGAtixHIDXjPdJAta5BJxNWrZV",
  useServerTime: true,
  test: false,
});

const ENVUSERID = process.env.USER_ID || "68c3b15834798ae881dd8d3e";

const symbols = ["DOGEUSDT"];

const LEVERAGE = 3;

async function cancelAllOpenOrders(symbol) {
  try {
    const openOrders = await binance.futuresOpenOrders(symbol);
    if (openOrders.length === 0) return;

    for (const order of openOrders) {
      try {
        await binance.futuresCancel(symbol, { orderId: order.orderId });
        console.log(`[${symbol}] Canceled open order: ${order.orderId}`);
      } catch (err) {
        console.warn(
          `[${symbol}] Failed to cancel order ${order.orderId}: ${err.message}`
        );
      }
    }
  } catch (err) {
    console.error(`[${symbol}] Error fetching open orders: ${err.message}`);
  }
}

async function placeBuyOrder(symbol, marginAmount) {
  console.log(`symbol, marginAmount`, symbol, marginAmount);

  try {
    try {
      await binance.futuresMarginType(symbol, "ISOLATED");
      console.log(`[${symbol}] Margin type set to ISOLATED.`);
    } catch (err) {
      const msg = err?.body || err?.message || "";
      if (
        msg.includes("No need to change") ||
        msg.includes("margin type cannot be changed")
      ) {
        console.log(
          `[${symbol}] Margin type already ISOLATED or cannot be changed right now.`
        );
      } else {
        console.warn(`[${symbol}] Error setting margin type:`, msg);
      }
    }
    await binance.futuresLeverage(symbol, LEVERAGE);
    console.log(`[${symbol}] Leverage set to ${LEVERAGE}x`);

    const price = (await binance.futuresPrices())[symbol];
    console.log("pricepricepricepriceprice", price);

    const entryPrice = parseFloat(price);
    const positionValue = marginAmount * LEVERAGE;
    const quantity = parseFloat((positionValue / entryPrice).toFixed(6));

    const exchangeInfo = await binance.futuresExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
    const pricePrecision = symbolInfo.pricePrecision;
    const quantityPrecision = symbolInfo.quantityPrecision;
    const qtyFixed = quantity.toFixed(quantityPrecision);
    //3 percent roi
    // --- Fixed Percentage Stop Loss and Take Profit ---
    const takeProfitPerc = 1.0 / 100; // 1.0%
    const stopLossPerc = 1.0 / 100; // 1.0%

    const stopLossPrice = parseFloat(
      (entryPrice * (1 - stopLossPerc)).toFixed(pricePrecision)
    );
    const takeProfitPrice = parseFloat(
      (entryPrice * (1 + takeProfitPerc)).toFixed(pricePrecision)
    );
    //2 percent roi
    // Current fixed percentage code replace karo
    // const targetROI = 2; // 2% ROI target
    // const stopLossROI = -2; // -2% ROI stop loss

    // // ROI to price conversion
    // const takeProfitPnL = (targetROI / 100) * marginAmount;
    // const stopLossPnL = (stopLossROI / 100) * marginAmount;

    // const takeProfitPrice = parseFloat(
    //   (entryPrice + takeProfitPnL / quantity).toFixed(pricePrecision)
    // );
    // const stopLossPrice = parseFloat(
    //   (entryPrice + stopLossPnL / quantity).toFixed(pricePrecision)
    // );

    console.log(
      `SL/TP prices for LONG: SL=${stopLossPrice}, TP=${takeProfitPrice}`
    );
    const buyOrder = await binance.futuresMarketBuy(symbol, qtyFixed);
    console.log(`Bought ${symbol} at ${entryPrice}`);

    const buyOrderDetails = {
      side: "LONG",
      symbol,
      quantity: qtyFixed,
      LongTimeCoinPrice: entryPrice,
      placeOrderId: buyOrder.orderId,
      marginUsed: marginAmount,
      leverage: LEVERAGE,
      positionValue: positionValue,
    };

    console.log(`buyOrderDetails`, buyOrderDetails);
    const createdTrade = await TradeDetails.create(buyOrderDetails);
    console.log(`Trade Response:`, createdTrade);

    const tradeId = createdTrade._id;

    const stopLossOrder = await binance.futuresOrder(
      "STOP_MARKET",
      "SELL",
      symbol,
      qtyFixed,
      null,
      {
        stopPrice: stopLossPrice,
        reduceOnly: true,
        timeInForce: "GTC",
      }
    );
    console.log(`stopLossOrder.orderId`, stopLossOrder.orderId);
    const takeProfitOrder = await binance.futuresOrder(
      "TAKE_PROFIT_MARKET",
      "SELL",
      symbol,
      qtyFixed,
      null,
      {
        stopPrice: takeProfitPrice,
        reduceOnly: true,
        timeInForce: "GTC",
      }
    );

    const details = {
      stopLossPrice: stopLossPrice,
      stopLossOrderId: stopLossOrder.orderId,
      takeProfitPrice: takeProfitPrice,
      takeProfitOrderId: takeProfitOrder.orderId,
    };
    console.log(`details`, details);

    await TradeDetails.findOneAndUpdate(
      { _id: tradeId, createdBy: ENVUSERID },
      { $set: details },
      { new: true }
    );
  } catch (error) {
    console.error(`Error placing LONG order for ${symbol}:`, error);
  }
}
async function placeShortOrder(symbol, marginAmount) {
  try {
    try {
      await binance.futuresMarginType(symbol, "ISOLATED");
      console.log(`[${symbol}] Margin type set to ISOLATED.`);
    } catch (err) {
      const msg = err?.body || err?.message || "";
      if (
        msg.includes("No need to change") ||
        msg.includes("margin type cannot be changed")
      ) {
        console.log(
          `[${symbol}] Margin type already ISOLATED or cannot be changed right now.`
        );
      } else {
        console.warn(`[${symbol}] Error setting margin type:`, msg);
      }
    }
    await binance.futuresLeverage(symbol, LEVERAGE);
    console.log(`[${symbol}] Leverage set to ${LEVERAGE}x`);

    const price = (await binance.futuresPrices())[symbol];
    const entryPrice = parseFloat(price);
    const positionValue = marginAmount * LEVERAGE;
    const quantity = parseFloat((positionValue / entryPrice).toFixed(6));

    const exchangeInfo = await binance.futuresExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
    const pricePrecision = symbolInfo.pricePrecision;
    const quantityPrecision = symbolInfo.quantityPrecision;
    const qtyFixed = quantity.toFixed(quantityPrecision);

    //new 3 prcent
    // --- Fixed Percentage Stop Loss and Take Profit ---
    const takeProfitPerc = 1.0 / 100; // 1.0%
    const stopLossPerc = 1.0 / 100; // 1.0%

    const stopLossPrice = parseFloat(
      (entryPrice * (1 + stopLossPerc)).toFixed(pricePrecision)
    );
    const takeProfitPrice = parseFloat(
      (entryPrice * (1 - takeProfitPerc)).toFixed(pricePrecision)
    );

    //new 2 percent
    // const targetROI = 2; // 2% ROI target
    // const stopLossROI = -2; // -2% ROI stop loss

    // // ROI to price conversion for SHORT
    // const takeProfitPnL = (targetROI / 100) * marginAmount;
    // const stopLossPnL = (stopLossROI / 100) * marginAmount;

    // const takeProfitPrice = parseFloat(
    //   (entryPrice - takeProfitPnL / quantity).toFixed(pricePrecision)
    // );
    // const stopLossPrice = parseFloat(
    //   (entryPrice - stopLossPnL / quantity).toFixed(pricePrecision)
    // );
    console.log(
      `SL/TP prices for SHORT: SL=${stopLossPrice}, TP=${takeProfitPrice}`
    );

    console.log(`entryPrice`, entryPrice);
    console.log(`stopLossPrice`, stopLossPrice);

    console.log(`SHORT Order Details for ${symbol}:`);
    console.log(`Entry Price: ${entryPrice}`);
    console.log(`Quantity: ${qtyFixed}`);
    console.log(`Margin Used: ${marginAmount}`);
    console.log(`Position Value: ${positionValue} (${LEVERAGE}x leverage)`);

    const shortOrder = await binance.futuresMarketSell(symbol, qtyFixed, {
      reduceOnly: false, // Explicitly set for opening position
    });
    console.log(`Shorted ${symbol} at ${entryPrice}`);

    const shortOrderDetails = {
      side: "SHORT",
      symbol,
      quantity: qtyFixed,
      ShortTimeCurrentPrice: entryPrice,
      placeOrderId: shortOrder.orderId,
      marginUsed: marginAmount,
      leverage: LEVERAGE,
      positionValue: positionValue,
    };

    console.log(`shortOrderDetails`, shortOrderDetails);

    const createdTrade = await TradeDetails.create(shortOrderDetails);

    console.log(`Trade Response:`, createdTrade);

    const tradeId = createdTrade._id;

    const stopLossOrder = await binance.futuresOrder(
      "STOP_MARKET",
      "BUY",
      symbol,
      qtyFixed,
      null,
      {
        stopPrice: stopLossPrice,
        reduceOnly: true,
        timeInForce: "GTC",
      }
    );
    const takeProfitOrder = await binance.futuresOrder(
      "TAKE_PROFIT_MARKET",
      "BUY",
      symbol,
      qtyFixed,
      null,
      {
        stopPrice: takeProfitPrice,
        reduceOnly: true,
        timeInForce: "GTC",
      }
    );
    console.log(
      `Take Profit set at ${takeProfitPrice} for ${symbol} (ATR-based)`
    );

    const details = {
      stopLossPrice: stopLossPrice,
      stopLossOrderId: stopLossOrder.orderId,
      takeProfitPrice: takeProfitPrice,
      takeProfitOrderId: takeProfitOrder.orderId,
    };

    console.log(`details`, details);

    await TradeDetails.findOneAndUpdate(
      { _id: tradeId, createdBy: ENVUSERID },
      { $set: details },
      { new: true }
    );
  } catch (error) {
    console.error(`Error placing SHORT order for ${symbol}:`, error);
  }
}
async function processSymbol(symbol, maxSpendPerTrade) {
  console.log(
    `symbol, processSymbol maxSpendPerTrade`,
    symbol,
    maxSpendPerTrade
  );

  // const decision = await checkEntrySignal(symbol);
  const decision = "LONG";
  console.log("decision", decision);
  if (decision === "LONG") {
    await placeBuyOrder(symbol, maxSpendPerTrade);
  } else if (decision === "SHORT") {
    await placeShortOrder(symbol, maxSpendPerTrade);
  } else {
    console.log(`No trade signal for ${symbol}`);
  }
}

setInterval(async () => {
  const totalBalance = await getUsdtBalance();

  if (totalBalance < 6) {
    const errorMessage = `Balance is ${totalBalance} USDT — minimum required is 10 USDT to run the bot.`;
    console.log(`🛑 ${errorMessage}`);
    await setBotStopped(ENVUSERID, errorMessage);
    process.exit(0);
  }
  const usableBalance = totalBalance - 1;
  const maxSpendPerTrade = usableBalance / symbols.length;

  console.log(`Total Balance: ${totalBalance} USDT`);
  console.log(`Usable Balance: ${usableBalance} USDT`);
  console.log(`Max Spend Per Trade: ${maxSpendPerTrade} USDT`);
  if (maxSpendPerTrade >= 1.6) {
    for (const sym of symbols) {
      try {
        const trades = await TradeDetails.findOne({
          symbol: sym,
          status: "0",
          createdBy: ENVUSERID,
        });
        console.log(`trades`, trades);

        if (!trades) {
          await processSymbol(sym, maxSpendPerTrade);
        } else {
          console.log(`TRADE ALREADY OPEN FOR SYMBOL: ${sym}`);
        }
      } catch (err) {
        console.error(`Error with ${sym}:`, err.message);
      }
    }
  } else {
    console.log("not enough amount");
  }
}, 7000);

setInterval(async () => {
  for (const sym of symbols) {
    await checkOrderForIndexRebuild(sym);
  }
}, 10000);

setInterval(async () => {
  for (const sym of symbols) {
    try {
      const trades = await TradeDetails.findOne({
        symbol: sym,
        status: "0",
        createdBy: ENVUSERID,
      });
      if (trades) {
        // Trade open (your logic: false means open trade)
        if (isProcessing[sym]) {
          console.log(`[${sym}] Skipping trailing — already processing.`);
          continue;
        }
        isProcessing[sym] = true;

        // Confirm position is open (sync with DB)
        const positions = await binance.futuresPositionRisk({ symbol: sym });
        const pos = positions.find((p) => p.symbol === sym);
        if (!pos || Math.abs(parseFloat(pos.positionAmt || 0)) === 0) {
          console.log(
            `[${sym}] Position already closed or doesn't exist. Updating DB to close trade.`
          );

          const tradeResponse = await TradeDetails.findOne({
            symbol: sym,
            status: "0",
            createdBy: ENVUSERID,
          });

          if (tradeResponse) {
            try {
              const res = await binance.futuresCancelAll(sym);
              console.log(`✅ All open orders cancelled for ${sym}`, res);
            } catch (e) {
              console.log(
                `⚠️ Failed to cancel all orders for ${sym}:`,
                e.body || e.message
              );
            }
            await TradeDetails.findOneAndUpdate(
              { _id: tradeResponse._id, createdBy: ENVUSERID },
              { status: "1" }
            );
            console.log(`[${sym}] DB updated: Trade marked as closed.`);
          }
          continue;
        }

        const tradeResponse = await TradeDetails.findOne({
          symbol: sym,
          status: "0",
          createdBy: ENVUSERID,
        });
        if (tradeResponse) {
          const priceMap = await binance.futuresPrices();
          const currentPrice = parseFloat(priceMap[sym]);
          let roi = 0;

          if (tradeResponse.side === "LONG") {
            const entryPrice = parseFloat(
              tradeResponse.LongTimeCoinPrice.$numberDecimal
            );
            const qty = parseFloat(tradeResponse.quantity);
            const margin = parseFloat(tradeResponse.marginUsed);
            const pnl = (currentPrice - entryPrice) * qty;
            roi = (pnl / margin) * 100;
          } else if (tradeResponse.side === "SHORT") {
            const entryPrice = parseFloat(
              tradeResponse.ShortTimeCurrentPrice.$numberDecimal
            );
            const qty = parseFloat(tradeResponse.quantity);
            const margin = parseFloat(tradeResponse.marginUsed);
            const pnl = (entryPrice - currentPrice) * qty;
            roi = (pnl / margin) * 100;
          }

          // TEMA exit check sirf tab karo jab ROI 1% positive ho ya 1% negative ho
          // if (roi >= 0.2 || roi <= -0.2) {
          //   const shouldExit = await checkTEMAExit(sym, tradeDetails);
          //   if (shouldExit) {
          //     const exitSuccess = await executeTEMAExit(sym, tradeDetails);
          //     if (exitSuccess) {
          //       console.log(
          //         `[${sym}] Position closed due to TEMA exit signal at ROI: ${roi.toFixed(
          //           2
          //         )}%`
          //       );
          //       continue;
          //     }
          //   }
          // }

          // if (roi > 2) {
          //   // Start trailing when profit > 1%
          //   const newStopLoss = await calculateTrailingStopLoss(
          //     sym,
          //     tradeDetails,
          //     currentPrice
          //   );
          //   if (newStopLoss) {
          //     const updateSuccess = await updateTrailingStopLoss(
          //       sym,
          //       tradeDetails,
          //       newStopLoss
          //     );
          //     if (updateSuccess) {
          //       console.log(
          //         `[${sym}] Trailing stop loss updated at ROI: ${roi.toFixed(
          //           2
          //         )}%`
          //       );
          //     }
          //   }
          // }
          // **NAYA CODE KHATAM**
        }
      }
    } catch (err) {
      console.error(`Error with ${sym}:`, err.message);
    } finally {
      isProcessing[sym] = false;
    }
  }
}, 5000);

async function gracefulShutdown(code = 0, reason = "Unknown") {
  try {
    console.log(`🛑 Bot shutting down: ${reason}`);
    await setBotStopped(ENVUSERID);
  } catch (err) {
    console.error("Error during shutdown:", err);
  } finally {
    process.exit(code);
  }
}

process.on("SIGTERM", () => gracefulShutdown(0, "SIGTERM"));
process.on("uncaughtException", (err) => {
  console.error("💥 Uncaught Exception:", err);
  gracefulShutdown(1, "uncaughtException");
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("💥 Unhandled Rejection:", reason);
  gracefulShutdown(1, "unhandledRejection");
});
