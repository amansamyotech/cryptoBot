const Binance = require("node-binance-api");
const axios = require("axios");
const { checkOrderForIndexRebuild } = require("./checkOrderForIndexRebuild");
const isProcessing = {};
const lastTradeSide = {};

const API_ENDPOINT = "http://localhost:3001/api/buySell/";

const binance = new Binance().options({
  APIKEY: "0kB82SnxRkon7oDJqmCPykl4ar0afRYrScffMnRA3kTR8Qfq986IBwjqNA7fIauI",
  APISECRET: "6TWxLtkLDaCfDh4j4YcLa2WLS99zkZtaQjJnsAeGAtixHIDXjPdJAta5BJxNWrZV",
  useServerTime: true,
  test: false,
});

const symbols = ["DOGEUSDT", "SOLUSDT"];

// WebSocket data storage
const candleData = {};
const priceData = {};
const balanceData = { USDT: 0 };
const lastCandleTime = {};
const exchangeInfoCache = {};

// Initialize WebSocket connections
function initializeWebSockets() {
  symbols.forEach((symbol) => {
    candleData[symbol] = [];
    priceData[symbol] = 0;
    lastCandleTime[symbol] = { entry: 0 };

    // Kline WebSocket for 3m candles
    binance.websockets.chart(symbol, "3m", (symbol, interval, chart) => {
      const candles = Object.values(chart).map(c => ({
        time: c.closeTime,
        open: parseFloat(c.open),
        high: parseFloat(c.high),
        low: parseFloat(c.low),
        close: parseFloat(c.close),
        volume: parseFloat(c.volume),
        isFinal: !c.isCandleIncomplete
      }));
      candleData[symbol] = candles.sort((a, b) => a.time - b.time);
    });

    // Ticker WebSocket for real-time price
    binance.websockets.bookTickers(symbol, (ticker) => {
      priceData[symbol] = parseFloat(ticker.bestAsk);
    });
  });

  // Account balance WebSocket
  binance.websockets.userFutureData(
    null, // open orders callback
    (update) => {
      if (update.assets) {
        const usdt = update.assets.find((asset) => asset.asset === "USDT");
        if (usdt) balanceData.USDT = parseFloat(usdt.availableBalance || 0);
      }
    }
  );
}

// Cache exchange info on startup
async function cacheExchangeInfo() {
  const exchangeInfo = await binance.futuresExchangeInfo();
  exchangeInfo.symbols.forEach((s) => {
    exchangeInfoCache[s.symbol] = {
      pricePrecision: s.pricePrecision,
      quantityPrecision: s.quantityPrecision
    };
  });
}

async function getUsdtBalance() {
  return balanceData.USDT || 0;
}

const LEVERAGE = 3;
const ATR_LENGTH = 14;
const ATR_MULTIPLIER_SL = 2.0;
const ATR_MULTIPLIER_TP = 4.0;

function getTEMApercentage(tema15, tema21) {
  const total = tema15 + tema21;
  const percent15 = (tema15 / total) * 100;
  const percent21 = (tema21 / total) * 100;
  return { percent15, percent21 };
}

function calculateTEMA(prices, length) {
  if (prices.length < length * 3) return null;

  let ema1 = [];
  let k1 = 2 / (length + 1);
  ema1[0] = prices[0];
  for (let i = 1; i < prices.length; i++) {
    ema1[i] = prices[i] * k1 + ema1[i - 1] * (1 - k1);
  }

  let ema2 = [];
  ema2[0] = ema1[0];
  for (let i = 1; i < ema1.length; i++) {
    ema2[i] = ema1[i] * k1 + ema2[i - 1] * (1 - k1);
  }

  let ema3 = [];
  ema3[0] = ema2[0];
  for (let i = 1; i < ema2.length; i++) {
    ema3[i] = ema2[i] * k1 + ema3[i - 1] * (1 - k1);
  }

  const tema = [];
  for (let i = 0; i < prices.length; i++) {
    tema[i] = 3 * ema1[i] - 3 * ema2[i] + ema3[i];
  }

  return tema[tema.length - 1];
}

async function getTEMA(symbol, length) {
  try {
    const candles = candleData[symbol] || [];
    if (candles.length < length * 3 + 10) {
      const historical = await binance.futuresCandles(symbol, "3m", { limit: length * 3 + 10 });
      candleData[symbol] = historical.map(c => ({
        time: c[6],
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[5]),
        isFinal: true
      }));
    }
    const closes = candleData[symbol].slice(-length * 3 - 10).map(c => c.close);
    return calculateTEMA(closes, length);
  } catch (err) {
    console.error(`Error calculating TEMA for ${symbol}:`, err.message);
    return null;
  }
}

async function hasNewCandleFormed(symbol, type) {
  const candles = candleData[symbol] || [];
  if (!candles.length) return false;
  const latestCandle = candles[candles.length - 1];
  if (!latestCandle.isFinal) return false;
  if (lastCandleTime[symbol][type] === 0 || lastCandleTime[symbol][type] < latestCandle.time) {
    lastCandleTime[symbol][type] = latestCandle.time;
    return true;
  }
  return false;
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

    const candles = candleData[symbol].slice(-100);
    if (candles.length < 50) return "HOLD";
    const closePrices = candles.map(c => c.close);
    const prevClosePrices = closePrices.slice(0, -1);
    const prevTema15 = calculateTEMA(prevClosePrices, 15);
    const prevTema21 = calculateTEMA(prevClosePrices, 21);
    console.log(`prevTema15 || !prevTema21`, prevTema15, prevTema21);

    if (!prevTema15 || !prevTema21) return "HOLD";

    const longCondition = percent15 > percent21;
    const shortCondition = percent15 < percent21;

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
    const candles = candleData[symbol] || [];
    if (candles.length < length + 20) {
      const historical = await binance.futuresCandles(symbol, "3m", { limit: length + 20 });
      candleData[symbol] = historical.map(c => ({
        time: c[6],
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[5]),
        isFinal: true
      }));
    }
    return calculateATR(candleData[symbol].slice(-length - 20), length);
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
      return false;
    }

    const { side } = tradeDetails;
    const tema15 = await getTEMA(symbol, 15);
    const tema21 = await getTEMA(symbol, 21);
    const candles = candleData[symbol].slice(-100);
    if (candles.length < 50) return false;
    const closePrices = candles.map(c => c.close);
    const prevClosePrices = closePrices.slice(0, -1);
    const prevTema15 = calculateTEMA(prevClosePrices, 15);
    const prevTema21 = calculateTEMA(prevClosePrices, 21);
    console.log(`prevTema15 || !prevTema21`, prevTema15, prevTema21);

    if (!prevTema15 || !prevTema21) return false;

    const { percent15, percent21 } = getTEMApercentage(tema15, tema21);
    if (side === "LONG" && prevTema15 >= prevTema21 && percent15 < percent21) {
      console.log(`[${symbol}] LONG Exit: TEMA 15 crossed below TEMA 21`);
      return true;
    }
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
        console.warn(`[${symbol}] Failed to cancel order ${order.orderId}: ${err.message}`);
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
          console.warn(`[${symbol}] Failed to cancel stop loss: ${err.message}`);
        }
      }
    }

    const symbolInfo = exchangeInfoCache[symbol] || {};
    const quantityPrecision = symbolInfo.quantityPrecision || 6;
    const qtyFixed = parseFloat(quantity).toFixed(quantityPrecision);

    let exitOrder;
    if (side === "LONG") {
      exitOrder = await binance.futuresMarketSell(symbol, qtyFixed, { reduceOnly: true });
    } else {
      exitOrder = await binance.futuresMarketBuy(symbol, qtyFixed, { reduceOnly: true });
    }
    console.log(`[${symbol}] TEMA Exit executed - Order ID: ${exitOrder.orderId}`);
    await axios.put(`${API_ENDPOINT}${objectId}`, { data: { status: "1" } });
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
      if (msg.includes("No need to change") || msg.includes("margin type cannot be changed")) {
        console.log(`[${symbol}] Margin type already ISOLATED or cannot be changed right now.`);
      } else {
        console.warn(`[${symbol}] Error setting margin type:`, msg);
      }
    }
    await binance.futuresLeverage(symbol, LEVERAGE);
    console.log(`[${symbol}] Leverage set to ${LEVERAGE}x`);

    const entryPrice = priceData[symbol] || parseFloat((await binance.futuresPrices())[symbol]);
    const positionValue = marginAmount * LEVERAGE;
    const quantity = parseFloat((positionValue / entryPrice).toFixed(6));
    const symbolInfo = exchangeInfoCache[symbol] || {};
    const pricePrecision = symbolInfo.pricePrecision || 6;
    const quantityPrecision = symbolInfo.quantityPrecision || 6;
    const qtyFixed = quantity.toFixed(quantityPrecision);

    const atr = await getATR(symbol, ATR_LENGTH);
    const atrMultiplierSL = ATR_MULTIPLIER_SL;
    const atrMultiplierTP = ATR_MULTIPLIER_TP;
    const stopLossPrice = parseFloat((entryPrice - atr * atrMultiplierSL).toFixed(pricePrecision));
    const takeProfitPrice = parseFloat((entryPrice + atr * atrMultiplierTP).toFixed(pricePrecision));

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

    const tradeResponse = await axios.post(API_ENDPOINT, { data: buyOrderDetails });
    console.log(`Trade Response:`, tradeResponse?.data);
    const tradeId = tradeResponse.data._id;

    const stopLossOrder = await binance.futuresOrder(
      "STOP_MARKET",
      "SELL",
      symbol,
      qtyFixed,
      null,
      { stopPrice: stopLossPrice, reduceOnly: true, timeInForce: "GTC" }
    );
    const takeProfitOrder = await binance.futuresOrder(
      "TAKE_PROFIT_MARKET",
      "SELL",
      symbol,
      qtyFixed,
      null,
      { stopPrice: takeProfitPrice, reduceOnly: true, timeInForce: "GTC" }
    );
    console.log(`Take Profit set at ${takeProfitPrice} for ${symbol} (ATR-based)`);

    const details = {
      stopLossPrice: stopLossPrice,
      stopLossOrderId: stopLossOrder.orderId,
      takeProfitPrice: takeProfitPrice,
      takeProfitOrderId: takeProfitOrder.orderId,
    };
    await axios.put(`${API_ENDPOINT}${tradeId}`, { data: details });
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
      if (msg.includes("No need to change") || msg.includes("margin type cannot be changed")) {
        console.log(`[${symbol}] Margin type already ISOLATED or cannot be changed right now.`);
      } else {
        console.warn(`[${symbol}] Error setting margin type:`, msg);
      }
    }
    await binance.futuresLeverage(symbol, LEVERAGE);
    console.log(`[${symbol}] Leverage set to ${LEVERAGE}x`);

    const entryPrice = priceData[symbol] || parseFloat((await binance.futuresPrices())[symbol]);
    const positionValue = marginAmount * LEVERAGE;
    const quantity = parseFloat((positionValue / entryPrice).toFixed(6));
    const symbolInfo = exchangeInfoCache[symbol] || {};
    const pricePrecision = symbolInfo.pricePrecision || 6;
    const quantityPrecision = symbolInfo.quantityPrecision || 6;
    const qtyFixed = quantity.toFixed(quantityPrecision);

    const atr = await getATR(symbol, ATR_LENGTH);
    const atrMultiplierSL = ATR_MULTIPLIER_SL;
    const atrMultiplierTP = ATR_MULTIPLIER_TP;
    const stopLossPrice = parseFloat((entryPrice + atr * atrMultiplierSL).toFixed(pricePrecision));
    const takeProfitPrice = parseFloat((entryPrice - atr * atrMultiplierTP).toFixed(pricePrecision));

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

    const tradeResponse = await axios.post(API_ENDPOINT, { data: shortOrderDetails });
    console.log(`Trade Response:`, tradeResponse?.data);
    const tradeId = tradeResponse.data._id;

    const stopLossOrder = await binance.futuresOrder(
      "STOP_MARKET",
      "BUY",
      symbol,
      qtyFixed,
      null,
      { stopPrice: stopLossPrice, reduceOnly: true, timeInForce: "GTC" }
    );
    const takeProfitOrder = await binance.futuresOrder(
      "TAKE_PROFIT_MARKET",
      "BUY",
      symbol,
      qtyFixed,
      null,
      { stopPrice: takeProfitPrice, reduceOnly: true, timeInForce: "GTC" }
    );
    console.log(`Take Profit set at ${takeProfitPrice} for ${symbol} (ATR-based)`);

    const details = {
      stopLossPrice: stopLossPrice,
      stopLossOrderId: stopLossOrder.orderId,
      takeProfitPrice: takeProfitPrice,
      takeProfitOrderId: takeProfitOrder.orderId,
    };
    await axios.put(`${API_ENDPOINT}${tradeId}`, { data: details });
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

// Start WebSocket connections and main loop
(async () => {
  await cacheExchangeInfo();
  initializeWebSockets();

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
          const response = await axios.post(`${API_ENDPOINT}check-symbols`, { symbols: sym });
          let status = response?.data?.data.status;
          if (status === true) {
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
      try {
        const response = await axios.post(`${API_ENDPOINT}check-symbols`, { symbols: sym });
        let status = response?.data?.data.status;
        if (status === false) {
          if (isProcessing[sym]) {
            console.log(`[${sym}] Skipping trailing — already processing.`);
            continue;
          }
          isProcessing[sym] = true;

          const positions = await binance.futuresPositionRisk({ symbol: sym });
          const pos = positions.find((p) => p.symbol === sym);
          if (!pos || Math.abs(parseFloat(pos.positionAmt || 0)) === 0) {
            console.log(`[${sym}] Position already closed or doesn't exist. Updating DB to close trade.`);
            const tradeResponse = await axios.get(`${API_ENDPOINT}find-treads/${sym}`);
            const { found, tradeDetails } = tradeResponse.data?.data;
            if (found) {
              await axios.put(`${API_ENDPOINT}${tradeDetails._id}`, { data: { status: "1" } });
              console.log(`[${sym}] DB updated: Trade marked as closed.`);
            }
            continue;
          }

          const tradeResponse = await axios.get(`${API_ENDPOINT}find-treads/${sym}`);
          const { found, tradeDetails } = tradeResponse.data?.data;
          if (found) {
            const currentPrice = priceData[sym] || parseFloat((await binance.futuresPrices())[sym]);
            let roi = 0;
            if (tradeDetails.side === "LONG") {
              const entryPrice = parseFloat(tradeDetails.LongTimeCoinPrice.$numberDecimal);
              const qty = parseFloat(tradeDetails.quantity);
              const margin = parseFloat(tradeDetails.marginUsed);
              const pnl = (currentPrice - entryPrice) * qty;
              roi = (pnl / margin) * 100;
            } else if (tradeDetails.side === "SHORT") {
              const entryPrice = parseFloat(tradeDetails.ShortTimeCurrentPrice.$numberDecimal);
              const qty = parseFloat(tradeDetails.quantity);
              const margin = parseFloat(tradeDetails.marginUsed);
              const pnl = (entryPrice - currentPrice) * qty;
              roi = (pnl / margin) * 100;
            }

            if (roi >= 0.2 || roi <= -0.2) {
              const shouldExit = await checkTEMAExit(sym, tradeDetails);
              if (shouldExit) {
                const exitSuccess = await executeTEMAExit(sym, tradeDetails);
                if (exitSuccess) {
                  console.log(`[${sym}] Position closed due to TEMA exit signal at ROI: ${roi.toFixed(2)}%`);
                  continue;
                }
              }
            }
          }
        }
      } catch (err) {
        console.error(`Error with ${sym}:`, err.message);
      } finally {
        isProcessing[sym] = false;
      }
    }
  }, 5000);
})();