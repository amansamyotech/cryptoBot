const Binance = require("node-binance-api");
const technicalIndicators = require("technicalindicators");
const { RSI, MACD, BollingerBands, EMA, ADX, VWMA } = require('technicalindicators');

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
const EMA_FAST = 12;
const EMA_SLOW = 26;
const EMA_TREND_SHORT = 50;
const EMA_TREND_LONG = 200;
const ADX_PERIOD = 14;
const VWMA_PERIOD = 20;
const LONG_THRESHOLD = 3;
const SHORT_THRESHOLD = -3;
// 📊 Scoring Thresholds


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

// Set leverage before trading
async function setLeverage(symbol) {
  try {
    await binance.futuresLeverage(symbol, 3);
    console.log(`Leverage set to ${leverage}x for ${symbol}`);
  } catch (err) {
    console.error(`Failed to set leverage for ${symbol}:`, err.body);
  }
}

// 📊 Calculate ROI-based prices for stop loss and take profit
function calculateROIPrices(entryPrice, marginUsed, quantity, side) {
  // For futures trading, ROI = PnL / Margin Used × 100
  // PnL = (Exit Price - Entry Price) × Quantity × (1 for LONG, -1 for SHORT)

  const stopLossPnL = (marginUsed * STOP_LOSS_ROI) / 100; // Negative value
  const takeProfitPnL = (marginUsed * TAKE_PROFIT_ROI) / 100; // Positive value

  let stopLossPrice, takeProfitPrice;

  if (side === "LONG") {
    // For LONG: PnL = (Exit Price - Entry Price) × Quantity
    // Stop Loss: Exit Price = Entry Price + (PnL / Quantity)
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

async function getCandles(symbol, interval, limit = 200) {
  try {
    console.log(`Fetching candles for ${symbol}...`);
    const candles = await binance.futuresCandles(symbol, interval, { limit });
    
    if (!candles || candles.length === 0) {
      throw new Error(`No candle data received for ${symbol}`);
    }

    if (candles.length < 50) {
      throw new Error(`Insufficient candle data for ${symbol}: only ${candles.length} candles received`);
    }

    const processedCandles = candles.map((c) => {
      const processed = {
        open: parseFloat(c.open),
        high: parseFloat(c.high),
        low: parseFloat(c.low),
        close: parseFloat(c.close),
        volume: parseFloat(c.volume),
      };

      // Validate individual candle data
      if (isNaN(processed.open) || isNaN(processed.high) || isNaN(processed.low) || 
          isNaN(processed.close) || isNaN(processed.volume)) {
        throw new Error(`Invalid candle data for ${symbol}`);
      }

      return processed;
    });

    console.log(`Successfully fetched ${processedCandles.length} candles for ${symbol}`);
    return processedCandles;

  } catch (error) {
    console.error(`Error fetching candles for ${symbol}:`, error.message);
    throw error;
  }
}


function calculateVWMA(prices, volumes, period) {
  const result = [];
  
  for (let i = period - 1; i < prices.length; i++) {
    let weightedSum = 0;
    let volumeSum = 0;
    
    for (let j = 0; j < period; j++) {
      const index = i - period + 1 + j;
      weightedSum += prices[index] * volumes[index];
      volumeSum += volumes[index];
    }
    
    result.push(volumeSum > 0 ? weightedSum / volumeSum : prices[i]);
  }
  
  return result;
}


async function getIndicators(symbol, interval) {
  try {
    const data = await getCandles(symbol, interval, 200);
    
    if (data.length < 50) {
      throw new Error(`Insufficient data for ${symbol}: ${data.length} candles (minimum 50 required)`);
    }

    const closes = data.map((c) => c.close);
    const highs = data.map((c) => c.high);
    const lows = data.map((c) => c.low);
    const volumes = data.map((c) => c.volume);

    // Additional validation
    if (closes.some(isNaN) || highs.some(isNaN) || lows.some(isNaN) || volumes.some(isNaN)) {
      throw new Error(`Invalid price data detected for ${symbol}`);
    }

    console.log(`${symbol} - Data validation passed`);
    console.log(`closes sample:`, closes.slice(-5));
    console.log(`highs sample:`, highs.slice(-5));
    console.log(`lows sample:`, lows.slice(-5));
    console.log(`volumes sample:`, volumes.slice(-5));

    const indicators = {};

    // Calculate RSI with error handling
    try {
      if (closes.length >= RSI_PERIOD) {
        indicators.rsi = RSI.calculate({
          period: RSI_PERIOD,
          values: closes,
        });
        if (!indicators.rsi || indicators.rsi.length === 0) {
          throw new Error('RSI calculation returned empty result');
        }
      } else {
        throw new Error(`Not enough data for RSI: need ${RSI_PERIOD}, have ${closes.length}`);
      }
    } catch (e) {
      console.error(`RSI calculation failed for ${symbol}:`, e.message);
      throw new Error(`RSI calculation failed: ${e.message}`);
    }

    // Calculate MACD with error handling
    try {
      if (closes.length >= MACD_SLOW) {
        indicators.macd = MACD.calculate({
          values: closes,
          fastPeriod: MACD_FAST,
          slowPeriod: MACD_SLOW,
          signalPeriod: MACD_SIGNAL,
          SimpleMAOscillator: false,
          SimpleMASignal: false,
        });
        if (!indicators.macd || indicators.macd.length === 0) {
          throw new Error('MACD calculation returned empty result');
        }
      } else {
        throw new Error(`Not enough data for MACD: need ${MACD_SLOW}, have ${closes.length}`);
      }
    } catch (e) {
      console.error(`MACD calculation failed for ${symbol}:`, e.message);
      throw new Error(`MACD calculation failed: ${e.message}`);
    }

    // Calculate Bollinger Bands with error handling
    try {
      if (closes.length >= BB_PERIOD) {
        indicators.bb = BollingerBands.calculate({
          period: BB_PERIOD,
          stdDev: BB_STD_DEV,
          values: closes,
        });
        if (!indicators.bb || indicators.bb.length === 0) {
          throw new Error('Bollinger Bands calculation returned empty result');
        }
      } else {
        throw new Error(`Not enough data for BB: need ${BB_PERIOD}, have ${closes.length}`);
      }
    } catch (e) {
      console.error(`Bollinger Bands calculation failed for ${symbol}:`, e.message);
      throw new Error(`BB calculation failed: ${e.message}`);
    }

    // Calculate EMA Fast with error handling
    try {
      if (closes.length >= EMA_FAST) {
        indicators.emaFast = EMA.calculate({
          period: EMA_FAST,
          values: closes,
        });
        if (!indicators.emaFast || indicators.emaFast.length === 0) {
          throw new Error('EMA Fast calculation returned empty result');
        }
      } else {
        throw new Error(`Not enough data for EMA Fast: need ${EMA_FAST}, have ${closes.length}`);
      }
    } catch (e) {
      console.error(`EMA Fast calculation failed for ${symbol}:`, e.message);
      throw new Error(`EMA Fast calculation failed: ${e.message}`);
    }

    // Calculate EMA Slow with error handling
    try {
      if (closes.length >= EMA_SLOW) {
        indicators.emaSlow = EMA.calculate({
          period: EMA_SLOW,
          values: closes,
        });
        if (!indicators.emaSlow || indicators.emaSlow.length === 0) {
          throw new Error('EMA Slow calculation returned empty result');
        }
      } else {
        throw new Error(`Not enough data for EMA Slow: need ${EMA_SLOW}, have ${closes.length}`);
      }
    } catch (e) {
      console.error(`EMA Slow calculation failed for ${symbol}:`, e.message);
      throw new Error(`EMA Slow calculation failed: ${e.message}`);
    }

    // Calculate EMA Trend Short with error handling
    try {
      if (closes.length >= EMA_TREND_SHORT) {
        indicators.emaTrendShort = EMA.calculate({
          period: EMA_TREND_SHORT,
          values: closes,
        });
        if (!indicators.emaTrendShort || indicators.emaTrendShort.length === 0) {
          throw new Error('EMA Trend Short calculation returned empty result');
        }
      } else {
        throw new Error(`Not enough data for EMA Trend Short: need ${EMA_TREND_SHORT}, have ${closes.length}`);
      }
    } catch (e) {
      console.error(`EMA Trend Short calculation failed for ${symbol}:`, e.message);
      throw new Error(`EMA Trend Short calculation failed: ${e.message}`);
    }

    // Calculate EMA Trend Long with error handling
    try {
      if (closes.length >= EMA_TREND_LONG) {
        indicators.emaTrendLong = EMA.calculate({
          period: EMA_TREND_LONG,
          values: closes,
        });
        if (!indicators.emaTrendLong || indicators.emaTrendLong.length === 0) {
          throw new Error('EMA Trend Long calculation returned empty result');
        }
      } else {
        throw new Error(`Not enough data for EMA Trend Long: need ${EMA_TREND_LONG}, have ${closes.length}`);
      }
    } catch (e) {
      console.error(`EMA Trend Long calculation failed for ${symbol}:`, e.message);
      throw new Error(`EMA Trend Long calculation failed: ${e.message}`);
    }

    // Calculate ADX with error handling
    try {
      if (closes.length >= ADX_PERIOD && highs.length >= ADX_PERIOD && lows.length >= ADX_PERIOD) {
        indicators.adx = ADX.calculate({
          close: closes,
          high: highs,
          low: lows,
          period: ADX_PERIOD,
        });
        if (!indicators.adx || indicators.adx.length === 0) {
          throw new Error('ADX calculation returned empty result');
        }
      } else {
        throw new Error(`Not enough data for ADX: need ${ADX_PERIOD}, have ${closes.length}`);
      }
    } catch (e) {
      console.error(`ADX calculation failed for ${symbol}:`, e.message);
      throw new Error(`ADX calculation failed: ${e.message}`);
    }

    // Calculate VWMA with error handling (using custom function)
    try {
      if (closes.length >= VWMA_PERIOD && volumes.length >= VWMA_PERIOD) {
        indicators.vwma = calculateVWMA(closes, volumes, VWMA_PERIOD);
        if (!indicators.vwma || indicators.vwma.length === 0) {
          throw new Error('VWMA calculation returned empty result');
        }
      } else {
        throw new Error(`Not enough data for VWMA: need ${VWMA_PERIOD}, have ${closes.length}`);
      }
    } catch (e) {
      console.error(`VWMA calculation failed for ${symbol}:`, e.message);
      throw new Error(`VWMA calculation failed: ${e.message}`);
    }

    indicators.latestClose = closes[closes.length - 1];

    console.log(`Successfully calculated all indicators for ${symbol}`);
    return indicators;

  } catch (error) {
    console.error(`Error calculating indicators for ${symbol}:`, error.message);
    throw error;
  }
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
  const indicators = await getIndicators(symbol, '3m');
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


// 💰 Place Buy Order + Stop Loss (LONG Position)
async function placeBuyOrder(symbol, marginAmount) {
  try {
    await setLeverage(symbol);

    const price = (await binance.futuresPrices())[symbol];
    console.log(`price`,price);
    
    const entryPrice = parseFloat(price);
    console.log(`entryPrice`,entryPrice);
    

    // Calculate position size with leverage
    const positionValue = marginAmount * 3;
    const quantity = parseFloat((positionValue / entryPrice).toFixed(6));
    console.log(`quantity`,quantity);
    

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
      leverage: 3,
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

// 📉 Place Short Order + Stop Loss (SHORT Position)
async function placeShortOrder(symbol, marginAmount) {
  console.log(`symbol`,symbol);
  console.log('`marginAmount`',marginAmount);
  
  
  try {
    await setLeverage(symbol);

    const price = (await binance.futuresPrices())[symbol];
    const entryPrice = parseFloat(price);
    console.log(`entryPrice`,entryPrice);
    

    // Calculate position size with leverage
    const positionValue = marginAmount * 3;
    console.log(`positionValue`,positionValue);
    
    const quantity = parseFloat((positionValue / entryPrice).toFixed(6));
    console.log(`quantity`,quantity);
    

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
      leverage: 3,
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
  const usableBalance = totalBalance - 5; // Keep $5.1 reserve
  console.log(`usableBalance usableBalance usableBalance`, usableBalance);
  console.log(`usableBalance usableBalance usableBalance`, totalBalance - 209);

  const maxSpendPerTrade = usableBalance / symbols.length;
  console.log(`maxSpendPerTrade`, maxSpendPerTrade);

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
}, 10000); // Run every 1 minute

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
