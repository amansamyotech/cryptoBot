const { EMA, Stochastic } = require("technicalindicators");
const technicalIndicators = require("technicalindicators");
const Binance = require("node-binance-api");

const binance = new Binance().options({
  APIKEY: "whfiekZqKdkwa9fEeUupVdLZTNxBqP1OCEuH2pjyImaWt51FdpouPPrCawxbsupK",
  APISECRET: "E4IcteWOQ6r9qKrBZJoBy4R47nNPBDepVXMnS3Lf2Bz76dlu0QZCNh82beG2rHq4",
  useServerTime: true,
  test: false, // Set to true for testnet
});

const interval = "30m";

// Improved sideways market detection
async function isSideways(symbol) {
  try {
    const candles = await getCandles(symbol, interval, 100);
    const closes = candles.map((c) => c.close);
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);

    if (closes.length < 50) {
      console.log(`⚠️ Not enough data for sideways analysis for ${symbol}`);
      return false;
    }

    // Method 1: Bollinger Bands Squeeze Detection
    const sma20 = technicalIndicators.SMA.calculate({ period: 20, values: closes });
    const stdDev = technicalIndicators.StandardDeviation.calculate({ period: 20, values: closes });
    
    if (sma20.length < 10 || stdDev.length < 10) return false;

    const currentSMA = sma20[sma20.length - 1];
    const currentStdDev = stdDev[stdDev.length - 1];
    const upperBB = currentSMA + (2 * currentStdDev);
    const lowerBB = currentSMA - (2 * currentStdDev);
    const bbWidth = ((upperBB - lowerBB) / currentSMA) * 100;

    // Method 2: ADX (Average Directional Index) for trend strength
    const adx = technicalIndicators.ADX.calculate({
      high: highs,
      low: lows,
      close: closes,
      period: 14
    });

    if (adx.length < 5) return false;
    const currentADX = adx[adx.length - 1].adx;

    // Method 3: Price Range Analysis (recent 20 candles)
    const recentCandles = candles.slice(-20);
    const recentHighs = recentCandles.map(c => c.high);
    const recentLows = recentCandles.map(c => c.low);
    const highest = Math.max(...recentHighs);
    const lowest = Math.min(...recentLows);
    const priceRange = ((highest - lowest) / lowest) * 100;

    // Method 4: Moving Average Convergence
    const ema9 = EMA.calculate({ period: 9, values: closes });
    const ema21 = EMA.calculate({ period: 21, values: closes });
    
    if (ema9.length < 10 || ema21.length < 10) return false;
    
    const recentEMA9 = ema9.slice(-10);
    const recentEMA21 = ema21.slice(-10);
    
    let convergenceCount = 0;
    for (let i = 0; i < recentEMA9.length; i++) {
      const diff = Math.abs((recentEMA9[i] - recentEMA21[i]) / recentEMA21[i]) * 100;
      if (diff < 1.0) convergenceCount++; // EMAs within 1% of each other
    }
    const convergenceRatio = convergenceCount / recentEMA9.length;

    // Sideways conditions
    const conditions = {
      bbSqueeze: bbWidth < 4, // Bollinger Bands width less than 4%
      lowTrend: currentADX < 25, // ADX below 25 indicates weak trend
      smallRange: priceRange < 5, // Price range less than 5% in recent 20 candles
      emaConvergence: convergenceRatio > 0.7 // EMAs converging 70% of the time
    };

    const sidewaysScore = Object.values(conditions).filter(Boolean).length;
    const isSidewaysMarket = sidewaysScore >= 3; // At least 3 out of 4 conditions

    console.log(`📊 Enhanced Sideways Analysis for ${symbol}:`);
    console.log(`   BB Width: ${bbWidth.toFixed(2)}% (< 4% = sideways)`);
    console.log(`   ADX: ${currentADX.toFixed(2)} (< 25 = weak trend)`);
    console.log(`   Price Range: ${priceRange.toFixed(2)}% (< 5% = sideways)`);
    console.log(`   EMA Convergence: ${(convergenceRatio * 100).toFixed(1)}% (> 70% = sideways)`);
    console.log(`   Sideways Score: ${sidewaysScore}/4 (≥3 = sideways)`);

    return isSidewaysMarket;
  } catch (error) {
    console.error(`❌ Error in sideways detection for ${symbol}:`, error.message);
    return false;
  }
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

async function decideTradeDirection(symbol) {
  // First check if market is sideways
  const sideways = await isSideways(symbol);
  if (sideways) {
    console.log(`🔄 Market is sideways for ${symbol}, returning HOLD`);
    return "HOLD";
  }

  // If not sideways, get candles and run other indicators
  const candles = await getCandles(symbol, interval, 300);

  const [emaAngleSignal, utSignal, stcSignal] = await Promise.all([
    getEMASignalWithAngle(candles), // Returns: LONG / SHORT / WAIT
    getUTBotSignal(candles), // Returns: LONG / SHORT / HOLD
    getSTCSignal(candles.map((c) => c.close)), // Returns: LONG / SHORT / HOLD
  ]);

  const signals = [emaAngleSignal, utSignal, stcSignal];

  // Count votes (treating WAIT as HOLD)
  const voteCount = signals.reduce(
    (acc, signal) => {
      if (signal === "LONG") acc.LONG++;
      else if (signal === "SHORT") acc.SHORT++;
      else acc.HOLD++; // This includes WAIT, HOLD, NO SIGNAL
      return acc;
    },
    { LONG: 0, SHORT: 0, HOLD: 0 }
  );

  console.log(`🧠 Signal Votes for ${symbol}:`, voteCount);
  console.log(
    `📊 Individual Signals: EMA=${emaAngleSignal}, UT=${utSignal}, STC=${stcSignal}`
  );

  // Return the signal with most votes
  if (voteCount.LONG > voteCount.SHORT && voteCount.LONG > voteCount.HOLD) {
    return "LONG";
  } else if (
    voteCount.SHORT > voteCount.LONG &&
    voteCount.SHORT > voteCount.HOLD
  ) {
    return "SHORT";
  } else {
    return "HOLD";
  }
}

// Updated UT Bot implementation based on TradingView script
const getUTBotSignal = async (candles) => {
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  console.log(`closes.length`, closes.length);

  if (closes.length < 50) {
    console.log("⚠️ Not enough data for UTBot signal");
    return "HOLD";
  }

  // UT Bot parameters
  const keyValue = 1; // Key Value (sensitivity)
  const atrPeriod = 10; // ATR Period

  // Calculate ATR
  const atr = technicalIndicators.ATR.calculate({
    high: highs,
    low: lows,
    close: closes,
    period: atrPeriod,
  });

  if (atr.length < 2) return "HOLD";

  // Calculate nLoss = keyValue * ATR
  const nLoss = keyValue * atr[atr.length - 1];
  const prevNLoss = keyValue * atr[atr.length - 2];

  // Get current and previous close prices
  const src = closes[closes.length - 1];
  const prevSrc = closes[closes.length - 2];

  // Initialize trailing stops (simplified implementation)
  let xATRTrailingStop = 0;
  let prevXATRTrailingStop = 0;

  // Calculate previous trailing stop
  if (closes.length >= 3) {
    const src2 = closes[closes.length - 3];
    if (prevSrc > prevXATRTrailingStop && src2 > prevXATRTrailingStop) {
      prevXATRTrailingStop = Math.max(prevXATRTrailingStop, prevSrc - prevNLoss);
    } else if (prevSrc < prevXATRTrailingStop && src2 < prevXATRTrailingStop) {
      prevXATRTrailingStop = Math.min(prevXATRTrailingStop, prevSrc + prevNLoss);
    } else if (prevSrc > prevXATRTrailingStop) {
      prevXATRTrailingStop = prevSrc - prevNLoss;
    } else {
      prevXATRTrailingStop = prevSrc + prevNLoss;
    }
  }

  // Calculate current trailing stop
  if (src > prevXATRTrailingStop && prevSrc > prevXATRTrailingStop) {
    xATRTrailingStop = Math.max(prevXATRTrailingStop, src - nLoss);
  } else if (src < prevXATRTrailingStop && prevSrc < prevXATRTrailingStop) {
    xATRTrailingStop = Math.min(prevXATRTrailingStop, src + nLoss);
  } else if (src > prevXATRTrailingStop) {
    xATRTrailingStop = src - nLoss;
  } else {
    xATRTrailingStop = src + nLoss;
  }

  // Calculate EMA(1) - which is essentially the close price
  const ema1 = src;
  const prevEma1 = prevSrc;

  // Check for crossovers
  const above = prevEma1 <= prevXATRTrailingStop && ema1 > xATRTrailingStop;
  const below = prevEma1 >= prevXATRTrailingStop && ema1 < xATRTrailingStop;

  // Generate signals
  const buy = src > xATRTrailingStop && above;
  const sell = src < xATRTrailingStop && below;

  console.log(`UT Bot Debug:`);
  console.log(`  Current Price: ${src.toFixed(4)}`);
  console.log(`  ATR Trailing Stop: ${xATRTrailingStop.toFixed(4)}`);
  console.log(`  Above: ${above}, Below: ${below}`);
  console.log(`  Buy: ${buy}, Sell: ${sell}`);

  if (buy) return "LONG";
  if (sell) return "SHORT";
  return "HOLD";
};

function calculateSTC(closePrices, fastLength = 27, length = 80) {
  if (closePrices.length < length + 20) {
    return null; // not enough data
  }

  // 1. Calculate MACD (fast - slow)
  const fastEma = EMA.calculate({ period: fastLength, values: closePrices });
  const slowEma = EMA.calculate({ period: length, values: closePrices });

  const macd = [];
  for (let i = 0; i < slowEma.length; i++) {
    macd.push(fastEma[i + (length - fastLength)] - slowEma[i]);
  }

  // 2. Calculate stochastic on MACD
  const stochasticInput = {
    high: macd, // we treat MACD as synthetic price
    low: macd,
    close: macd,
    period: 10,
    signalPeriod: 3,
  };
  const stoch = Stochastic.calculate(stochasticInput);

  // 3. Smooth the %K (STC Line)
  const stcLine = EMA.calculate({ period: 3, values: stoch.map((s) => s.k) });

  return stcLine;
}

function getSTCSignal(closePrices) {
  const stc = calculateSTC(closePrices);

  if (!stc) {
    console.log("⚠️ Not enough STC data");
    return "HOLD";
  }

  const prev = stc[stc.length - 2];
  const last = stc[stc.length - 1];

  console.log(`STC: Prev=${prev.toFixed(2)}, Last=${last.toFixed(2)}`);

  if (prev < 25 && last > 25 && last > prev) {
    return "LONG";
  } else if (prev > 75 && last < 75 && last < prev) {
    return "SHORT";
  } else {
    return "HOLD";
  }
}

function getAngleDegrees(y2, y1) {
  const rise = y2 - y1;
  const run = 1; // Assume run is 1 candle apart
  const radians = Math.atan(rise / run);
  return radians * (180 / Math.PI);
}

function getEMASignalWithAngle(candles) {
  if (candles.length < 20) return "HOLD";

  const closes = candles.map((c) => c.close);

  const ema9 = EMA.calculate({ period: 9, values: closes });
  const ema15 = EMA.calculate({ period: 15, values: closes });

  const offset = ema9.length - ema15.length;
  if (offset < 0 || ema15.length < 2) return "HOLD"; // Just in case

  const i = ema9.length - 2; // Second latest value in ema9
  const ema9Prev = ema9[i - 1];
  const ema9Curr = ema9[i];

  const angle = getAngleDegrees(ema9Curr, ema9Prev);

  const ema9Now = ema9[i];
  const ema15Now = ema15[i - offset]; // Adjusted index

  // Debug logs
  console.log(`EMA9: ${ema9Now} | EMA15: ${ema15Now} | Angle: ${angle}°`);

  if (ema9Now > ema15Now) return "LONG";
  if (ema9Now < ema15Now) return "SHORT";

  return "HOLD";
}

// Export the main function
module.exports = { decideTradeDirection };