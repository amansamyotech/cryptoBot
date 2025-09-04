const Binance = require("node-binance-api");
const { checkOrderForIndexRebuild } = require("./orderUpdate.js");
const { getCandles } = require("../helper/getCandlesWebSokcets.js");
const {
  calculateTEMA
} = require("../helper/calculateTEMA.js");
const { getUsdtBalance } = require("../helper/getBalance.js");
const {
  hasNewCandleFormed,
  getTEMA,
} = require("../helper/hasNewCandleFormed.js");
const TradeDetails = require("../backend/models/tradeDetails.js");
const mongoose = require("../backend/db.js");
mongoose.connection.once("open", () => {
  console.log("MongoDB connection is open!");
});
const isProcessing = {};
const lastTradeSide = {};
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

const ENVUSERID = process.env.USER_ID || "68abfbaefba13b46a8c12f99";

const symbols = ["DOGEUSDT", "SOLUSDT"];

const LEVERAGE = 3;
const ATR_LENGTH = 25;
const ATR_MULTIPLIER_SL = 2.0;
const ATR_MULTIPLIER_TP = 3.0;

function getTEMApercentage(tema15, tema21) {
  const total = tema15 + tema21;

  const percent15 = (tema15 / total) * 100;
  const percent21 = (tema21 / total) * 100;

  return {
    percent15,
    percent21,
  };
}


async function checkTEMAEntry(symbol) {
  try {
    const tema15 = await getTEMA(symbol, 15);

    console.log(`tema15`, tema15);

    const tema21 = await getTEMA(symbol, 21);
    console.log(`tema21`, tema21);

    const { percent15, percent21 } = getTEMApercentage(tema15, tema21);
    console.log(`percent15, percent21`, percent15, percent21);

    if (!percent15 || !percent21) {
      console.log(`[${symbol}] Could not calculate TEMA values`);
      return "HOLD";
    }

    // Get previous TEMA values to detect crossover
    const candles = await getCandles(symbol, "3m", 100);
    const closePrices = candles.map((c) => c.close);

    if (closePrices.length < 50) return "HOLD";

    // Calculate previous TEMA values
    const prevClosePrices = closePrices.slice(0, -1);
    const prevTema15 = calculateTEMA(prevClosePrices, 15);
    const prevTema21 = calculateTEMA(prevClosePrices, 21);
    console.log(`prevTema15 || !prevTema21`, prevTema15, prevTema21);

    if (!prevTema15 || !prevTema21) return "HOLD";

    // Check for crossover

    //main line
    // const longCondition = prevTema15 <= prevTema21 && percent15 > percent21; // Cross above
    // const shortCondition = prevTema15 >= prevTema21 && percent15 < percent21; // Cross below
    const longCondition = percent15 > percent21; // Cross above
    const shortCondition = percent15 < percent21; // Cross below

    if (longCondition) {
      console.log(`[${symbol}] TEMA 15 crossed above TEMA 21 - LONG signal`);
      return "LONG";
    } else if (shortCondition) {
      console.log(`[${symbol}] TEMA 15 crossed below TEMA 21 - SHORT signal`);
      return "SHORT";
    }

    return "HOLD";
  } catch (err) {
    console.error(`[${symbol}] Error in TEMA entry check:`, err.message);
    return "HOLD";
  }
}

function calculateATR(candles, length = ATR_LENGTH) {
  if (candles.length < length + 1) return null;

  const trueRanges = [];

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;

    const tr1 = high - low;
    const tr2 = Math.abs(high - prevClose);
    const tr3 = Math.abs(low - prevClose);

    trueRanges.push(Math.max(tr1, tr2, tr3));
  }

  if (trueRanges.length < length) return null;

  let atr = trueRanges.slice(0, length).reduce((a, b) => a + b, 0) / length;

  const multiplier = 2 / (length + 1);
  for (let i = length; i < trueRanges.length; i++) {
    atr = trueRanges[i] * multiplier + atr * (1 - multiplier);
  }

  return atr;
}
async function getATR(symbol, length = ATR_LENGTH) {
  try {
    const candles = await getCandles(symbol, "3m", length + 20);
    return calculateATR(candles, length);
  } catch (err) {
    console.error(`Error calculating ATR for ${symbol}:`, err.message);
    return null;
  }
}
async function checkTEMAExit(symbol, tradeDetails) {
  try {
    const hasNewCandle = await hasNewCandleFormed(symbol, "entry");

    if (!hasNewCandle) {
      console.log(`[${symbol}] No new candle formed yet, skipping entry check`);
      return;
    }

    const { side } = tradeDetails;

    // Get current TEMA signals
    const tema15 = await getTEMA(symbol, 15);
    const tema21 = await getTEMA(symbol, 21);

    const candles = await getCandles(symbol, "3m", 100);
    const closePrices = candles.map((c) => c.close);

    if (closePrices.length < 50) return "HOLD";

    // Calculate previous TEMA values
    const prevClosePrices = closePrices.slice(0, -1);
    const prevTema15 = calculateTEMA(prevClosePrices, 15);
    const prevTema21 = calculateTEMA(prevClosePrices, 21);
    console.log(`prevTema15 || !prevTema21`, prevTema15, prevTema21);

    if (!prevTema15 || !prevTema21) return "HOLD";

    const { percent15, percent21 } = getTEMApercentage(tema15, tema21);
    // For LONG position - exit if TEMA 15 crosses below TEMA 21
    if (side === "LONG" && prevTema15 >= prevTema21 && percent15 < percent21) {
      console.log(`[${symbol}] LONG Exit: TEMA 15 crossed below TEMA 21`);
      return true;
    }

    // For SHORT position - exit if TEMA 15 crosses above TEMA 21
    if (side === "SHORT" && prevTema15 <= prevTema21 && percent15 > percent21) {
      console.log(`[${symbol}] SHORT Exit: TEMA 15 crossed above TEMA 21`);
      return true;
    }

    return false;
  } catch (err) {
    console.error(`[${symbol}] Error checking TEMA exit:`, err.message);
    return false;
  }
}
async function cancelAllOpenOrders(symbol) {
  try {
    const openOrders = await binance.futuresOpenOrders(symbol);
    if (openOrders.length === 0) return;

    for (const order of openOrders) {
      try {
        await binance.futuresCancel(symbol, order.orderId);
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
async function executeTEMAExit(symbol, tradeDetails) {
  try {
    const { quantity, stopLossOrderId } = tradeDetails;
    const side = tradeDetails.side;
    await cancelAllOpenOrders(symbol);
    if (stopLossOrderId) {
      try {
        await binance.futuresCancel(symbol, stopLossOrderId);
        console.log(`[${symbol}] Canceled stop loss order: ${stopLossOrderId}`);
      } catch (err) {
        if (err.code !== -2011 && err.code !== -1102) {
          console.warn(
            `[${symbol}] Failed to cancel stop loss: ${err.message}`
          );
        }
      }
    }

    const exchangeInfo = await binance.futuresExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
    const quantityPrecision = symbolInfo.quantityPrecision;
    const qtyFixed = parseFloat(quantity).toFixed(quantityPrecision);

    let exitOrder;
    if (side === "LONG") {
      exitOrder = await binance.futuresMarketSell(symbol, qtyFixed, {
        reduceOnly: true,
      });
    } else {
      exitOrder = await binance.futuresMarketBuy(symbol, qtyFixed, {
        reduceOnly: true,
      });
    }

    console.log(
      `[${symbol}] TEMA Exit executed - Order ID: ${exitOrder.orderId}`
    );

    await TradeDetails.findOneAndUpdate(
      { _id: tradeDetails._id, createdBy: ENVUSERID },
      { status: "1" }
    );

    return true;
  } catch (err) {
    console.error(`[${symbol}] Error executing TEMA exit:`, err.message);
    return false;
  }
}
async function placeBuyOrder(symbol, marginAmount) {
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

    // ATR-based Stop Loss and Take Profit
    const atr = await getATR(symbol, ATR_LENGTH);
    const atrMultiplierSL = ATR_MULTIPLIER_SL; // Same as Pine Script
    const atrMultiplierTP = ATR_MULTIPLIER_TP; // Same as Pine Script

    const stopLossPrice = parseFloat(
      (entryPrice - atr * atrMultiplierSL).toFixed(pricePrecision)
    );

    console.log(`entryPrice`, entryPrice);
    console.log(`atr`, atr);
    console.log(`atrMultiplierSL`, atrMultiplierSL);

    console.log(
      `entryPrice - atr * atrMultiplierSL`,
      entryPrice - atr * atrMultiplierSL
    );
    console.log(`stopLossPrice`, stopLossPrice);

    const takeProfitPrice = parseFloat(
      (entryPrice + atr * atrMultiplierTP).toFixed(pricePrecision)
    );
    console.log(
      `entryPrice + atr * atrMultiplierTP`,
      entryPrice + atr * atrMultiplierTP
    );

    console.log(`takeProfitPrice`, takeProfitPrice);

    console.log(`LONG Order Details for ${symbol}:`);
    console.log(`Entry Price: ${entryPrice}`);
    console.log(`Quantity: ${qtyFixed}`);
    console.log(`Margin Used: ${marginAmount}`);
    console.log(`Position Value: ${positionValue} (${LEVERAGE}x leverage)`);

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

    lastTradeSide[symbol] = "LONG";
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

    // ATR-based Stop Loss and Take Profit
    const atr = await getATR(symbol, ATR_LENGTH);
    const atrMultiplierSL = ATR_MULTIPLIER_SL; // Same as Pine Script
    const atrMultiplierTP = ATR_MULTIPLIER_TP; // Same as Pine Script

    const stopLossPrice = parseFloat(
      (entryPrice + atr * atrMultiplierSL).toFixed(pricePrecision)
    );
    const takeProfitPrice = parseFloat(
      (entryPrice - atr * atrMultiplierTP).toFixed(pricePrecision)
    );

    console.log(`entryPrice`, entryPrice);
    console.log(`atr`, atr);
    console.log(`atrMultiplierSL`, atrMultiplierSL);

    console.log(
      `entryPrice - atr * atrMultiplierSL`,
      entryPrice - atr * atrMultiplierSL
    );
    console.log(`stopLossPrice`, stopLossPrice);

    console.log(`SHORT Order Details for ${symbol}:`);
    console.log(`Entry Price: ${entryPrice}`);
    console.log(`Quantity: ${qtyFixed}`);
    console.log(`Margin Used: ${marginAmount}`);
    console.log(`Position Value: ${positionValue} (${LEVERAGE}x leverage)`);

    const shortOrder = await binance.futuresMarketSell(symbol, qtyFixed);
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
    lastTradeSide[symbol] = "SHORT";
  } catch (error) {
    console.error(`Error placing SHORT order for ${symbol}:`, error);
  }
}
async function processSymbol(symbol, maxSpendPerTrade) {
  const hasNewCandle = await hasNewCandleFormed(symbol, "entry");

  if (!hasNewCandle) {
    console.log(`[${symbol}] No new candle formed yet, skipping entry check`);
    return;
  }

  const decision = await checkTEMAEntry(symbol);
  console.log("decision", decision);

  const lastSide = lastTradeSide[symbol] || null;
  if (lastSide) {
    console.log(`[${symbol}] Last trade was: ${lastSide}`);

    if (lastSide === "LONG" && decision === "LONG") {
      console.log(`[${symbol}] Last trade was LONG, skipping LONG signal`);
      return;
    }

    if (lastSide === "SHORT" && decision === "SHORT") {
      console.log(`[${symbol}] Last trade was SHORT, skipping SHORT signal`);
      return;
    }
  } else {
    console.log(`[${symbol}] No previous trades, allowing any trade`);
  }

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
  const usableBalance = totalBalance - 5;
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
    const trades = await TradeDetails.findOne({
      symbol: sym,
      status: "0",
      createdBy: ENVUSERID,
    });

    if (trades) {
      await checkOrderForIndexRebuild(sym);
    }
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
          if (roi >= 0.2 || roi <= -0.2) {
            const shouldExit = await checkTEMAExit(sym, tradeResponse);
            if (shouldExit) {
              const exitSuccess = await executeTEMAExit(sym, tradeResponse);
              if (exitSuccess) {
                console.log(
                  `[${sym}] Position closed due to TEMA exit signal at ROI: ${roi.toFixed(
                    2
                  )}%`
                );
                continue;
              }
            }
          }
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
