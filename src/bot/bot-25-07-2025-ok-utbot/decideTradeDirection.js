const technicalIndicators = require("technicalindicators");
const Binance = require("node-binance-api");

const binance = new Binance().options({
  APIKEY: "whfiekZqKdkwa9fEeUupVdLZTNxBqP1OCEuH2pjyImaWt51FdpouPPrCawxbsupK",
  APISECRET: "E4IcteWOQ6r9qKrBZJoBy4R47nNPBDepVXMnS3Lf2Bz76dlu0QZCNh82beG2rHq4",
  useServerTime: true,
  test: false,
});

// Main function - the ONLY function you need to call
async function decideTradeDirection(symbol) {
  try {
    console.log(`🤖 Analyzing ${symbol}...`);

    // Get candle data
    const candles = await binance.futuresCandles(symbol, "3m", { limit: 500 });
    const candleData = candles.map((c) => ({
      open: parseFloat(c.open),
      high: parseFloat(c.high),
      low: parseFloat(c.low),
      close: parseFloat(c.close),
      volume: parseFloat(c.volume),
    }));

    if (candleData.length < 100) {
      console.log("❌ Insufficient data");
      return "HOLD";
    }

    const closes = candleData.map((c) => c.close);
    const highs = candleData.map((c) => c.high);
    const lows = candleData.map((c) => c.low);
    const volumes = candleData.map((c) => c.volume);

    let longScore = 0;
    let shortScore = 0;

    // 1. UT Bot Analysis (Weight: 3)
    try {
      const priceUp = closes[closes.length - 1] > closes[closes.length - 2];
      const atrPeriod = priceUp ? 21 : 7;

      const atr = technicalIndicators.ATR.calculate({
        high: highs.slice(-100),
        low: lows.slice(-100),
        close: closes.slice(-100),
        period: atrPeriod,
      });

      if (atr.length >= 3) {
        const currentClose = closes[closes.length - 1];
        const prevClose = closes[closes.length - 2];
        const currentATR = atr[atr.length - 1];
        const prevATR = atr[atr.length - 2];

        const nLoss = 1 * currentATR;
        const prevNLoss = 1 * prevATR;

        const trailingStop =
          currentClose > prevClose
            ? currentClose - nLoss
            : currentClose + nLoss;
        const prevTrailingStop =
          prevClose > closes[closes.length - 3]
            ? prevClose - prevNLoss
            : prevClose + prevNLoss;

        const longSignal =
          prevClose <= prevTrailingStop && currentClose > trailingStop;
        const shortSignal =
          prevClose >= prevTrailingStop && currentClose < trailingStop;

        if (longSignal) longScore += 9;
        if (shortSignal) shortScore += 9;

        console.log(
          `UT Bot: ${longSignal ? "LONG" : shortSignal ? "SHORT" : "HOLD"}`
        );
      }
    } catch (e) {
      console.log("UT Bot error:", e.message);
    }

    // 2. RSI Analysis (Weight: 2)
    try {
      const rsi = technicalIndicators.RSI.calculate({
        values: closes,
        period: 14,
      });

      if (rsi.length >= 2) {
        const currentRSI = rsi[rsi.length - 1];
        const prevRSI = rsi[rsi.length - 2];
        const rsiTrend = currentRSI > prevRSI;

        if (currentRSI < 25 && rsiTrend) longScore += 6;
        else if (currentRSI < 30 && rsiTrend) longScore += 4;
        else if (currentRSI > 75 && !rsiTrend) shortScore += 6;
        else if (currentRSI > 70 && !rsiTrend) shortScore += 4;

        console.log(
          `RSI: ${currentRSI.toFixed(2)} - ${
            currentRSI < 30 && rsiTrend
              ? "LONG"
              : currentRSI > 70 && !rsiTrend
              ? "SHORT"
              : "HOLD"
          }`
        );
      }
    } catch (e) {
      console.log("RSI error:", e.message);
    }

    // 3. MACD Analysis (Weight: 2)
    try {
      const macd = technicalIndicators.MACD.calculate({
        values: closes,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false,
      });

      if (macd.length >= 2) {
        const current = macd[macd.length - 1];
        const previous = macd[macd.length - 2];

        // MACD crossovers
        if (
          previous.MACD <= previous.signal &&
          current.MACD > current.signal &&
          current.MACD < 0
        ) {
          longScore += 4;
        }
        if (
          previous.MACD >= previous.signal &&
          current.MACD < current.signal &&
          current.MACD > 0
        ) {
          shortScore += 4;
        }

        // Histogram momentum
        if (current.histogram > previous.histogram && current.histogram > 0)
          longScore += 2;
        if (current.histogram < previous.histogram && current.histogram < 0)
          shortScore += 2;

        console.log(
          `MACD: ${current.MACD > current.signal ? "BULLISH" : "BEARISH"}`
        );
      }
    } catch (e) {
      console.log("MACD error:", e.message);
    }

    // 4. EMA Crossover (Weight: 2)
    try {
      const emaFast = technicalIndicators.EMA.calculate({
        values: closes,
        period: 9,
      });
      const emaSlow = technicalIndicators.EMA.calculate({
        values: closes,
        period: 21,
      });

      if (emaFast.length >= 2 && emaSlow.length >= 2) {
        const currentFast = emaFast[emaFast.length - 1];
        const currentSlow = emaSlow[emaSlow.length - 1];
        const prevFast = emaFast[emaFast.length - 2];
        const prevSlow = emaSlow[emaSlow.length - 2];

        // Golden/Death cross
        if (prevFast <= prevSlow && currentFast > currentSlow) longScore += 4;
        if (prevFast >= prevSlow && currentFast < currentSlow) shortScore += 4;

        // Trend confirmation
        if (currentFast > currentSlow && currentFast > prevFast) longScore += 2;
        if (currentFast < currentSlow && currentFast < prevFast)
          shortScore += 2;

        console.log(
          `EMA: ${currentFast > currentSlow ? "BULLISH" : "BEARISH"} trend`
        );
      }
    } catch (e) {
      console.log("EMA error:", e.message);
    }

    // 5. Bollinger Bands (Weight: 1.5)
    try {
      const bb = technicalIndicators.BollingerBands.calculate({
        values: closes,
        period: 20,
        stdDev: 2,
      });

      if (bb.length >= 2) {
        const current = bb[bb.length - 1];
        const currentClose = closes[closes.length - 1];
        const prevClose = closes[closes.length - 2];
        const position =
          (currentClose - current.lower) / (current.upper - current.lower);

        // Bounce off bands
        if (
          prevClose <= bb[bb.length - 2].lower &&
          currentClose > current.lower &&
          position < 0.2
        ) {
          longScore += 3;
        }
        if (
          prevClose >= bb[bb.length - 2].upper &&
          currentClose < current.upper &&
          position > 0.8
        ) {
          shortScore += 3;
        }

        console.log(`Bollinger: Position ${(position * 100).toFixed(1)}%`);
      }
    } catch (e) {
      console.log("Bollinger error:", e.message);
    }

    // 6. Stochastic (Weight: 1.5)
    try {
      const stoch = technicalIndicators.Stochastic.calculate({
        high: highs,
        low: lows,
        close: closes,
        kPeriod: 14,
        dPeriod: 3,
      });

      if (stoch.length >= 2) {
        const current = stoch[stoch.length - 1];
        const previous = stoch[stoch.length - 2];

        // Oversold/Overbought with crossover
        if (
          current.k < 20 &&
          previous.k <= previous.d &&
          current.k > current.d
        ) {
          longScore += 3;
        }
        if (
          current.k > 80 &&
          previous.k >= previous.d &&
          current.k < current.d
        ) {
          shortScore += 3;
        }

        console.log(
          `Stochastic: K=${current.k.toFixed(1)}, D=${current.d.toFixed(1)}`
        );
      }
    } catch (e) {
      console.log("Stochastic error:", e.message);
    }

    // 7. Volume Analysis (Weight: 1)
    try {
      const volumeMA = technicalIndicators.SMA.calculate({
        values: volumes,
        period: 20,
      });

      if (volumeMA.length >= 1) {
        const currentVolume = volumes[volumes.length - 1];
        const avgVolume = volumeMA[volumeMA.length - 1];
        const currentClose = closes[closes.length - 1];
        const prevClose = closes[closes.length - 2];
        const priceChange = (currentClose - prevClose) / prevClose;

        const volumeRatio = currentVolume / avgVolume;

        // High volume with price movement
        if (volumeRatio > 1.3) {
          if (priceChange > 0.005) longScore += 2;
          if (priceChange < -0.005) shortScore += 2;
        }

        console.log(`Volume: ${(volumeRatio * 100).toFixed(1)}% of average`);
      }
    } catch (e) {
      console.log("Volume error:", e.message);
    }

    // 8. Market Structure (Weight: 1)
    try {
      if (closes.length >= 50) {
        const recentHighs = highs.slice(-20);
        const recentLows = lows.slice(-20);
        const currentClose = closes[closes.length - 1];
        const avgClose = closes.slice(-10).reduce((a, b) => a + b) / 10;

        const maxHigh = Math.max(...recentHighs.slice(-10));
        const prevMaxHigh = Math.max(...recentHighs.slice(-20, -10));
        const minLow = Math.min(...recentLows.slice(-10));
        const prevMinLow = Math.min(...recentLows.slice(-20, -10));

        // Higher highs and higher lows (uptrend)
        if (
          maxHigh > prevMaxHigh &&
          minLow > prevMinLow &&
          currentClose > avgClose
        ) {
          longScore += 2;
        }
        // Lower highs and lower lows (downtrend)
        if (
          maxHigh < prevMaxHigh &&
          minLow < prevMinLow &&
          currentClose < avgClose
        ) {
          shortScore += 2;
        }

        console.log(
          `Structure: ${
            maxHigh > prevMaxHigh && minLow > prevMinLow
              ? "UPTREND"
              : maxHigh < prevMaxHigh && minLow < prevMinLow
              ? "DOWNTREND"
              : "SIDEWAYS"
          }`
        );
      }
    } catch (e) {
      console.log("Structure error:", e.message);
    }

    // 9. Volatility Filter
    try {
      const currentPrice = closes[closes.length - 1];
      const price24hAgo = closes[closes.length - 480]; // 480 * 3min = 24h
      const priceChange24h =
        Math.abs((currentPrice - price24hAgo) / price24hAgo) * 100;

      if (priceChange24h > 15) {
        console.log(
          `⚠️ High volatility detected: ${priceChange24h.toFixed(
            2
          )}% - Reducing signals`
        );
        longScore *= 0.5;
        shortScore *= 0.5;
      }
    } catch (e) {
      console.log("Volatility filter error:", e.message);
    }

    // Final Decision Logic
    console.log(`📈 Long Score: ${longScore.toFixed(1)}`);
    console.log(`📉 Short Score: ${shortScore.toFixed(1)}`);

    const minScore = 12; // Minimum score required for signal
    const scoreDifference = Math.abs(longScore - shortScore);

    if (
      longScore >= minScore &&
      longScore > shortScore &&
      scoreDifference >= 4
    ) {
      const confidence = Math.min(95, 65 + (longScore - minScore) * 2);
      console.log(`✅ LONG SIGNAL - Confidence: ${confidence.toFixed(1)}%`);
      return "LONG";
    } else if (
      shortScore >= minScore &&
      shortScore > longScore &&
      scoreDifference >= 4
    ) {
      const confidence = Math.min(95, 65 + (shortScore - minScore) * 2);
      console.log(`⛔ SHORT SIGNAL - Confidence: ${confidence.toFixed(1)}%`);
      return "SHORT";
    } else {
      console.log(
        `🔸 HOLD - Insufficient confluence (L:${longScore.toFixed(
          1
        )} S:${shortScore.toFixed(1)} Diff:${scoreDifference.toFixed(1)})`
      );
      return "HOLD";
    }
  } catch (error) {
    console.error(`❌ Error analyzing ${symbol}:`, error.message);
    return "HOLD";
  }
}

// Export only the main function
module.exports = { decideTradeDirection };
