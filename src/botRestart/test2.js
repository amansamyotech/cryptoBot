const Binance = require("node-binance-api");
const axios = require("axios");

const binance = new Binance().options({
  APIKEY: "whfiekZqKdkwa9fEeUupVdLZTNxBqP1OCEuH2pjyImaWt51FdpouPPrCawxbsupK",
  APISECRET: "E4IcteWOQ6r9qKrBZJoBy4R47nNPBDepVXMnS3Lf2Bz76dlu0QZCNh82beG2rHq4",
  useServerTime: true,
  test: false,
});

const TIMEFRAME_MAIN = "5m";
const TIMEFRAME_TREND = "15m";
const TAKER_FEE = 0.04 / 100;

const symbols = [
  "XRPUSDT",
  "ADAUSDT",
  "BNBUSDT",
  "DOGEUSDT",
  "DOTUSDT",
  "SUIUSDT",
  "NEARUSDT",
  "INJUSDT",
  "ORDIUSDT",
  "LTCUSDT",
  "TRXUSDT",
  "ETCUSDT",
  "SOLUSDT",
  "DAIUSDT",
  "WIFUSDT",
  "TONUSDT",
  "TAOUSDT",
  "LEVERUSDT",
  "KSMUSDT",
  "1000PEPEUSDT",
  "1000BONKUSDT",
  "CKBUSDT",
  "1000FLOKIUSDT",
];
async function getCandles(symbol, interval, startTime, endTime, limit = 1000) {
  try {
    if (startTime && endTime) {
      const candles = [];
      let currentStartTime = startTime;
      while (currentStartTime < endTime) {
        const batch = await binance.futuresCandles(symbol, interval, {
          startTime: currentStartTime,
          endTime: Math.min(currentStartTime + limit * 60 * 1000, endTime),
          limit,
        });

        if (!Array.isArray(batch) || !batch.length) {
          console.error(
            `❌ No candle data for ${symbol} - ${interval} at ${new Date(
              currentStartTime
            ).toISOString()}`
          );
          break;
        }

        candles.push(...batch);
        currentStartTime = batch[batch.length - 1][0] + 60 * 1000;
      }

      return candles
        .map((c, idx) => {
          const isObjectFormat = typeof c === "object" && !Array.isArray(c);

          if (isObjectFormat) {
            return {
              openTime: c.openTime,
              open: parseFloat(c.open),
              high: parseFloat(c.high),
              low: parseFloat(c.low),
              close: parseFloat(c.close),
              volume: parseFloat(c.volume),
            };
          }

          if (Array.isArray(c) && c.length >= 6) {
            return {
              openTime: c[0],
              open: parseFloat(c[1]),
              high: parseFloat(c[2]),
              low: parseFloat(c[3]),
              close: parseFloat(c[4]),
              volume: parseFloat(c[5]),
            };
          }

          console.warn(`⚠️ Malformed candle at index ${idx} for ${symbol}:`, c);
          return null;
        })
        .filter((c) => c && !isNaN(c.close));
    } else {
      const res = await axios.get(
        `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
      );
      if (!res.data || !Array.isArray(res.data)) {
        console.error(
          `❌ Invalid response from axios for ${symbol} - ${interval}`
        );
        return [];
      }
      return res.data
        .map((c) => ({
          openTime: c[0],
          open: parseFloat(c[1]),
          high: parseFloat(c[2]),
          low: parseFloat(c[3]),
          close: parseFloat(c[4]),
          volume: parseFloat(c[5]),
        }))
        .filter((c) => !isNaN(c.close));
    }
  } catch (err) {
    console.error(
      `❌ Error fetching candles for ${symbol} (${interval}):`,
      err.message
    );
    return [];
  }
}

// Helper function to calculate EMA
function calculateEMA(prices, period) {
  const k = 2 / (period + 1);
  let ema = prices[0];
  const emaArray = [ema];

  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
    emaArray.push(ema);
  }

  return emaArray;
}

function getCandleAngle(candle, timeSpan = 300) {
  const delta = ((candle.close - candle.open) / candle.open) * 100000;
  const rawAngleRad = Math.atan(delta / timeSpan);
  let angle = rawAngleRad * (180 / Math.PI);

  if (candle.close > candle.open) {
    angle = 90 + (Math.abs(delta) / (Math.abs(delta) + 100)) * 60;
  } else if (candle.close < candle.open) {
    angle = 210 + (Math.abs(delta) / (Math.abs(delta) + 100)) * 60;
  } else {
    angle = 180;
  }

  return angle;
}

function calculateBollingerBands(prices, period = 20, stdDev = 2) {
  const sma = [];
  const std = [];
  const upperBand = [];
  const lowerBand = [];

  for (let i = period - 1; i < prices.length; i++) {
    const slice = prices.slice(i - period + 1, i + 1);
    const mean = slice.reduce((sum, p) => sum + p, 0) / period;
    sma.push(mean);

    const variance =
      slice.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / period;
    const standardDeviation = Math.sqrt(variance);
    std.push(standardDeviation);

    upperBand.push(mean + stdDev * standardDeviation);
    lowerBand.push(mean - stdDev * standardDeviation);
  }

  return { sma, upperBand, lowerBand };
}

function calculateADX(candles, period = 14) {
  let plusDM = [];
  let minusDM = [];
  let tr = [];

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevHigh = candles[i - 1].high;
    const prevLow = candles[i - 1].low;
    const prevClose = candles[i - 1].close;

    const upMove = high - prevHigh;
    const downMove = prevLow - low;

    const dmPlus = upMove > downMove && upMove > 0 ? upMove : 0;
    const dmMinus = downMove > upMove && downMove > 0 ? downMove : 0;

    const trValue = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );

    plusDM.push(dmPlus);
    minusDM.push(dmMinus);
    tr.push(trValue);
  }

  // Smooth the values
  const smoothPeriod = period;
  let smoothedPlusDM = [];
  let smoothedMinusDM = [];
  let smoothedTR = [];

  for (let i = smoothPeriod - 1; i < plusDM.length; i++) {
    if (i === smoothPeriod - 1) {
      smoothedPlusDM.push(
        plusDM
          .slice(i - smoothPeriod + 1, i + 1)
          .reduce((sum, val) => sum + val, 0)
      );
      smoothedMinusDM.push(
        minusDM
          .slice(i - smoothPeriod + 1, i + 1)
          .reduce((sum, val) => sum + val, 0)
      );
      smoothedTR.push(
        tr.slice(i - smoothPeriod + 1, i + 1).reduce((sum, val) => sum + val, 0)
      );
    } else {
      smoothedPlusDM.push(
        (smoothedPlusDM[smoothedPlusDM.length - 1] * (smoothPeriod - 1) +
          plusDM[i]) /
          smoothPeriod
      );
      smoothedMinusDM.push(
        (smoothedMinusDM[smoothedMinusDM.length - 1] * (smoothPeriod - 1) +
          minusDM[i]) /
          smoothPeriod
      );
      smoothedTR.push(
        (smoothedTR[smoothedTR.length - 1] * (smoothPeriod - 1) + tr[i]) /
          smoothPeriod
      );
    }
  }

  // Calculate DI+ and DI-
  const plusDI = smoothedPlusDM.map((dm, i) => (dm / smoothedTR[i]) * 100);
  const minusDI = smoothedMinusDM.map((dm, i) => (dm / smoothedTR[i]) * 100);

  // Calculate DX and ADX
  const dx = plusDI.map(
    (pdi, i) => (Math.abs(pdi - minusDI[i]) / (pdi + minusDI[i])) * 100
  );
  const adx = [];
  for (let i = smoothPeriod - 1; i < dx.length; i++) {
    if (i === smoothPeriod - 1) {
      adx.push(
        dx
          .slice(i - smoothPeriod + 1, i + 1)
          .reduce((sum, val) => sum + val, 0) / smoothPeriod
      );
    } else {
      adx.push(
        (adx[adx.length - 1] * (smoothPeriod - 1) + dx[i]) / smoothPeriod
      );
    }
  }

  return adx;
}

function isSidewaysMarket(
  candles,
  lookbackPeriod = 20,
  thresholdPercent = 0.6
) {
  if (candles.length < lookbackPeriod) {
    console.log("❌ Insufficient candles for sideways analysis");
    return false;
  }

  const recentCandles = candles.slice(-lookbackPeriod);
  const closePrices = recentCandles.map((c) => c.close);

  // 1. Price Range Check
  const highs = recentCandles.map((c) => c.high);
  const lows = recentCandles.map((c) => c.low);
  const highestHigh = Math.max(...highs);
  const lowestLow = Math.min(...lows);
  const currentPrice = candles[candles.length - 1].close;
  const priceRange = ((highestHigh - lowestLow) / currentPrice) * 100;

  // 2. Volatility Check (tighter for 5m)
  const recentVolatility =
    recentCandles.slice(-5).reduce((sum, candle) => {
      return sum + Math.abs((candle.high - candle.low) / candle.close) * 100;
    }, 0) / 5;

  // 3. EMA Convergence Check
  const ema5 = calculateEMA(closePrices, 5);
  const ema15 = calculateEMA(closePrices, 15);
  const lastEma5 = ema5[ema5.length - 1];
  const lastEma15 = ema15[ema15.length - 1];
  const emaConvergence = Math.abs((lastEma5 - lastEma15) / currentPrice) * 100;

  // 4. Oscillation Check
  const avgEma = (lastEma5 + lastEma15) / 2;
  let priceAboveEma = 0;
  let priceBelowEma = 0;
  recentCandles.slice(-10).forEach((candle) => {
    if (candle.close > avgEma) priceAboveEma++;
    else priceBelowEma++;
  });
  const oscillationRatio = Math.min(priceAboveEma, priceBelowEma) / 10;

  // 5. Bollinger Bands Check
  const bb = calculateBollingerBands(closePrices, 20, 2);
  const lastPrice = closePrices[closePrices.length - 1];
  const lastUpperBand = bb.upperBand[bb.upperBand.length - 1];
  const lastLowerBand = bb.lowerBand[bb.lowerBand.length - 1];
  const bbWidth = ((lastUpperBand - lastLowerBand) / lastPrice) * 100;
  const priceWithinBands =
    lastPrice <= lastUpperBand && lastPrice >= lastLowerBand;

  // 6. ADX Check (low ADX indicates no trend)
  const adx = calculateADX(recentCandles, 14);
  const lastAdx = adx[adx.length - 1];

  // 7. Consolidation Pattern Check (doji-like candles)
  const recentCandlesShort = recentCandles.slice(-5);
  const dojiCount = recentCandlesShort.filter((c) => {
    const bodySize = Math.abs(c.close - c.open) / c.open;
    const totalRange = (c.high - c.low) / c.open;
    return bodySize <= 0.001 && totalRange >= 0.002; // Small body, reasonable range
  }).length;

  // Enhanced Sideways Criteria
  const isSideways =
    priceRange <= thresholdPercent && // Tighter range
    emaConvergence <= 0.25 && // Tighter EMA convergence
    recentVolatility <= 0.3 && // Lower volatility for 5m
    oscillationRatio >= 0.4 && // Stronger oscillation
    bbWidth <= 1.0 && // Narrow Bollinger Bands
    priceWithinBands && // Price within bands
    lastAdx <= 20 && // Low ADX (no trend)
    dojiCount >= 2; // At least 2 doji-like candles

  if (isSideways) {
    console.log(
      `📊 Sideways market detected for 5m timeframe: ` +
        `Range=${priceRange.toFixed(2)}%, ` +
        `EMA convergence=${emaConvergence.toFixed(3)}%, ` +
        `Volatility=${recentVolatility.toFixed(2)}%, ` +
        `BB Width=${bbWidth.toFixed(2)}%, ` +
        `ADX=${lastAdx.toFixed(2)}, ` +
        `Doji Count=${dojiCount}`
    );
  }

  return isSideways;
}
async function decideTradeDirection(
  symbol,
  candles5m,
  candles15m,
  candleIndex
) {
  try {
    const pastCandles5m = candles5m.slice(0, candleIndex + 1);

    if (pastCandles5m.length < 300) {
      console.log("❌ Insufficient candles for analysis");
      return "HOLD";
    }

    if (isSidewaysMarket(pastCandles5m)) {
      console.log(`⚖️ Market is sideways for ${symbol}. Decision: HOLD`);
      return "HOLD";
    }

    const closePrices = pastCandles5m.map((c) => c.close);
    const ema300 = calculateEMA(closePrices, 300);
    const ema9 = calculateEMA(closePrices, 9);
    const lastCandle = pastCandles5m[pastCandles5m.length - 1];
    const lastEma300 = ema300[ema300.length - 1];
    const lastEma9 = ema9[ema9.length - 1];
    const angle = getCandleAngle(lastCandle);

    if (
      lastCandle.close > lastEma300 &&
      lastCandle.close > lastEma9 &&
      angle >= 90 &&
      angle <= 135
    ) {
      console.log(
        `📈 LONG signal for ${symbol}: Close=${lastCandle.close}, EMA300=${lastEma300}, EMA9=${lastEma9}, Angle=${angle}`
      );
      return "LONG";
    } else if (
      lastCandle.close < lastEma300 &&
      lastCandle.close < lastEma9 &&
      angle >= 225 &&
      angle <= 280
    ) {
      console.log(
        `📉 SHORT signal for ${symbol}: Close=${lastCandle.close}, EMA300=${lastEma300}, EMA9=${lastEma9}, Angle=${angle}`
      );
      return "SHORT";
    } else {
      console.log(
        `⏸ HOLD for ${symbol}: Close=${lastCandle.close}, EMA300=${lastEma300}, EMA9=${lastEma9}, Angle=${angle}`
      );
      return "HOLD";
    }
  } catch (err) {
    console.error(`❌ Decision error for ${symbol}:`, err.message);
    return "HOLD";
  }
}

async function backtest(symbols, startDate, endDate) {
  const startTime = new Date(startDate).getTime();
  const endTime = new Date(endDate).getTime();

  const LEVERAGE = 3;
  const MARGIN_AMOUNT = 100;

  for (const symbol of symbols) {
    console.log(`\n📊 Backtesting ${symbol}...`);

    const candles5m = await getCandles(
      symbol,
      TIMEFRAME_MAIN,
      startTime,
      endTime
    );
    const candles15m = await getCandles(
      symbol,
      TIMEFRAME_TREND,
      startTime,
      endTime
    );

    if (candles5m.length < 50 || candles15m.length < 20) {
      //   console.log(`⚠️ Insufficient data for ${symbol}. Skipping... (5m: ${candles5m.length}, 15m: ${candles15m.length})`);
      continue;
    }

    const results = {
      LONG: 0,
      SHORT: 0,
      HOLD: 0,
      trades: [],
      profit: 0,
      wins: 0,
      losses: 0,
    };

    let position = null;

    for (let i = 50; i < candles5m.length - 1; i++) {
      const signal = await decideTradeDirection(
        symbol,
        candles5m,
        candles15m,
        i
      );
      results[signal]++;

      const currentCandle = candles5m[i];

      if ((signal === "LONG" || signal === "SHORT") && !position) {
        const entryPrice = currentCandle.close;
        const positionValue = MARGIN_AMOUNT * LEVERAGE;
        const quantity = positionValue / entryPrice;

        position = {
          type: signal,
          entryPrice: entryPrice,
          entryTime: currentCandle.openTime,
          marginUsed: MARGIN_AMOUNT,
          quantity: quantity,
          leverage: LEVERAGE,
        };
      } else if (position) {
        const nextCandle = candles5m[i + 1];
        const currentPrice = nextCandle.close;
        let exitTrade = false;
        let reason = "";

        // Calculate PnL and ROI based on Binance method
        let pnl, roi;

        if (position.type === "LONG") {
          pnl = (currentPrice - position.entryPrice) * position.quantity;
          roi = (pnl / position.marginUsed) * 100;

          if (roi >= 2) {
            reason = "💰 Profit Target Hit";
            exitTrade = true;
          } else if (roi <= -2) {
            // Using -1.5% as stop loss like your main bot
            reason = "🛑 Stop Loss Hit";
            exitTrade = true;
          }
        } else if (position.type === "SHORT") {
          pnl = (position.entryPrice - currentPrice) * position.quantity;
          roi = (pnl / position.marginUsed) * 100;

          if (roi >= 2) {
            reason = "💰 Profit Target Hit";
            exitTrade = true;
          } else if (roi <= -2) {
            // Using -1.5% as stop loss like your main bot
            reason = "🛑 Stop Loss Hit";
            exitTrade = true;
          }
        }

        if (exitTrade) {
          // Calculate net profit after fees
          const feeAmount =
            position.quantity * position.entryPrice * TAKER_FEE +
            position.quantity * currentPrice * TAKER_FEE;
          const netPnL = pnl - feeAmount;
          const netROI = (netPnL / position.marginUsed) * 100;

          results.profit += netROI;

          if (netROI > 0) results.wins++;
          else results.losses++;

          results.trades.push({
            timestamp: new Date(position.entryTime).toLocaleString(),
            signal: position.type,
            entryPrice: position.entryPrice,
            exitPrice: currentPrice,
            marginUsed: position.marginUsed,
            quantity: position.quantity.toFixed(6),
            pnl: pnl.toFixed(4),
            roi: roi.toFixed(2),
            netROI: netROI.toFixed(2),
            reason,
          });

          position = null;
        }
      }
    }

    // Handle open position at end of backtest
    if (position && candles5m.length > 50) {
      const exitPrice = candles5m[candles5m.length - 1].close;

      let pnl;
      if (position.type === "LONG") {
        pnl = (exitPrice - position.entryPrice) * position.quantity;
      } else {
        pnl = (position.entryPrice - exitPrice) * position.quantity;
      }

      const roi = (pnl / position.marginUsed) * 100;
      const feeAmount =
        position.quantity * position.entryPrice * TAKER_FEE +
        position.quantity * exitPrice * TAKER_FEE;
      const netPnL = pnl - feeAmount;
      const netROI = (netPnL / position.marginUsed) * 100;

      results.profit += netROI;
      if (netROI > 0) results.wins++;
      else results.losses++;

      results.trades.push({
        timestamp: new Date(position.entryTime).toLocaleString(),
        signal: position.type,
        entryPrice: position.entryPrice,
        exitPrice,
        marginUsed: position.marginUsed,
        quantity: position.quantity.toFixed(6),
        pnl: pnl.toFixed(4),
        roi: roi.toFixed(2),
        netROI: netROI.toFixed(2),
        reason: "📊 Backtest End",
      });
    }

    console.log(`\n📈 Backtest Summary for ${symbol}`);
    console.log(`🟢 LONG Signals: ${results.LONG}`);
    console.log(`🔴 SHORT Signals: ${results.SHORT}`);
    console.log(`⚪ HOLD Signals: ${results.HOLD}`);
    console.log(
      `📊 Total Signals: ${results.LONG + results.SHORT + results.HOLD}`
    );
    console.log(`💰 Total ROI: ${results.profit.toFixed(2)}%`);
    console.log(`✅ Wins: ${results.wins} | ❌ Losses: ${results.losses}`);
    console.log(
      `🏆 Win Rate: ${(
        (results.wins / (results.wins + results.losses) || 0) * 100
      ).toFixed(2)}%`
    );

    // Calculate average ROI per trade
    const totalTrades = results.wins + results.losses;
    const avgROI =
      totalTrades > 0 ? (results.profit / totalTrades).toFixed(2) : 0;

    console.log(`\nDetailed Trades:`);

    console.log("=".repeat(80));
  }
}

const startDate = "2025-05-01T00:00:00Z";
const endDate = "2025-05-30T23:59:59Z";

backtest(symbols, startDate, endDate).catch((err) => {
  console.error("❌ Backtest error:", err.message);
});

module.exports = { decideTradeDirection };
