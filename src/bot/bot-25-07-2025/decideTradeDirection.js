const { EMA, Stochastic } = require("technicalindicators");
const technicalIndicators = require("technicalindicators");
const Binance = require("node-binance-api");


const binance = new Binance().options({
  APIKEY: "whfiekZqKdkwa9fEeUupVdLZTNxBqP1OCEuH2pjyImaWt51FdpouPPrCawxbsupK",
  APISECRET: "E4IcteWOQ6r9qKrBZJoBy4R47nNPBDepVXMnS3Lf2Bz76dlu0QZCNh82beG2rHq4",
  useServerTime: true,
  test: false, // Set to true for testnet
});

const interval = "3m";
// You need to provide this function - checks if market is sideways
async function isSideways(symbol) {
  try {
    const candles = await getCandles(symbol, interval, 50);
    const closes = candles.map((c) => c.close);
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);

    // Method 1: Price Range Analysis
    const highest = Math.max(...highs);
    const lowest = Math.min(...lows);
    const priceRange = ((highest - lowest) / lowest) * 100;

    // Method 2: Moving Average Convergence
    const ema20 = EMA.calculate({ period: 20, values: closes });
    const ema50 = EMA.calculate({ period: 50, values: closes });

    if (ema20.length < 10 || ema50.length < 10) {
      return false; // Not enough data
    }

    // Check if EMAs are converging (sideways indication)
    const recentEma20 = ema20.slice(-10);
    const recentEma50 = ema50.slice(-10);

    let convergenceCount = 0;
    for (let i = 0; i < recentEma20.length; i++) {
      const diff =
        Math.abs((recentEma20[i] - recentEma50[i]) / recentEma50[i]) * 100;
      if (diff < 1.5) convergenceCount++; // EMAs within 1.5% of each other
    }

    const convergenceRatio = convergenceCount / recentEma20.length;

    // Method 3: Volatility Check (using ATR)
    const atr = technicalIndicators.ATR.calculate({
      high: highs,
      low: lows,
      close: closes,
      period: 14,
    });

    if (atr.length < 5) return false;

    const recentATR = atr.slice(-5);
    const avgATR =
      recentATR.reduce((sum, val) => sum + val, 0) / recentATR.length;
    const currentPrice = closes[closes.length - 1];
    const atrPercentage = (avgATR / currentPrice) * 100;

    // Method 4: Price Oscillation Pattern
    let oscillationCount = 0;
    const recentCloses = closes.slice(-20);
    for (let i = 1; i < recentCloses.length - 1; i++) {
      const prev = recentCloses[i - 1];
      const curr = recentCloses[i];
      const next = recentCloses[i + 1];

      // Check for oscillation pattern (up-down or down-up)
      if ((curr > prev && curr > next) || (curr < prev && curr < next)) {
        oscillationCount++;
      }
    }
    const oscillationRatio = oscillationCount / (recentCloses.length - 2);

    // Combine all methods for sideways detection
    const isSidewaysConditions = [
      priceRange < 3, // Price range less than 3%
      convergenceRatio > 0.6, // EMAs converging 60% of the time
      atrPercentage < 2, // Low volatility (ATR < 2% of price)
      oscillationRatio > 0.3, // High oscillation pattern
    ];

    const sidewaysScore = isSidewaysConditions.filter(Boolean).length;
    const isSidewaysMarket = sidewaysScore >= 3; // At least 3 out of 4 conditions

    console.log(`📊 Sideways Analysis for ${symbol}:`);
    console.log(`   Price Range: ${priceRange}% (< 3% = sideways)`);
    console.log(
      `   EMA Convergence: ${(convergenceRatio * 100)}% (> 60% = sideways)`
    );
    console.log(
      `   ATR Volatility: ${atrPercentage}% (< 2% = sideways)`
    );
    console.log(
      `   Oscillation: ${(oscillationRatio * 100)}% (> 30% = sideways)`
    );
    console.log(`   Sideways Score: ${sidewaysScore}/4 (≥3 = sideways)`);

    return isSidewaysMarket;
  } catch (error) {
    console.error(
      `❌ Error in sideways detection for ${symbol}:`,
      error.message
    );
    return false; // Default to not sideways if error occurs
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
  const candles = await getCandles(symbol, interval, 100);

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

const getUTBotSignal = async (candles) => {
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  if (closes.length < 300) {
    console.log("⚠️ Not enough data for UTBot signal");
    return "HOLD";
  }

  // ATR for SHORT signal (period = 1)
  const atrShort = technicalIndicators.ATR.calculate({
    high: highs,
    low: lows,
    close: closes,
    period: 1,
  });
  const emaShort = technicalIndicators.EMA.calculate({
    period: 1,
    values: closes,
  });
  const lastATRShort = atrShort[atrShort.length - 1];
  const lastEMAShort = emaShort[emaShort.length - 1];
  const stopLineShort = lastEMAShort - 2 * lastATRShort;

  // ATR for LONG signal (period = 300)
  const atrLong = technicalIndicators.ATR.calculate({
    high: highs,
    low: lows,
    close: closes,
    period: 300,
  });
  const emaLong = technicalIndicators.EMA.calculate({
    period: 1,
    values: closes,
  });
  const lastATRLong = atrLong[atrLong.length - 1];
  const lastEMALong = emaLong[emaLong.length - 1];
  const stopLineLong = lastEMALong + 2 * lastATRLong;

  const prevClose = closes[closes.length - 2];
  const currentClose = closes[closes.length - 1];

  const isLong = prevClose <= stopLineLong && currentClose > stopLineLong;
  const isShort = prevClose >= stopLineShort && currentClose < stopLineShort;

  if (isLong) return "LONG";
  if (isShort) return "SHORT";
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

  if (!stc || stc.length < 2) {
    return "HOLD"; // Changed from "NO SIGNAL" to "HOLD"
  }

  const prev = stc[stc.length - 2];
  const last = stc[stc.length - 1];

  // Entry signals
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
  if (candles.length < 20) return "HOLD"; // Ensure enough data

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
  console.log(
    `EMA9: ${ema9Now} | EMA15: ${ema15Now} | Angle: ${angle}°`
  );

  if (ema9Now > ema15Now && angle >= 30) return "LONG";
  if (ema9Now < ema15Now && angle <= -30) return "SHORT";

  return "HOLD";
}


// Export the main function
module.exports = { decideTradeDirection };
