const Binance = require("node-binance-api");
const axios = require("axios");
const { hasNewCandleFormed } = require("./indexCrossTema");
const { getCandles } = require("./helper/getCandles");
const { checkOrders } = require("./orderCheckFunForFix");
const { checkEntrySignal } = require("./strategy");

const isProcessing = {};
const lastTradeSide = {};

const API_ENDPOINT = "http://localhost:3000/api/buySell/";

const binance = new Binance().options({
  APIKEY: "tPCOyhkpaVUj6it6BiKQje0WxcJjUOV30EQ7dY2FMcqXunm9DwC8xmuiCkgsyfdG",
  APISECRET: "UpK4CPfKywFrAJDInCAXPmWVSiSs5xVVL2nDes8igCONl3cVgowDjMbQg64fm5pr",
  useServerTime: true,
  test: false,
});

const symbols = ["DOGEUSDT"];

async function getUsdtBalance() {
  try {
    const account = await binance.futuresBalance();
    const usdtBalance = parseFloat(
      account.find((asset) => asset.asset === "USDT")?.balance || 0
    );
    return usdtBalance;
  } catch (err) {
    console.error("Error fetching balance:", err);
    return 0;
  }
}

const LEVERAGE = 3;
const ATR_LENGTH = 25;
const ATR_MULTIPLIER_SL = 2.0;

function getTEMApercentage(tema15, tema21) {
  const total = tema15 + tema21;

  const percent15 = (tema15 / total) * 100;
  const percent21 = (tema21 / total) * 100;

  return {
    percent15,
    percent21,
  };
}
function calculateTEMA(prices, length) {
  if (prices.length < length * 3) return null;

  // Calculate first EMA
  let ema1 = [];
  let k1 = 2 / (length + 1);
  ema1[0] = prices[0];

  for (let i = 1; i < prices.length; i++) {
    ema1[i] = prices[i] * k1 + ema1[i - 1] * (1 - k1);
  }

  // Calculate second EMA (EMA of EMA1)
  let ema2 = [];
  ema2[0] = ema1[0];

  for (let i = 1; i < ema1.length; i++) {
    ema2[i] = ema1[i] * k1 + ema2[i - 1] * (1 - k1);
  }

  // Calculate third EMA (EMA of EMA2)
  let ema3 = [];
  ema3[0] = ema2[0];

  for (let i = 1; i < ema2.length; i++) {
    ema3[i] = ema2[i] * k1 + ema3[i - 1] * (1 - k1);
  }

  // TEMA formula: 3*EMA1 - 3*EMA2 + EMA3
  const tema = [];
  for (let i = 0; i < prices.length; i++) {
    tema[i] = 3 * ema1[i] - 3 * ema2[i] + ema3[i];
  }

  return tema[tema.length - 1]; // Return latest TEMA value
}

async function getTEMA(symbol, length) {
  try {
    const candles = await getCandles(symbol, "3m", length * 3 + 10);
    const closes = candles.map((c) => c.close);
    return calculateTEMA(closes, length);
  } catch (err) {
    console.error(`Error calculating TEMA for ${symbol}:`, err.message);
    return null;
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
    const { quantity, objectId, stopLossOrderId } = tradeDetails;
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

    // Update database to mark trade as closed
    await axios.put(`${API_ENDPOINT}${objectId}`, {
      data: { status: "1" },
    });

    // lastTradeSide[symbol] = null;
    return true;
  } catch (err) {
    console.error(`[${symbol}] Error executing TEMA exit:`, err.message);
    return false;
  }
}

const PRICE_BUFFER_PERCENT = 0.5; // 0.5% buffer from current price
const MIN_TRAIL_DISTANCE_MULTIPLIER = 0.3; // 30% of ATR
const TRAILING_UPDATE_COOLDOWN = 30000; // 30 seconds
const lastTrailingUpdate = {};

async function calculateTrailingStopLoss(symbol, tradeDetails, currentPrice) {
  try {
    const { side, stopLossPrice } = tradeDetails;
    const atr = await getATR(symbol, ATR_LENGTH);

    if (!atr || !stopLossPrice) return null;

    // Check cooldown
    if (
      lastTrailingUpdate[symbol] &&
      Date.now() - lastTrailingUpdate[symbol] < TRAILING_UPDATE_COOLDOWN
    ) {
      return null;
    }

    const exchangeInfo = await binance.futuresExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
    const pricePrecision = symbolInfo.pricePrecision;

    let newStopLoss;
    let shouldUpdate = false;
    const currentStopLoss = parseFloat(stopLossPrice);
    const minimumTrailDistance = atr * MIN_TRAIL_DISTANCE_MULTIPLIER;

    if (side === "LONG") {
      newStopLoss = parseFloat(
        (currentPrice - atr * ATR_MULTIPLIER_SL).toFixed(pricePrecision)
      );

      // Price buffer check
      const bufferPrice = currentPrice * (1 - PRICE_BUFFER_PERCENT / 100);
      if (newStopLoss > bufferPrice) {
        newStopLoss = parseFloat(bufferPrice.toFixed(pricePrecision));
      }

      // Minimum trail distance check
      const trailDistance = newStopLoss - currentStopLoss;
      if (
        trailDistance >= minimumTrailDistance &&
        newStopLoss > currentStopLoss
      ) {
        shouldUpdate = true;
      }
    } else if (side === "SHORT") {
      newStopLoss = parseFloat(
        (currentPrice + atr * ATR_MULTIPLIER_SL).toFixed(pricePrecision)
      );

      // Price buffer check
      const bufferPrice = currentPrice * (1 + PRICE_BUFFER_PERCENT / 100);
      if (newStopLoss < bufferPrice) {
        newStopLoss = parseFloat(bufferPrice.toFixed(pricePrecision));
      }

      // Minimum trail distance check
      const trailDistance = currentStopLoss - newStopLoss;
      if (
        trailDistance >= minimumTrailDistance &&
        newStopLoss < currentStopLoss
      ) {
        shouldUpdate = true;
      }
    }

    return shouldUpdate ? newStopLoss : null;
  } catch (err) {
    console.error(
      `[${symbol}] Error calculating trailing stop loss:`,
      err.message
    );
    return null;
  }
}
// NEW FUNCTION: Update trailing stop loss
async function updateTrailingStopLoss(symbol, tradeDetails, newStopLossPrice) {
  try {
    const { quantity, objectId, stopLossOrderId, side } = tradeDetails;

    if (stopLossOrderId) {
      try {
        await binance.futuresCancel(symbol, stopLossOrderId);
        console.log(
          `[${symbol}] Canceled old stop loss order: ${stopLossOrderId}`
        );
      } catch (err) {
        if (err.code !== -2011 && err.code !== -1102) {
          console.warn(
            `[${symbol}] Failed to cancel old stop loss: ${err.message}`
          );
        }
      }
    }

    const exchangeInfo = await binance.futuresExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
    const quantityPrecision = symbolInfo.quantityPrecision;
    const qtyFixed = parseFloat(quantity).toFixed(quantityPrecision);

    const stopLossOrder = await binance.futuresOrder(
      "STOP_MARKET",
      side === "LONG" ? "SELL" : "BUY",
      symbol,
      qtyFixed,
      null,
      {
        stopPrice: newStopLossPrice,
        reduceOnly: true,
        timeInForce: "GTC",
      }
    );

    console.log(
      `[${symbol}] Updated trailing stop loss to ${newStopLossPrice}`
    );

    await axios.put(`${API_ENDPOINT}${objectId}`, {
      data: {
        stopLossPrice: newStopLossPrice,
        stopLossOrderId: stopLossOrder.orderId,
      },
    });

    lastTrailingUpdate[symbol] = Date.now();

    return true;
  } catch (err) {
    console.error(
      `[${symbol}] Error updating trailing stop loss:`,
      err.message
    );
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

    // --- Fixed Percentage Stop Loss and Take Profit ---
    const takeProfitPerc = 1.0 / 100; // 1.0%
    const stopLossPerc = 1.0 / 100; // 1.0%

    const stopLossPrice = parseFloat(
      (entryPrice * (1 - stopLossPerc)).toFixed(pricePrecision)
    );
    const takeProfitPrice = parseFloat(
      (entryPrice * (1 + takeProfitPerc)).toFixed(pricePrecision)
    );

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

    const tradeResponse = await axios.post(API_ENDPOINT, {
      data: buyOrderDetails,
    });
    console.log(`Trade Response:`, tradeResponse?.data);

    const tradeId = tradeResponse.data._id;
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
    await axios.put(`${API_ENDPOINT}${tradeId}`, {
      data: details,
    });

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

    // --- Fixed Percentage Stop Loss and Take Profit ---
    const takeProfitPerc = 1.0 / 100; // 1.0%
    const stopLossPerc = 1.0 / 100; // 1.0%

    const stopLossPrice = parseFloat(
      (entryPrice * (1 + stopLossPerc)).toFixed(pricePrecision)
    );
    const takeProfitPrice = parseFloat(
      (entryPrice * (1 - takeProfitPerc)).toFixed(pricePrecision)
    );

    console.log(
      `SL/TP prices for SHORT: SL=${stopLossPrice}, TP=${takeProfitPrice}`
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

    const tradeResponse = await axios.post(API_ENDPOINT, {
      data: shortOrderDetails,
    });
    console.log(`Trade Response:`, tradeResponse?.data);

    const tradeId = tradeResponse.data._id;

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

    await axios.put(`${API_ENDPOINT}${tradeId}`, {
      data: details,
    });

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

  const decision = await checkEntrySignal(symbol);
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
  const usableBalance = totalBalance - 6;
  const maxSpendPerTrade = usableBalance / symbols.length;

  console.log(`Total Balance: ${totalBalance} USDT`);
  console.log(`Usable Balance: ${usableBalance} USDT`);
  console.log(`Max Spend Per Trade: ${maxSpendPerTrade} USDT`);
  if (maxSpendPerTrade >= 1) {
    for (const sym of symbols) {
      try {
        const response = await axios.post(`${API_ENDPOINT}check-symbols`, {
          symbols: sym,
        });

        let status = response?.data?.data.status;

        if (status == true) {
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
    await checkOrders(sym);
  }
}, 10000);

setInterval(async () => {
  for (const sym of symbols) {
    try {
      const response = await axios.post(`${API_ENDPOINT}check-symbols`, {
        symbols: sym,
      });

      let status = response?.data?.data.status;

      if (status === false) {
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

          const tradeResponse = await axios.get(
            `${API_ENDPOINT}find-treads/${sym}`
          );
          const { found, tradeDetails } = tradeResponse.data?.data;

          if (found) {
            try {
              const res = await binance.futuresCancelAllOpenOrders(sym);
              console.log(`✅ All open orders cancelled for ${sym}`, res);
            } catch (e) {
              console.log(
                `⚠️ Failed to cancel all orders for ${sym}:`,
                e.body || e.message
              );
            }
            await axios.put(`${API_ENDPOINT}${tradeDetails._id}`, {
              data: { status: "1" },
            });
            console.log(`[${sym}] DB updated: Trade marked as closed.`);
          }
          continue;
        }

        const tradeResponse = await axios.get(
          `${API_ENDPOINT}find-treads/${sym}`
        );
        const { found, tradeDetails } = tradeResponse.data?.data;

        if (found) {
          const priceMap = await binance.futuresPrices();
          const currentPrice = parseFloat(priceMap[sym]);
          let roi = 0;

          if (tradeDetails.side === "LONG") {
            const entryPrice = parseFloat(
              tradeDetails.LongTimeCoinPrice.$numberDecimal
            );
            const qty = parseFloat(tradeDetails.quantity);
            const margin = parseFloat(tradeDetails.marginUsed);
            const pnl = (currentPrice - entryPrice) * qty;
            roi = (pnl / margin) * 100;
          } else if (tradeDetails.side === "SHORT") {
            const entryPrice = parseFloat(
              tradeDetails.ShortTimeCurrentPrice.$numberDecimal
            );
            const qty = parseFloat(tradeDetails.quantity);
            const margin = parseFloat(tradeDetails.marginUsed);
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
