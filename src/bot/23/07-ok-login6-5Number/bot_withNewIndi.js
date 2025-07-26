// 📦 Dependencies
const Binance = require("node-binance-api");
const technicalIndicators = require("technicalindicators");
const axios = require("axios");
const { sendTelegram } = require("../../../helper/teleMassage.js");

const API_ENDPOINT = "http://localhost:3001/api/buySell/";

// 🔐 Configure your Binance Futures API keys
const binance = new Binance().options({
  APIKEY: "whfiekZqKdkwa9fEeUupVdLZTNxBqP1OCEuH2pjyImaWt51FdpouPPrCawxbsupK",
  APISECRET: "E4IcteWOQ6r9qKrBZJoBy4R47nNPBDepVXMnS3Lf2Bz76dlu0QZCNh82beG2rHq4",
  useServerTime: true,
  test: false, // Set to true for testnet
});

// ⚙️ Bot Config
const symbols = [
  "1000PEPEUSDT",
  "1000SHIBUSDT",
  "1000BONKUSDT",
  "1000FLOKIUSDT",
  //   "1000SATSUSDT",
  //   "DOGEUSDT",
];
const interval = "3m";
const leverage = 3; // Leverage
const STOP_LOSS_ROI = -1; // -1% ROI for stop loss
const TAKE_PROFIT_ROI = 2; // +2% ROI for take 

// 💰 Get wallet balance
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

async function setLeverageAndMarginType(symbol) {
  try {
    await binance.futuresMarginType(symbol, "ISOLATED");
    console.log(`Margin type set to ISOLATED for ${symbol}`);

    await binance.futuresLeverage(symbol, leverage);
    console.log(`Leverage set to ${leverage}x for ${symbol}`);
  } catch (err) {
    console.error(
      `Failed to set leverage/margin for ${symbol}:`,
      err.body || err.message
    );
    if (err.body && err.body.includes("No need to change margin type")) {
      console.log(`Margin type already set to ISOLATED for ${symbol}`);
      // Still try to set leverage
      try {
        await binance.futuresLeverage(symbol, leverage);
        console.log(`Leverage set to ${leverage}x for ${symbol}`);
      } catch (leverageErr) {
        console.error(
          `Failed to set leverage for ${symbol}:`,
          leverageErr.body || leverageErr.message
        );
      }
    }
  }
}

function calculateROIPrices(entryPrice, marginUsed, quantity, side) {
  const stopLossPnL = (marginUsed * STOP_LOSS_ROI) / 100; // Negative value
  const takeProfitPnL = (marginUsed * TAKE_PROFIT_ROI) / 100; // Positive value

  let stopLossPrice, takeProfitPrice;

  if (side === "LONG") {
    stopLossPrice = entryPrice + stopLossPnL / quantity;
    takeProfitPrice = entryPrice + takeProfitPnL / quantity;
  } else {
    // For SHORT: PnL = (Entry Price - Exit Price) × Quantity
    // Stop Loss: Exit Price = Entry Price - (PnL / Quantity)
    stopLossPrice = entryPrice - stopLossPnL / quantity;
    takeProfitPrice = entryPrice - takeProfitPnL / quantity;
  }

  return { stopLossPrice, takeProfitPrice };
}

// Set leverage before trading
async function setLeverage(symbol) {
  try {
    await binance.futuresLeverage(symbol, leverage);
    console.log(`Leverage set to ${leverage}x for ${symbol}`);
  } catch (err) {
    console.error(`Failed to set leverage for ${symbol}:, err.body`);
  }
}

// ⏳ Fetch candlestick data
async function getCandles(symbol, interval, limit = 100) {
  const candles = await binance.futuresCandles(symbol, interval, { limit });

  return candles.map((c) => ({
    open: parseFloat(c.open),
    high: parseFloat(c.high),
    low: parseFloat(c.low),
    close: parseFloat(c.close),
    volume: parseFloat(c.volume),
  }));
}

// 📊 Calculate indicators
async function getIndicators(symbol) {
  const candles = await getCandles(symbol, interval, 100);
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const volumes = candles.map((c) => c.volume);

  // EMA
  const ema20Arr = technicalIndicators.EMA.calculate({
    period: 20,
    values: closes,
  });
  const ema50Arr = technicalIndicators.EMA.calculate({
    period: 50,
    values: closes,
  });
  const ema20 = ema20Arr.length ? ema20Arr.pop() : null;
  const ema50 = ema50Arr.length ? ema50Arr.pop() : null;

  // RSI
  const rsiArr = technicalIndicators.RSI.calculate({
    period: 14,
    values: closes,
  });
  const rsi14 = rsiArr.length ? rsiArr.pop() : null;

  // MACD
  const macdArr = technicalIndicators.MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
  const macdData = macdArr.length ? macdArr.pop() : {};
  const macdLine = macdData.MACD ?? null;
  const macdSignal = macdData.signal ?? null;

  // Bollinger Bands
  const bbArr = technicalIndicators.BollingerBands.calculate({
    period: 20,
    stdDev: 2,
    values: closes,
  });
  const bbData = bbArr.length ? bbArr.pop() : {};
  const bbUpper = bbData.upper ?? null;
  const bbLower = bbData.lower ?? null;

  // ADX
  const adxArr = technicalIndicators.ADX.calculate({
    period: 14,
    high: highs,
    low: lows,
    close: closes,
  });
  const adxData = adxArr.length ? adxArr.pop() : {};
  const adx = adxData.adx ?? null;

  // VWMA manual calculation (20-period)
  let vwma = null;
  if (closes.length >= 20 && volumes.length >= 20) {
    const sliceCloses = closes.slice(-20);
    const sliceVolumes = volumes.slice(-20);
    const totalVol = sliceVolumes.reduce((a, b) => a + b, 0);
    const weightedSum = sliceCloses.reduce(
      (sum, c, i) => sum + c * sliceVolumes[i],
      0
    );
    vwma = totalVol ? weightedSum / totalVol : null;
  }

  // Volume
  const latestVolume = volumes.length ? volumes.pop() : null;
  const avgVolume =
    volumes.length >= 20
      ? volumes.slice(-20).reduce((sum, v) => sum + v, 0) / 20
      : null;
  return {
    ema20,
    ema50,
    rsi14,
    macdLine,
    macdSignal,
    bbUpper,
    bbLower,
    adx,
    vwma,
    latestVolume,
    avgVolume,
  };
}

function isBullishEngulf(prev, curr) {
  return prev && curr && curr.open < prev.close && curr.close > prev.open;
}
function isBearishEngulf(prev, curr) {
  return prev && curr && curr.open > prev.close && curr.close < prev.open;
}

// 🧠 Decide Trade Direction
async function decideTradeDirection(symbol) {
  const ind = await getIndicators(symbol);
  const candles = await getCandles(symbol, interval, 2);
  const [prev, curr] = candles;

  let score = 0;
  let contributingIndicators = 0;

  if (ind.ema20 !== null && ind.ema50 !== null) {
    score += ind.ema20 > ind.ema50 ? 2 : -2;
    contributingIndicators++;
  }

  if (ind.rsi14 !== null) {
    score += ind.rsi14 > 60 ? 2 : ind.rsi14 < 40 ? -2 : 0;
    contributingIndicators++;
  }

  if (ind.macdLine !== null && ind.macdSignal !== null) {
    score += ind.macdLine > ind.macdSignal ? 2 : -2;
    contributingIndicators++;
  }

  if (
    ind.latestVolume !== null &&
    ind.avgVolume !== null &&
    ind.latestVolume > ind.avgVolume * 1.5
  ) {
    score += 1;
    contributingIndicators++;
  }

  if (curr) {
    const lastClose = curr.close;
    if (ind.bbLower !== null && ind.rsi14 < 35 && lastClose < ind.bbLower) {
      score += 2;
      contributingIndicators++;
    }
    if (ind.bbUpper !== null && ind.rsi14 > 65 && lastClose > ind.bbUpper) {
      score -= 2;
      contributingIndicators++;
    }
  }

  if (ind.adx !== null && ind.adx > 25) {
    score += 1;
    contributingIndicators++;
  }

  if (isBullishEngulf(prev, curr)) {
    score += 2;
    contributingIndicators++;
  }

  if (isBearishEngulf(prev, curr)) {
    score -= 2;
    contributingIndicators++;
  }

  console.log(
    `Trade Decision Score for ${symbol}: ${score}, Contributing Indicators: ${contributingIndicators}`
  );

  if (contributingIndicators < 3) {
    return "HOLD";
  }

  if (score >= 4) return "LONG";
  if (score <= -4) return "SHORT";
  return "HOLD";
}

// 📈 Buy/Short Logic
async function processSymbol(symbol, maxSpendPerTrade) {
  const decision = await decideTradeDirection(symbol);

  if (decision === "LONG") {
    sendTelegram(`✨ LONG SIGNAL for ${symbol}`);
    await placeBuyOrder(symbol, maxSpendPerTrade);
  } else if (decision === "SHORT") {
    sendTelegram(`✨ SHORT SIGNAL for ${symbol}`);
    await placeShortOrder(symbol, maxSpendPerTrade);
  } else {
    sendTelegram(`No trade signal for ${symbol}`);
    console.log(`No trade signal for ${symbol}`);
  }
}

// 💰 Place Buy Order + Stop Loss
async function placeBuyOrder(symbol, marginAmount) {
  try {
    await setLeverage(symbol);

    const price = (await binance.futuresPrices())[symbol];
    const entryPrice = parseFloat(price);

    // Calculate position size with leverage
    const positionValue = marginAmount * leverage;
    const quantity = parseFloat((positionValue / entryPrice).toFixed(6));

    const exchangeInfo = await binance.futuresExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
    const pricePrecision = symbolInfo.pricePrecision;
    const quantityPrecision = symbolInfo.quantityPrecision;

    const qtyFixed = quantity.toFixed(quantityPrecision);

    // Calculate ROI-based stop loss and take profit prices
    const { stopLossPrice, takeProfitPrice } = calculateROIPrices(
      entryPrice,
      marginAmount,
      quantity,
      "LONG"
    );

    const stopLossFixed = stopLossPrice.toFixed(pricePrecision);
    const takeProfitFixed = takeProfitPrice.toFixed(pricePrecision);

    console.log(`LONG Order Details for ${symbol}:`);
    console.log(`Entry Price: ${entryPrice}`);
    console.log(`Quantity: ${qtyFixed}`);
    console.log(`Margin Used: ${marginAmount}`);
    console.log(`Position Value: ${positionValue} (${leverage}x leverage)`);
    console.log(`Stop Loss Price: ${stopLossFixed} (${STOP_LOSS_ROI}% ROI)`);
    console.log(
      `Take Profit Price: ${takeProfitFixed} (${TAKE_PROFIT_ROI}% ROI)`
    );

    // Place market buy order
    const buyOrder = await binance.futuresMarketBuy(symbol, qtyFixed);
    sendTelegram(
      `🟢 LONG ${symbol} at ${entryPrice} | Qty: ${qtyFixed} | Leverage: ${leverage}x`
    );
    console.log(`Bought ${symbol} at ${entryPrice}`);

    const buyOrderDetails = {
      side: "LONG",
      symbol,
      quantity: qtyFixed,
      LongTimeCoinPrice: entryPrice,
      placeOrderId: buyOrder.orderId,
      marginUsed: marginAmount,
      leverage: leverage,
      positionValue: positionValue,
    };

    const tradeResponse = await axios.post(API_ENDPOINT, {
      data: buyOrderDetails,
    });
    console.log(`Trade Response:`, tradeResponse?.data);

    const tradeId = tradeResponse.data._id;

    // Place stop loss order
    const stopLossOrder = await binance.futuresOrder(
      "STOP_MARKET",
      "SELL",
      symbol,
      qtyFixed,
      null,
      {
        stopPrice: stopLossFixed,
        reduceOnly: true,
        timeInForce: "GTC",
      }
    );
    console.log(
      `Stop Loss set at ${stopLossFixed} for ${symbol} (${STOP_LOSS_ROI}% ROI)`
    );

    // Place take profit order
    const takeProfitOrder = await binance.futuresOrder(
      "TAKE_PROFIT_MARKET",
      "SELL",
      symbol,
      qtyFixed,
      null,
      {
        stopPrice: takeProfitFixed,
        reduceOnly: true,
        timeInForce: "GTC",
      }
    );
    console.log(
      `Take Profit set at ${takeProfitFixed} for ${symbol} (${TAKE_PROFIT_ROI}% ROI)`
    );

    const details = {
      takeProfitPrice: takeProfitFixed,
      profitOrderId: takeProfitOrder.orderId,
      stopLossPrice: stopLossFixed,
      stopLossOrderId: stopLossOrder.orderId,
    };

    await axios.put(`${API_ENDPOINT}${tradeId}`, {
      data: details,
    });
  } catch (error) {
    console.error(`Error placing LONG order for ${symbol}:`, error);
    sendTelegram(`❌ Error placing LONG order for ${symbol}: ${error.message}`);
  }
}

// 📉 Place Short Order + Stop Loss
async function placeShortOrder(symbol, marginAmount) {
  try {
    await setLeverage(symbol);

    const price = (await binance.futuresPrices())[symbol];
    const entryPrice = parseFloat(price);

    // Calculate position size with leverage
    const positionValue = marginAmount * leverage;
    const quantity = parseFloat((positionValue / entryPrice).toFixed(6));

    const exchangeInfo = await binance.futuresExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
    const pricePrecision = symbolInfo.pricePrecision;
    const quantityPrecision = symbolInfo.quantityPrecision;

    const qtyFixed = quantity.toFixed(quantityPrecision);

    // Calculate ROI-based stop loss and take profit prices
    const { stopLossPrice, takeProfitPrice } = calculateROIPrices(
      entryPrice,
      marginAmount,
      quantity,
      "SHORT"
    );

    const stopLossFixed = stopLossPrice.toFixed(pricePrecision);
    const takeProfitFixed = takeProfitPrice.toFixed(pricePrecision);

    console.log(`SHORT Order Details for ${symbol}:`);
    console.log(`Entry Price: ${entryPrice}`);
    console.log(`Quantity: ${qtyFixed}`);
    console.log(`Margin Used: ${marginAmount}`);
    console.log(`Position Value: ${positionValue} (${leverage}x leverage)`);
    console.log(`Stop Loss Price: ${stopLossFixed} (${STOP_LOSS_ROI}% ROI)`);
    console.log(
      `Take Profit Price: ${takeProfitFixed} (${TAKE_PROFIT_ROI}% ROI)`
    );

    // Place market sell order
    const shortOrder = await binance.futuresMarketSell(symbol, qtyFixed);
    sendTelegram(
      `🔴 SHORT ${symbol} at ${entryPrice} | Qty: ${qtyFixed} | Leverage: ${leverage}x`
    );
    console.log(`Shorted ${symbol} at ${entryPrice}`);

    const shortOrderDetails = {
      side: "SHORT",
      symbol,
      quantity: qtyFixed,
      ShortTimeCurrentPrice: entryPrice,
      placeOrderId: shortOrder.orderId,
      marginUsed: marginAmount,
      leverage: leverage,
      positionValue: positionValue,
    };

    const tradeResponse = await axios.post(API_ENDPOINT, {
      data: shortOrderDetails,
    });
    console.log(`Trade Response:`, tradeResponse?.data);

    const tradeId = tradeResponse.data._id;

    // Place stop loss order
    const stopLossOrder = await binance.futuresOrder(
      "STOP_MARKET",
      "BUY",
      symbol,
      qtyFixed,
      null,
      {
        stopPrice: stopLossFixed,
        reduceOnly: true,
        timeInForce: "GTC",
      }
    );
    console.log(
      `Stop Loss set at ${stopLossFixed} for ${symbol} (${STOP_LOSS_ROI}% ROI)`
    );

    // Place take profit order
    const takeProfitOrder = await binance.futuresOrder(
      "TAKE_PROFIT_MARKET",
      "BUY",
      symbol,
      qtyFixed,
      null,
      {
        stopPrice: takeProfitFixed,
        reduceOnly: true,
        timeInForce: "GTC",
      }
    );
    console.log(
      `Take Profit set at ${takeProfitFixed} for ${symbol} (${TAKE_PROFIT_ROI}% ROI)`
    );

    const details = {
      takeProfitPrice: takeProfitFixed,
      profitOrderId: takeProfitOrder.orderId,
      stopLossPrice: stopLossFixed,
      stopLossOrderId: stopLossOrder.orderId,
    };

    await axios.put(`${API_ENDPOINT}${tradeId}`, {
      data: details,
    });
  } catch (error) {
    console.error(`Error placing SHORT order for ${symbol}:`, error);
    sendTelegram(
      `❌ Error placing SHORT order for ${symbol}: ${error.message}`
    );
  }
}
// 🔁 Main Loop
setInterval(async () => {
  const totalBalance = await getUsdtBalance();
  const usableBalance = totalBalance - 6; // Keep $6 reserve
  const maxSpendPerTrade = usableBalance / symbols.length;

  console.log(`[MAIN LOOP DEBUG] Total Balance: ${totalBalance} USDT`);
  console.log(`[MAIN LOOP DEBUG] Usable Balance: ${usableBalance} USDT`);
  console.log(`[MAIN LOOP DEBUG] Margin Per Trade: ${maxSpendPerTrade} USDT`);
  console.log(`[MAIN LOOP DEBUG] Leverage: ${leverage}x`);
  console.log(
    `[MAIN LOOP DEBUG] Notional Value Per Trade: ${
      maxSpendPerTrade * leverage
    } USDT`
  );

  if (usableBalance <= 6) {
    console.log("Not enough balance to trade.");
    return;
  }

  for (const sym of symbols) {
    try {
      const response = await axios.post(`${API_ENDPOINT}check-symbols`, {
        symbols: sym,
      });

      let status = response?.data?.data.status;

      if (status == true) {
        await processSymbol(sym, maxSpendPerTrade);
      } else {
        console.log(`TREAD ALREADY OPEN FOR THAT SYMBOL : ${sym} `);
      }
    } catch (err) {
      console.error(`Error with ${sym}:`, err);
    }
  }
}, 60 * 1000); // Run every 5 minute

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

    if (!stopLossOrderId || !takeProfitOrderId) {
      console.log(`No order IDs found for ${symbol}`);
      return;
    }

    // Get initial order statuses
    const stopLossStatus = await binance.futuresOrderStatus(symbol, {
      orderId: stopLossOrderId,
    });

    const takeProfitStatus = await binance.futuresOrderStatus(symbol, {
      orderId: takeProfitOrderId,
    });

    const stopLossOrderStatus = stopLossStatus?.status;
    const takeProfitOrderStatus = takeProfitStatus?.status;

    console.log(`Stop Loss Status for ${symbol}:`, stopLossOrderStatus);
    console.log(`Take Profit Status for ${symbol}:`, takeProfitOrderStatus);

    const isStopLossFilled = stopLossOrderStatus === "FILLED";
    const isTakeProfitFilled = takeProfitOrderStatus === "FILLED";

    if (isStopLossFilled || isTakeProfitFilled) {
      console.log(`One of the orders is filled for ${symbol}`);

      // If Stop Loss is NOT filled, check again before canceling
      if (!isStopLossFilled) {
        const recheckStopLoss = await binance.futuresOrderStatus(symbol, {
          orderId: stopLossOrderId,
        });
        if (
          recheckStopLoss?.status !== "CANCELED" &&
          recheckStopLoss?.status !== "FILLED"
        ) {
          await binance.futuresCancel(symbol, stopLossOrderId);
          console.log(`Stop Loss order canceled`);
        } else {
          console.log(`Stop Loss already canceled or filled`);
        }
      }

      // If Take Profit is NOT filled, check again before canceling
      if (!isTakeProfitFilled) {
        const recheckTakeProfit = await binance.futuresOrderStatus(symbol, {
          orderId: takeProfitOrderId,
        });
        if (
          recheckTakeProfit?.status !== "CANCELED" &&
          recheckTakeProfit?.status !== "FILLED"
        ) {
          await binance.futuresCancel(symbol, takeProfitOrderId);
          console.log(`Take Profit order canceled`);
        } else {
          console.log(`Take Profit already canceled or filled`);
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

setInterval(async () => {
  for (const sym of symbols) {
    await checkOrders(sym);
  }
}, 30000);
