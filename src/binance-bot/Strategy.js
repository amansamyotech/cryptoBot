const { RSI, ADX, EMA, MACD, ATR } = require("technicalindicators");
const { getCandles } = require("./getCandle");
const config = require("./config");

/**
 * Main trading function - pass symbol, get trade signal
 * @param {string} symbol - Trading pair (e.g., 'BTCUSDT')
 * @returns {Promise<string>} - Returns 'LONG', 'SHORT', or 'HOLD'
 */
async function getTradeSignal(symbol) {
  try {
    console.log(`\n🔍 Analyzing ${symbol}...`);

    // Fetch candles for different timeframes
    const candles5m = await getCandles(symbol, "5m", 500);

    if (!candles5m || candles5m.length < 200) {
      console.log("❌ Insufficient candle data");
      return "HOLD";
    }

    const closes = candles5m.map((c) => c.close);
    const highs = candles5m.map((c) => c.high);
    const lows = candles5m.map((c) => c.low);
    const volumes = candles5m.map((c) => c.volume);
    const currentPrice = closes[closes.length - 1];

    // ========== CALCULATE ALL INDICATORS ==========

    // 1. TEMA (Triple EMA) - Fast, Medium, Slow
    const temaFastPeriod = config.temaFast || 9;
    const temaMediumPeriod = config.temaMedium || 21;
    const temaSlowPeriod = config.temaSlow || 200;

    const temaFast = calculateTEMA(closes, temaFastPeriod);
    const temaMedium = calculateTEMA(closes, temaMediumPeriod);
    const temaSlow = calculateTEMA(closes, temaSlowPeriod);

    const temaFastCurr = temaFast[temaFast.length - 1];
    const temaMediumCurr = temaMedium[temaMedium.length - 1];
    const temaSlowCurr = temaSlow[temaSlow.length - 1];
    const temaFastPrev = temaFast[temaFast.length - 2];
    const temaMediumPrev = temaMedium[temaMedium.length - 2];

    // 2. MACD
    const macdResult = MACD.calculate({
      values: closes,
      fastPeriod: config.macdFast || 12,
      slowPeriod: config.macdSlow || 26,
      signalPeriod: config.macdSignal || 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });
    const macdCurr = macdResult[macdResult.length - 1];

    // 3. ATR (Average True Range)
    const atrResult = ATR.calculate({
      high: highs,
      low: lows,
      close: closes,
      period: config.atrPeriod || 14,
    });
    const atrCurr = atrResult[atrResult.length - 1];

    // 4. DMI/ADX (Directional Movement Index)
    const adxResult = ADX.calculate({
      high: highs,
      low: lows,
      close: closes,
      period: config.adxPeriod || 14,
    });
    const dmiCurr = adxResult[adxResult.length - 1];

    // 5. Volume Analysis
    const recentVolumes = volumes.slice(-20);
    const averageVolume =
      recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
    const currentVolume = volumes[volumes.length - 1];
    const volumeRatio = currentVolume / averageVolume;
    const volumeBullish = volumeRatio > (config.volumeMultiplier || 1.5);

    // 6. Support/Resistance (simplified - using recent highs/lows)
    const recentCandles = candles5m.slice(-50);
    const resistance = Math.max(...recentCandles.map((c) => c.high));
    const support = Math.min(...recentCandles.map((c) => c.low));

    // ========== STRATEGY ANALYSIS ==========

    // Market Side Analysis
    const marketSide = getMarketSide(
      temaFastCurr,
      temaMediumCurr,
      temaSlowCurr,
      currentPrice
    );

    // TEMA Crossover Analysis
    const temaCrossover = analyzeTEMACrossover(
      temaFastCurr,
      temaMediumCurr,
      temaFastPrev,
      temaMediumPrev
    );

    // Trend Direction & Alignment
    const isAboveTEMA200 = currentPrice > temaSlowCurr;
    const trendDirection = getTrendDirection(
      temaFastCurr,
      temaMediumCurr,
      temaSlowCurr,
      currentPrice
    );
    const trendAlignment = getTrendAlignment(
      temaFastCurr,
      temaMediumCurr,
      temaSlowCurr
    );

    // MACD Analysis
    const macdBullish = macdCurr && macdCurr.MACD > macdCurr.signal;
    const macdHistogram = macdCurr ? macdCurr.MACD - macdCurr.signal : 0;

    // DMI Analysis
    const dmiSignal = getDMISignal(dmiCurr);
    const adxStrength = getADXStrength(dmiCurr);
    const dmiBullish = dmiSignal === "BULLISH";
    const dmiBearish = dmiSignal === "BEARISH";
    const strongADX = dmiCurr && dmiCurr.adx > 20;

    // Trend Strength
    const trendStrength = adxStrength === "STRONG" ? "STRONG" : "WEAK";

    // Key Level Analysis
    const nearResistance = resistance && currentPrice >= resistance * 0.995;
    const nearSupport = support && currentPrice <= support * 1.005;

    // ========== ENTRY CONDITIONS ==========

    // LONG CONDITIONS (8 conditions)
    const longConditions = [
      temaCrossover === "BULLISH_CROSS" || temaCrossover === "BULLISH_STRONG",
      trendDirection === "BULLISH",
      trendAlignment === "BULLISH",
      macdBullish,
      trendStrength === "STRONG",
      volumeBullish,
      !nearResistance,
      dmiBullish && strongADX,
    ];

    // SHORT CONDITIONS (8 conditions)
    const shortConditions = [
      temaCrossover === "BEARISH_CROSS" || temaCrossover === "BEARISH_STRONG",
      trendDirection === "BEARISH",
      trendAlignment === "BEARISH",
      !macdBullish,
      trendStrength === "STRONG",
      volumeBullish,
      !nearSupport,
      dmiBearish && strongADX,
    ];

    const longScore = longConditions.filter(Boolean).length;
    const shortScore = shortConditions.filter(Boolean).length;

    const minScore = Math.max(config.minSignalScore || 5, 5); // At least 5/8

    // ========== GENERATE SIGNAL ==========

    console.log(`\n📊 ${symbol} Analysis:`);
    console.log(
      `   Price: ${currentPrice.toFixed(2)} | TEMA200: ${temaSlowCurr.toFixed(
        2
      )}`
    );
    console.log(`   Market Side: ${marketSide}`);
    console.log(`   TEMA Cross: ${temaCrossover}`);
    console.log(
      `   Trend: ${trendDirection} | Alignment: ${trendAlignment} | Strength: ${trendStrength}`
    );
    console.log(
      `   MACD: ${
        macdBullish ? "BULLISH" : "BEARISH"
      } | Histogram: ${macdHistogram.toFixed(4)}`
    );
    console.log(
      `   DMI: ${dmiSignal} | ADX: ${
        dmiCurr ? dmiCurr.adx.toFixed(1) : "N/A"
      } (${adxStrength})`
    );
    console.log(
      `   Volume: ${volumeRatio.toFixed(2)}x avg (${
        volumeBullish ? "HIGH" : "LOW"
      })`
    );
    console.log(
      `   📈 LONG Score: ${longScore}/8 | 📉 SHORT Score: ${shortScore}/8`
    );

    // Decision Logic
    if (longScore >= minScore && isAboveTEMA200) {
      console.log(`✅ SIGNAL: LONG (Score: ${longScore}/8)`);
      return "LONG";
    } else if (shortScore >= minScore && !isAboveTEMA200) {
      console.log(`✅ SIGNAL: SHORT (Score: ${shortScore}/8)`);
      return "SHORT";
    } else {
      console.log(`⏸️  SIGNAL: HOLD (Insufficient conditions)`);
      return "HOLD";
    }
  } catch (error) {
    console.error(`❌ Error analyzing ${symbol}:`, error.message);
    return "HOLD";
  }
}

// ========== HELPER FUNCTIONS ==========

function calculateTEMA(values, period) {
  const ema1 = EMA.calculate({ values, period });
  const ema2 = EMA.calculate({ values: ema1, period });
  const ema3 = EMA.calculate({ values: ema2, period });

  const tema = [];
  for (let i = 0; i < ema3.length; i++) {
    tema.push(
      3 * ema1[ema1.length - ema3.length + i] -
        3 * ema2[ema2.length - ema3.length + i] +
        ema3[i]
    );
  }
  return tema;
}

function analyzeTEMACrossover(fastCurr, mediumCurr, fastPrev, mediumPrev) {
  const bullishCross = fastPrev <= mediumPrev && fastCurr > mediumCurr;
  const bearishCross = fastPrev >= mediumPrev && fastCurr < mediumCurr;
  const strongBullish =
    fastCurr > mediumCurr && fastCurr - mediumCurr > fastPrev - mediumPrev;
  const strongBearish =
    fastCurr < mediumCurr && mediumCurr - fastCurr > mediumPrev - fastPrev;

  if (bullishCross) return "BULLISH_CROSS";
  if (bearishCross) return "BEARISH_CROSS";
  if (strongBullish) return "BULLISH_STRONG";
  if (strongBearish) return "BEARISH_STRONG";
  return "NEUTRAL";
}

function getTrendDirection(temaFast, temaMedium, temaSlow, currentPrice) {
  const aboveTema200 = currentPrice > temaSlow ? 1 : 0;
  const aboveTemaMedium = currentPrice > temaMedium ? 1 : 0;
  const aboveTemaFast = currentPrice > temaFast ? 1 : 0;

  const bullishScore = aboveTema200 + aboveTemaMedium + aboveTemaFast;

  return bullishScore >= 2 ? "BULLISH" : "BEARISH";
}

function getTrendAlignment(temaFast, temaMedium, temaSlow) {
  const fastAboveMedium = temaFast > temaMedium;
  const mediumAboveSlow = temaMedium > temaSlow;

  if (fastAboveMedium && mediumAboveSlow) return "BULLISH";
  if (!fastAboveMedium && !mediumAboveSlow) return "BEARISH";
  return "MIXED";
}

function getMarketSide(temaFast, temaMedium, temaSlow, currentPrice) {
  const aboveTema200 = currentPrice > temaSlow;
  const temaAlignment = getTrendAlignment(temaFast, temaMedium, temaSlow);
  const spreadFromTema200 = ((currentPrice - temaSlow) / temaSlow) * 100;

  if (aboveTema200 && temaAlignment === "BULLISH" && spreadFromTema200 > 0.5) {
    return "STRONG_BULLISH";
  } else if (aboveTema200 && spreadFromTema200 > 0.1) {
    return "BULLISH";
  } else if (
    !aboveTema200 &&
    temaAlignment === "BEARISH" &&
    spreadFromTema200 < -0.5
  ) {
    return "STRONG_BEARISH";
  } else if (!aboveTema200 && spreadFromTema200 < -0.1) {
    return "BEARISH";
  }
  return "NEUTRAL";
}

function getDMISignal(dmi) {
  if (!dmi) return "NEUTRAL";

  if (dmi.pdi > dmi.mdi && dmi.adx > 20) return "BULLISH";
  if (dmi.mdi > dmi.pdi && dmi.adx > 20) return "BEARISH";
  return "NEUTRAL";
}

function getADXStrength(dmi) {
  if (!dmi) return "WEAK";

  if (dmi.adx > 25) return "STRONG";
  if (dmi.adx > 20) return "MODERATE";
  return "WEAK";
}

// ========== EXPORT ==========

module.exports = {
  getTradeSignal,
};
