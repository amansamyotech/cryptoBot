// strategy.js - COMPLETE STRATEGY WITH DUAL TIMEFRAME TEMA FILTER
const Indicators = require("./indicators");
const config = require("./config");
const indicators = new Indicators();

class Strategy {
  analyze(indicatorsData, currentPrice, existingPosition = null) {
    try {
      if (!indicatorsData) {
        return { error: "No indicators data" };
      }

      const temaFast = indicatorsData.tema.fast;
      const temaMedium = indicatorsData.tema.medium;
      const temaSlow = indicatorsData.tema.slow;
      const dmi = indicatorsData.dmi;

      // ✅ NEW: 15m TEMA 100
      const tema100_15m = indicatorsData.tema100_15m;

      const getLast = (arr) =>
        arr && arr.length > 0 ? arr[arr.length - 1] : null;

      const temaFastCurr = getLast(temaFast);
      const temaMediumCurr = getLast(temaMedium);
      const temaSlowCurr = getLast(temaSlow);
      const tema100_15mCurr = getLast(tema100_15m);

      if (!temaFastCurr || !temaMediumCurr || !temaSlowCurr) {
        return { error: "Incomplete TEMA data (5m)" };
      }

      // ✅ If TEMA 100 (15m) failed, skip analysis
      if (!tema100_15mCurr || isNaN(tema100_15mCurr)) {
        return { error: "TEMA 100 (15m) calculation failed" };
      }

      const marketSide = this.getMarketSide(
        temaFastCurr,
        temaMediumCurr,
        temaSlowCurr,
        currentPrice
      );

      const temaFastPrev =
        temaFast.length > 4 ? temaFast[temaFast.length - 2] : temaFastCurr;
      const temaMediumPrev =
        temaMedium.length > 4
          ? temaMedium[temaMedium.length - 2]
          : temaMediumCurr;

      const macdCurr = getLast(indicatorsData.macd);
      const atrCurr = getLast(indicatorsData.atr);
      const volumeProfile = indicatorsData.volumeProfile;

      const resistance = getLast(indicatorsData.levels.resistance);
      const support = getLast(indicatorsData.levels.support);

      const temaCrossover = indicators.analyzeTEMACrossover(
        temaFastCurr,
        temaMediumCurr,
        temaFastPrev,
        temaMediumPrev
      );

      // ✅ DUAL TIMEFRAME TEMA FILTER
      const isAboveTEMA200_5m = currentPrice > temaSlowCurr; // 5m TEMA 200
      const isAboveTEMA100_15m = currentPrice > tema100_15mCurr; // 15m TEMA 100

      // ✅ Combined filter logic
      const canLong = isAboveTEMA200_5m && isAboveTEMA100_15m; // BOTH must be above
      const canShort = !isAboveTEMA200_5m && !isAboveTEMA100_15m; // BOTH must be below

      const trendFilter = canLong
        ? "LONG_ONLY"
        : canShort
        ? "SHORT_ONLY"
        : "NO_TRADE";

      const trendDirection = this.get5mTrendDirection(
        temaFastCurr,
        temaMediumCurr,
        temaSlowCurr,
        currentPrice
      );
      const trendAlignment = this.get5mTrendAlignment(
        temaFastCurr,
        temaMediumCurr,
        temaSlowCurr
      );

      const macdBullish = macdCurr && macdCurr.MACD > macdCurr.signal;
      const macdHistogram = macdCurr ? macdCurr.MACD - macdCurr.signal : 0;

      // ✅ Use DMI for trend strength
      const trendStrength = dmi.adxStrength === "STRONG" ? "STRONG" : "WEAK";

      const volumeBullish = volumeProfile.volumeRatio > config.volumeMultiplier;

      const nearResistance = resistance && currentPrice >= resistance * 0.995;
      const nearSupport = support && currentPrice <= support * 1.005;

      // ✅ DMI Conditions
      const dmiBullish = dmi.dmiSignal === "BULLISH";
      const dmiBearish = dmi.dmiSignal === "BEARISH";
      const strongADX = dmi.latest && dmi.latest.adx > 20;

      // ✅ SL/TP Logic
      const atrMultiplier = 2.5;
      let stopLossDistance, takeProfitDistance;
      let longStop, longTakeProfit, shortStop, shortTakeProfit;

      // ✅ CRITICAL: If position exists, use existing SL/TP
      if (!existingPosition) {
        stopLossDistance = atrCurr
          ? atrCurr * atrMultiplier
          : currentPrice * 0.03;
        takeProfitDistance = stopLossDistance * config.riskRewardRatio;

        longStop = currentPrice - stopLossDistance;
        longTakeProfit = currentPrice + takeProfitDistance;
        shortStop = currentPrice + stopLossDistance;
        shortTakeProfit = currentPrice - takeProfitDistance;

        console.log(`   💡 Calculated new SL/TP`);
      } else {
        stopLossDistance = null;
        takeProfitDistance = null;
        longStop = existingPosition.stopLoss;
        longTakeProfit = existingPosition.takeProfit;
        shortStop = existingPosition.stopLoss;
        shortTakeProfit = existingPosition.takeProfit;

        console.log(`   🔒 Using existing position's SL/TP`);
      }

      // ✅ 8 CONDITIONS (7 original + DMI)
      const longConditions = [
        temaCrossover === "BULLISH_CROSS" || temaCrossover === "BULLISH_STRONG", // 1. TEMA Crossover
        trendDirection === "BULLISH", // 2. Trend Direction
        trendAlignment === "BULLISH", // 3. TEMA Alignment
        macdBullish, // 4. MACD Momentum
        trendStrength === "STRONG", // 5. Trend Strength (ADX)
        volumeBullish, // 6. Volume Confirmation
        !nearResistance, // 7. Key Level Clear
        dmiBullish && strongADX, // 8. DMI Bullish + Strong ADX
      ];

      const shortConditions = [
        temaCrossover === "BEARISH_CROSS" || temaCrossover === "BEARISH_STRONG", // 1. TEMA Crossover
        trendDirection === "BEARISH", // 2. Trend Direction
        trendAlignment === "BEARISH", // 3. TEMA Alignment
        !macdBullish, // 4. MACD Momentum
        trendStrength === "STRONG", // 5. Trend Strength (ADX)
        volumeBullish, // 6. Volume Confirmation
        !nearSupport, // 7. Key Level Clear
        dmiBearish && strongADX, // 8. DMI Bearish + Strong ADX
      ];

      const longScore = longConditions.filter(Boolean).length;
      const shortScore = shortConditions.filter(Boolean).length;

      // ✅ Adjusted min score for 8 conditions
      const adjustedMinScore =
        config.minSignalScore === 5 ? 6 : config.minSignalScore;

      // ✅ CRITICAL: BLOCK entries if position already exists
      const canEnter = !existingPosition;

      if (existingPosition) {
        console.log(
          `   🔒 STRATEGY: Entry blocked - ${existingPosition.side.toUpperCase()} position exists`
        );
      }

      // ✅ Entry signals (with DUAL TIMEFRAME TEMA filter)
      const longEntry = canEnter && longScore >= adjustedMinScore && canLong;
      const shortEntry = canEnter && shortScore >= adjustedMinScore && canShort;

      // ✅ Enhanced logging for filter status
      if (!canLong && !canShort) {
        console.log(`   ⚠️ TEMA FILTER: NO TRADE ZONE`);
        console.log(
          `      5m TEMA200: ${
            isAboveTEMA200_5m ? "✅ Above" : "❌ Below"
          } | 15m TEMA100: ${isAboveTEMA100_15m ? "✅ Above" : "❌ Below"}`
        );
      }

      return {
        // Entry signals
        longEntry,
        shortEntry,
        longScore,
        shortScore,
        totalConditions: 8,
        minScoreRequired: adjustedMinScore,

        // TEMA analysis
        temaCrossover,
        trendDirection,
        trendAlignment,
        trendStrength,
        volumeConfirmation: volumeBullish,
        nearKeyLevel: nearResistance || nearSupport,
        trendFilter: trendFilter,

        // ✅ NEW: Dual timeframe TEMA values
        tema200_5m: temaSlowCurr,
        tema100_15m: tema100_15mCurr,
        isAboveTEMA200_5m,
        isAboveTEMA100_15m,
        distanceFromTEMA200_5m: (
          ((currentPrice - temaSlowCurr) / temaSlowCurr) *
          100
        ).toFixed(2),
        distanceFromTEMA100_15m: (
          ((currentPrice - tema100_15mCurr) / tema100_15mCurr) *
          100
        ).toFixed(2),

        // SL/TP
        stopLossDistance,
        takeProfitDistance,
        longStop,
        longTakeProfit,
        shortStop,
        shortTakeProfit,

        // Market context
        marketSide,

        // DMI values
        dmiAdx: dmi.latest ? dmi.latest.adx : 0,
        dmiPdi: dmi.latest ? dmi.latest.pdi : 0,
        dmiMdi: dmi.latest ? dmi.latest.mdi : 0,
        dmiSignal: dmi.dmiSignal,
        dmiStrength: dmi.adxStrength,
        dmiConditionMet: {
          long: dmiBullish && strongADX,
          short: dmiBearish && strongADX,
        },

        // Indicator values
        temaFast: temaFastCurr,
        temaMedium: temaMediumCurr,
        temaSlow: temaSlowCurr,
        macdHistogram,
        macdLine: macdCurr ? macdCurr.MACD : 0,
        macdSignal: macdCurr ? macdCurr.signal : 0,
        atr: atrCurr ? [atrCurr] : [0.01],
        volumeRatio: volumeProfile.volumeRatio,
        currentVolume: volumeProfile.currentVolume,
        averageVolume: volumeProfile.averageVolume,
        resistance,
        support,

        error: null,
      };
    } catch (error) {
      console.error("❌ Strategy analysis error:", error.message);
      return { error: "Analysis failed: " + error.message };
    }
  }

  // ✅ Trend Direction (3-level check)
  get5mTrendDirection(temaFast, temaMedium, temaSlow, currentPrice) {
    const aboveTema200 = currentPrice > temaSlow ? 1 : 0;
    const aboveTemaMedium = currentPrice > temaMedium ? 1 : 0;
    const aboveTemaFast = currentPrice > temaFast ? 1 : 0;

    const bullishScore = aboveTema200 + aboveTemaMedium + aboveTemaFast;

    return bullishScore >= 2 ? "BULLISH" : "BEARISH";
  }

  // ✅ TEMA Alignment (Fast > Medium > Slow)
  get5mTrendAlignment(temaFast, temaMedium, temaSlow) {
    const fastAboveMedium = temaFast > temaMedium;
    const mediumAboveSlow = temaMedium > temaSlow;

    if (fastAboveMedium && mediumAboveSlow) return "BULLISH";
    if (!fastAboveMedium && !mediumAboveSlow) return "BEARISH";
    return "MIXED";
  }

  // ✅ Market Side Analysis
  getMarketSide(temaFast, temaMedium, temaSlow, currentPrice) {
    const aboveTema200 = currentPrice > temaSlow;
    const temaAlignment = this.get5mTrendAlignment(
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
}

module.exports = Strategy;
