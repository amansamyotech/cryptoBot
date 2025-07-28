const Binance = require("node-binance-api");
const technicalIndicators = require("technicalindicators");
const axios = require("axios");
const API_ENDPOINT = "http://localhost:3000/api/buySell/";
const binance = new Binance().options({
  APIKEY: "whfiekZqKdkwa9fEeUupVdLZTNxBqP1OCEuH2pjyImaWt51FdpouPPrCawxbsupK",
  APISECRET: "E4IcteWOQ6r9qKrBZJoBy4R47nNPBDepVXMnS3Lf2Bz76dlu0QZCNh82beG2rHq4",
  useServerTime: true,
  test: false,
});
const symbols = [
  "1000PEPEUSDT",
  "1000BONKUSDT",
  "DOGEUSDT",
  "CKBUSDT",
  "1000FLOKIUSDT",
];
const interval = "1m";
const leverage = 3;
const MINIMUM_PROFIT_ROI = 2;
const INITIAL_TAKE_PROFIT_ROI = 2;
const STOP_LOSS_ROI = -1;
const TAKE_PROFIT_ROI = 2;
// 📈 Indicator Settings
const RSI_PERIOD = 14;
const MACD_FAST = 12;
const MACD_SLOW = 26;
const MACD_SIGNAL = 9;
const BB_PERIOD = 20;
const BB_STD_DEV = 2;
const EMA_FAST = 9;
const EMA_SLOW = 15;
const EMA_TREND_SHORT = 20;
const EMA_TREND_LONG = 50;
const ADX_PERIOD = 14;
const VWMA_PERIOD = 20;

// 📊 Scoring Thresholds
const LONG_THRESHOLD = 3;
const SHORT_THRESHOLD = -3;

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
async function setLeverage(symbol) {
  try {
    await binance.futuresLeverage(symbol, leverage);
    console.log(`Leverage set to ${leverage}x for ${symbol}`);
  } catch (err) {
    console.error(`Failed to set leverage for ${symbol}:`, err.body);
  }
}
function calculateROIPrices(entryPrice, marginUsed, quantity, side) {
  const stopLossPnL = (marginUsed * STOP_LOSS_ROI) / 100;
  const takeProfitPnL = (marginUsed * TAKE_PROFIT_ROI) / 100;

  let stopLossPrice, takeProfitPrice;

  if (side === "LONG") {
    stopLossPrice = entryPrice + stopLossPnL / quantity;
    takeProfitPrice = entryPrice + takeProfitPnL / quantity;
  } else {
    stopLossPrice = entryPrice - stopLossPnL / quantity;
    takeProfitPrice = entryPrice - takeProfitPnL / quantity;
  }

  return { stopLossPrice, takeProfitPrice };
}

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

async function getIndicators(symbol, interval) {
  const data = await getCandles(symbol, interval, 100);
  const closes = data.map((c) => c.close);
  const highs = data.map((c) => c.high);
  const lows = data.map((c) => c.low);
  const volumes = data.map((c) => c.volume);

  return {
    rsi: technicalIndicators.RSI.calculate({
      period: RSI_PERIOD,
      values: closes,
    }),
    macd: technicalIndicators.MACD.calculate({
      values: closes,
      fastPeriod: MACD_FAST,
      slowPeriod: MACD_SLOW,
      signalPeriod: MACD_SIGNAL,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    }),
    bb: technicalIndicators.BollingerBands.calculate({
      period: BB_PERIOD,
      stdDev: BB_STD_DEV,
      values: closes,
    }),
    emaFast: technicalIndicators.EMA.calculate({
      period: EMA_FAST,
      values: closes,
    }),
    emaSlow: technicalIndicators.EMA.calculate({
      period: EMA_SLOW,
      values: closes,
    }),
    emaTrendShort: technicalIndicators.EMA.calculate({
      period: EMA_TREND_SHORT,
      values: closes,
    }),
    emaTrendLong: technicalIndicators.EMA.calculate({
      period: EMA_TREND_LONG,
      values: closes,
    }),
    adx: technicalIndicators.ADX.calculate({
      close: closes,
      high: highs,
      low: lows,
      period: ADX_PERIOD,
    }),
    vwma: technicalIndicators.VWMA.calculate({
      period: VWMA_PERIOD,
      close: closes,
      volume: volumes,
    }),
    latestClose: closes[closes.length - 1], // Added for decision use
  };
}

function getMarketCondition(indicators) {
  const latestRSI = indicators.rsi[indicators.rsi.length - 1];
  const latestADX = indicators.adx[indicators.adx.length - 1]?.adx;
  if (!latestRSI || !latestADX) return "unknown";
  if (latestADX < 20 || latestRSI > 70 || latestRSI < 30) return "sideways";
  return "trending";
}

function decideTradeDirection(indicators) {
  let score = 0;
  const latestRSI = indicators.rsi[indicators.rsi.length - 1];
  const latestMACD = indicators.macd[indicators.macd.length - 1];
  const latestBB = indicators.bb[indicators.bb.length - 1];
  const latestClose = indicators.latestClose;
  const emaFast = indicators.emaFast[indicators.emaFast.length - 1];
  const emaSlow = indicators.emaSlow[indicators.emaSlow.length - 1];
  const emaShort =
    indicators.emaTrendShort[indicators.emaTrendShort.length - 1];
  const emaLong = indicators.emaTrendLong[indicators.emaTrendLong.length - 1];
  const vwma = indicators.vwma[indicators.vwma.length - 1];

  if (latestRSI > 50) score++;
  else if (latestRSI < 50) score--;

  if (latestMACD.MACD > latestMACD.signal) score++;
  else score--;

  if (latestClose < latestBB.lower) score++;
  else if (latestClose > latestBB.upper) score--;

  if (emaFast > emaSlow) score++;
  else score--;

  if (emaShort > emaLong) score++;
  else score--;

  if (latestClose > vwma) score++;
  else score--;

  if (score >= LONG_THRESHOLD) return "LONG";
  else if (score <= SHORT_THRESHOLD) return "SHORT";
  else return "HOLD";
}

async function processSymbol(symbol, interval, maxSpendPerTrade) {
  const indicators = await getIndicators(symbol, interval);
  const marketCondition = getMarketCondition(indicators);

  if (marketCondition === "sideways") {
    console.log(`Market is sideways for ${symbol}. Skipping trade.`);
    return;
  }

  if (marketCondition === "trending") {
    const decision = decideTradeDirection(indicators);

    if (decision === "LONG") {
      await placeBuyOrder(symbol, maxSpendPerTrade);
    } else if (decision === "SHORT") {
      await placeShortOrder(symbol, maxSpendPerTrade);
    } else {
      console.log(`No trade signal for ${symbol}`);
    }
  }
}

async function placeBuyOrder(symbol, marginAmount) {
  try {
    await setLeverage(symbol);

    const price = (await binance.futuresPrices())[symbol];
    const entryPrice = parseFloat(price);
    const positionValue = marginAmount * leverage;
    const quantity = parseFloat((positionValue / entryPrice).toFixed(6));

    const exchangeInfo = await binance.futuresExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
    const pricePrecision = symbolInfo.pricePrecision;
    const quantityPrecision = symbolInfo.quantityPrecision;

    const qtyFixed = quantity.toFixed(quantityPrecision);
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
    const buyOrder = await binance.futuresMarketBuy(symbol, qtyFixed);

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
    // const takeProfitOrder = await binance.futuresOrder(
    //   "TAKE_PROFIT_MARKET",
    //   "SELL",
    //   symbol,
    //   qtyFixed,
    //   null,
    //   {
    //     stopPrice: takeProfitFixed,
    //     reduceOnly: true,
    //     timeInForce: "GTC",
    //   }
    // );
    // console.log(
    //   `Take Profit set at ${takeProfitFixed} for ${symbol} (${TAKE_PROFIT_ROI}% ROI)`
    // );

    const details = {
      //   takeProfitPrice: takeProfitFixed,
      //   profitOrderId: takeProfitOrder.orderId,
      stopLossPrice: stopLossFixed,
      stopLossOrderId: stopLossOrder.orderId,
    };

    await axios.put(`${API_ENDPOINT}${tradeId}`, {
      data: details,
    });

    console.log(`✅ Added ${symbol} LONG position to trailing stop monitoring`);
  } catch (error) {
    console.error(`Error placing LONG order for ${symbol}:`, error);
  }
}
async function placeShortOrder(symbol, marginAmount) {
  try {
    await setLeverage(symbol);

    const price = (await binance.futuresPrices())[symbol];
    const entryPrice = parseFloat(price);
    const positionValue = marginAmount * leverage;
    const quantity = parseFloat((positionValue / entryPrice).toFixed(6));
    const exchangeInfo = await binance.futuresExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
    const pricePrecision = symbolInfo.pricePrecision;
    const quantityPrecision = symbolInfo.quantityPrecision;
    const qtyFixed = quantity.toFixed(quantityPrecision);
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
    const shortOrder = await binance.futuresMarketSell(symbol, qtyFixed);

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
    // const takeProfitOrder = await binance.futuresOrder(
    //   "TAKE_PROFIT_MARKET",
    //   "BUY",
    //   symbol,
    //   qtyFixed,
    //   null,
    //   {
    //     stopPrice: takeProfitFixed,
    //     reduceOnly: true,
    //     timeInForce: "GTC",
    //   }
    // );
    // console.log(
    //   `Take Profit set at ${takeProfitFixed} for ${symbol} (${TAKE_PROFIT_ROI}% ROI)`
    // );

    const details = {
      //   takeProfitPrice: takeProfitFixed,
      //   profitOrderId: takeProfitOrder.orderId,
      stopLossPrice: stopLossFixed,
      stopLossOrderId: stopLossOrder.orderId,
    };

    await axios.put(`${API_ENDPOINT}${tradeId}`, {
      data: details,
    });

    console.log(
      `✅ Added ${symbol} SHORT position to trailing stop monitoring`
    );
  } catch (error) {
    console.error(`Error placing SHORT order for ${symbol}:`, error);
  }
}

// 🔁 Main Loop
setInterval(async () => {
  const totalBalance = await getUsdtBalance();
  const usableBalance = totalBalance - 6; // Keep $5.1 reserve
  const maxSpendPerTrade = usableBalance / symbols.length;

  if (usableBalance <= 6) {
    console.log("Not enough balance to trade.");
    return;
  }

  console.log(`Total Balance: ${totalBalance} USDT`);
  console.log(`Usable Balance: ${usableBalance} USDT`);
  console.log(`Max Spend Per Trade: ${maxSpendPerTrade} USDT`);

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
}, 60 * 500); // Run every 1 minute

setInterval(async () => {
  await monitorTrailingStops();
}, 30 * 1000); // Run every 30 seconds

console.log("🚀 Enhanced Trading Bot with Trailing Stop Started!");
console.log(`📊 Minimum Profit ROI: ${MINIMUM_PROFIT_ROI}%`);
console.log(`🎯 Initial Take Profit ROI: ${INITIAL_TAKE_PROFIT_ROI}%`);
console.log(`📉 Stop Loss ROI: ${STOP_LOSS_ROI}%`);
console.log(`📈 Leverage: ${leverage}x`);

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

    if (!stopLossOrderId) {
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
}, 20000);
