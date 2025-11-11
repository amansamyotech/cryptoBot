// tradeDecision.js - SIMPLE TRADE DECISION MAKER
const { RSI, ADX, EMA, MACD } = require("technicalindicators");
const { getCandles } = require("./getCandle");
const config = require("./config");

class TradeDecision {
  constructor() {
    this.indicators = { RSI, ADX, EMA, MACD };
  }

  async getTradeSignal(symbol) {
    try {
      console.log(`\n🔍 ANALYZING ${symbol} FOR TRADE SIGNAL...`);

      // Fetch candles
      const candles = await getCandles(
        symbol,
        config.timeframe,
        config.candleFetchLimit
      );

      if (!candles || candles.length < config.minCandlesRequired) {
        console.log(`⏳ Not enough data for ${symbol}`);
        return "HOLD";
      }

      // Extract price data
      const closes = candles.map((c) => c.close);
      const highs = candles.map((c) => c.high);
      const lows = candles.map((c) => c.low);
      const currentPrice = closes[closes.length - 1];

      // Calculate indicators
      const temaFast = this.calculateEMA(closes, config.tema.fast);
      const temaMedium = this.calculateEMA(closes, config.tema.medium);
      const temaSlow = this.calculateEMA(closes, config.tema.slow);

      const temaFastCurr = temaFast[temaFast.length - 1];
      const temaMediumCurr = temaMedium[temaMedium.length - 1];
      const temaSlowCurr = temaSlow[temaSlow.length - 1];

      // TEMA Crossover Analysis
      const temaCrossover = this.analyzeTEMACrossover(temaFast, temaMedium);

      // Market Side Analysis
      const marketSide = this.getMarketSide(
        temaFastCurr,
        temaMediumCurr,
        temaSlowCurr,
        currentPrice
      );
      const trendFilter =
        currentPrice > temaSlowCurr ? "LONG_ONLY" : "SHORT_ONLY";

      // MACD Analysis
      const macd = this.calculateMACD(closes);
      const macdHistogram = macd ? macd.MACD - macd.signal : 0;

      // ADX Analysis
      const adx = this.calculateADX(highs, lows, closes);
      const trendStrength =
        adx && adx.adx > config.adxThreshold ? "STRONG" : "WEAK";

      // Volume Analysis
      const volumeProfile = this.calculateVolumeProfile(candles);
      const volumeBullish = volumeProfile.volumeRatio > config.volumeMultiplier;

      // Support Resistance
      const supportResistance = this.calculateSupportResistance(candles);
      const nearResistance =
        supportResistance.resistance &&
        currentPrice >= supportResistance.resistance * 0.995;
      const nearSupport =
        supportResistance.support &&
        currentPrice <= supportResistance.support * 1.005;

      // ✅ SAME LOGIC AS YOUR MAIN BOT
      const longConditions = [
        temaCrossover === "BULLISH_CROSS" || temaCrossover === "BULLISH_STRONG",
        this.getTrendDirection(
          temaFastCurr,
          temaMediumCurr,
          temaSlowCurr,
          currentPrice
        ) === "BULLISH",
        this.getTrendAlignment(temaFastCurr, temaMediumCurr, temaSlowCurr) ===
          "BULLISH",
        macdHistogram > 0,
        trendStrength === "STRONG",
        volumeBullish,
        !nearResistance,
      ];

      const shortConditions = [
        temaCrossover === "BEARISH_CROSS" || temaCrossover === "BEARISH_STRONG",
        this.getTrendDirection(
          temaFastCurr,
          temaMediumCurr,
          temaSlowCurr,
          currentPrice
        ) === "BEARISH",
        this.getTrendAlignment(temaFastCurr, temaMediumCurr, temaSlowCurr) ===
          "BEARISH",
        macdHistogram < 0,
        trendStrength === "STRONG",
        volumeBullish,
        !nearSupport,
      ];

      const longScore = longConditions.filter(Boolean).length;
      const shortScore = shortConditions.filter(Boolean).length;

      console.log(`📊 ${symbol} ANALYSIS RESULTS:`);
      console.log(`   Market: ${marketSide} | Trend Filter: ${trendFilter}`);
      console.log(
        `   TEMA Cross: ${temaCrossover} | MACD: ${
          macdHistogram > 0 ? "BULLISH" : "BEARISH"
        }`
      );
      console.log(
        `   ADX: ${adx ? adx.adx.toFixed(1) : "N/A"} | Volume: ${
          volumeBullish ? "GOOD" : "LOW"
        }`
      );
      console.log(
        `   LONG Score: ${longScore}/${config.minSignalScore} | SHORT Score: ${shortScore}/${config.minSignalScore}`
      );

      // Final Decision
      if (trendFilter === "LONG_ONLY" && longScore >= config.minSignalScore) {
        console.log(`🎯 SIGNAL: LONG ✅`);
        return "LONG";
      } else if (
        trendFilter === "SHORT_ONLY" &&
        shortScore >= config.minSignalScore
      ) {
        console.log(`🎯 SIGNAL: SHORT ✅`);
        return "SHORT";
      } else {
        console.log(`🎯 SIGNAL: HOLD ⏸️`);
        return "HOLD";
      }
    } catch (error) {
      console.error(`❌ Error analyzing ${symbol}:, error.message`);
      return "HOLD";
    }
  }

  // ✅ SAME LOGIC AS YOUR STRATEGY.JS
  calculateEMA(values, period) {
    try {
      if (values.length < period) return [values[values.length - 1]];
      return this.indicators.EMA.calculate({ period, values });
    } catch (error) {
      // Fallback calculation
      const result = [];
      const multiplier = 2 / (period + 1);
      let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;

      for (let i = period; i < values.length; i++) {
        ema = (values[i] - ema) * multiplier + ema;
        result.push(ema);
      }
      return result.length > 0 ? result : [values[values.length - 1]];
    }
  }

  calculateMACD(closes) {
    try {
      const macd = this.indicators.MACD.calculate({
        values: closes,
        fastPeriod: config.macd.fast,
        slowPeriod: config.macd.slow,
        signalPeriod: config.macd.signal,
        SimpleMAOscillator: false,
        SimpleMASignal: false,
      });
      return macd[macd.length - 1];
    } catch (error) {
      return { MACD: 0, signal: 0, histogram: 0 };
    }
  }

  calculateADX(highs, lows, closes) {
    try {
      const adx = this.indicators.ADX.calculate({
        period: config.adx,
        high: highs,
        low: lows,
        close: closes,
      });
      return adx[adx.length - 1];
    } catch (error) {
      return { adx: 15, pdi: 20, mdi: 15 };
    }
  }

  calculateVolumeProfile(candles, period = 20) {
    try {
      const volumes = candles.map((c) => c.volume);
      const currentVolume = volumes[volumes.length - 1];
      const recentVolumes = volumes.slice(-period);
      const averageVolume =
        recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;

      return {
        currentVolume,
        averageVolume,
        volumeRatio: currentVolume / averageVolume,
        isVolumeSpike: currentVolume > averageVolume * config.volumeMultiplier,
      };
    } catch (error) {
      return {
        currentVolume: 1000000,
        averageVolume: 1000000,
        volumeRatio: 1.0,
        isVolumeSpike: false,
      };
    }
  }

  calculateSupportResistance(candles, period = config.supportResistancePeriod) {
    try {
      const highs = candles.map((c) => c.high);
      const lows = candles.map((c) => c.low);

      const recentHighs = highs.slice(-period);
      const recentLows = lows.slice(-period);

      return {
        resistance: Math.max(...recentHighs),
        support: Math.min(...recentLows),
      };
    } catch (error) {
      const lastPrice = candles[candles.length - 1].close;
      return {
        resistance: lastPrice * 1.02,
        support: lastPrice * 0.98,
      };
    }
  }

  analyzeTEMACrossover(temaFast, temaMedium) {
    if (temaFast.length < 2 || temaMedium.length < 2) {
      return temaFast[temaFast.length - 1] > temaMedium[temaMedium.length - 1]
        ? "BULLISH_ABOVE"
        : "BEARISH_BELOW";
    }

    const temaFastCurr = temaFast[temaFast.length - 1];
    const temaMediumCurr = temaMedium[temaMedium.length - 1];
    const temaFastPrev = temaFast[temaFast.length - 2];
    const temaMediumPrev = temaMedium[temaMedium.length - 2];

    if (temaFastCurr > temaMediumCurr && temaFastPrev <= temaMediumPrev) {
      return "BULLISH_CROSS";
    }

    if (temaFastCurr < temaMediumCurr && temaFastPrev >= temaMediumPrev) {
      return "BEARISH_CROSS";
    }

    const spread = ((temaFastCurr - temaMediumCurr) / temaMediumCurr) * 100;
    if (temaFastCurr > temaMediumCurr && spread > 0.05) {
      return "BULLISH_STRONG";
    }

    if (temaFastCurr < temaMediumCurr && spread < -0.05) {
      return "BEARISH_STRONG";
    }

    return temaFastCurr > temaMediumCurr ? "BULLISH_ABOVE" : "BEARISH_BELOW";
  }

  getMarketSide(temaFast, temaMedium, temaSlow, currentPrice) {
    const aboveTema200 = currentPrice > temaSlow;
    const temaAlignment = this.getTrendAlignment(
      temaFast,
      temaMedium,
      temaSlow
    );
    const spreadFromTema200 = ((currentPrice - temaSlow) / temaSlow) * 100;

    if (
      aboveTema200 &&
      temaAlignment === "BULLISH" &&
      spreadFromTema200 > 0.5
    ) {
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
    } else {
      return "NEUTRAL";
    }
  }

  getTrendDirection(temaFast, temaMedium, temaSlow, currentPrice) {
    const aboveTema200 = currentPrice > temaSlow ? 1 : 0;
    const aboveTemaMedium = currentPrice > temaMedium ? 1 : 0;
    const aboveTemaFast = currentPrice > temaFast ? 1 : 0;

    const bullishScore = aboveTema200 + aboveTemaMedium + aboveTemaFast;

    if (bullishScore >= 2) return "BULLISH";
    return "BEARISH";
  }

  getTrendAlignment(temaFast, temaMedium, temaSlow) {
    const fastAboveMedium = temaFast > temaMedium;
    const mediumAboveSlow = temaMedium > temaSlow;

    if (fastAboveMedium && mediumAboveSlow) return "BULLISH";
    if (!fastAboveMedium && !mediumAboveSlow) return "BEARISH";
    return "MIXED";
  }
}

// Export singleton instance
module.exports = new TradeDecision();
