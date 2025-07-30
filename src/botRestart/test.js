const technicalIndicators = require("technicalindicators");
const Binance = require("node-binance-api");

const binance = new Binance().options({
  APIKEY: "whfiekZqKdkwa9fEeUupVdLZTNxBqP1OCEuH2pjyImaWt51FdpouPPrCawxbsupK",
  APISECRET: "E4IcteWOQ6r9qKrBZJoBy4R47nNPBDepVXMnS3Lf2Bz76dlu0QZCNh82beG2rHq4",
  useServerTime: true,
  test: false,
});

const TIMEFRAME_MAIN = "1m";
const TIMEFRAME_TREND = "5m";
const EMA_ANGLE_THRESHOLD = 15;
const MIN_ANGLE_THRESHOLD = 9;
const VOLATILITY_MULTIPLIER = 10000;
const TAKER_FEE = 0.04 / 100;
const MIN_MOMENTUM = 0.2; // Increased momentum threshold
const MIN_VOLUME_MULTIPLIER = 1.5; // Stronger volume spike requirement

const symbols = [
  "1000PEPEUSDT",
  "1000BONKUSDT",
  "DOGEUSDT",
  "CKBUSDT",
  "1000FLOKIUSDT",
];

async function getCandles(symbol, interval, startTime, endTime, limit = 1000) {
  try {
    const candles = [];
    let currentStartTime = startTime;
    while (currentStartTime < endTime) {
      const batch = await binance.futuresCandles(symbol, interval, {
        startTime: currentStartTime,
        endTime: Math.min(currentStartTime + limit * 60 * 1000, endTime),
        limit,
      });

      if (!Array.isArray(batch) || !batch.length) {
        console.error(`❌ No candle data for ${symbol} - ${interval}`);
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

        console.warn(`⚠️ Malformed candle at index ${idx}:`, c);
        return {
          openTime: 0,
          open: NaN,
          high: NaN,
          low: NaN,
          close: NaN,
          volume: NaN,
        };
      })
      .filter((c) => !isNaN(c.close));
  } catch (err) {
    console.error(`❌ Error fetching candles for ${symbol}:`, err.message);
    return [];
  }
}

function calculateEMAseries(period, closes) {
  return technicalIndicators.EMA.calculate({
    period,
    values: closes,
  });
}

function getEMAAngleFromSeries(emaSeries, lookback = 3) {
  if (emaSeries.length < lookback + 1) return 0;

  const recent = emaSeries[emaSeries.length - 1];
  const past = emaSeries[emaSeries.length - 1 - lookback];
  const percentChange = ((recent - past) / past) * 100;
  const delta = percentChange * VOLATILITY_MULTIPLIER;
  const angleRad = Math.atan(delta / lookback);

  return angleRad * (180 / Math.PI);
}

function calculateVolatility(candles, period = 20) {
  const returns = [];
  for (let i = 1; i < Math.min(candles.length, period + 1); i++) {
    const ret =
      (candles[i].close - candles[i - 1].close) / candles[i - 1].close;
    returns.push(ret);
  }

  const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
  const variance =
    returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) /
    returns.length;

  return Math.sqrt(variance) * 100;
}

function detectCandleType(candle) {
  const body = Math.abs(candle.close - candle.open);
  const upperWick = candle.high - Math.max(candle.close, candle.open);
  const lowerWick = Math.min(candle.close, candle.open) - candle.low;
  const range = candle.high - candle.low;

  if (lowerWick > 1.5 * body || upperWick > 1.5 * body) return "pinbar";
  if (range > 1.2 * body && body / range > 0.6) return "bigbar";
  if (body / range > 0.8) return "fullbody";

  return "none";
}

function calculateRSI(candles, period = 7) {
  if (candles.length < period + 1) return 50;

  let gains = 0,
    losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = candles[i].close - candles[i - 1].close;
    if (change >= 0) gains += change;
    else losses -= change;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;
  const rs = avgGain / (avgLoss || 1);

  return 100 - 100 / (1 + rs);
}

function calculateMACD(candles, fast = 8, slow = 21, signal = 5) {
  const closes = candles.map((c) => c.close);
  const macd = technicalIndicators.MACD.calculate({
    fastPeriod: fast,
    slowPeriod: slow,
    signalPeriod: signal,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
    values: closes,
  });

  if (!macd.length) return { macdLine: 0, signalLine: 0, histogram: 0 };

  const last = macd[macd.length - 1];
  return {
    macdLine: last.MACD || 0,
    signalLine: last.signal || 0,
    histogram: (last.MACD || 0) - (last.signal || 0),
  };
}

function checkVolumeSpike(
  candles,
  lookback = 5,
  multiplier = MIN_VOLUME_MULTIPLIER
) {
  if (candles.length < lookback + 1) return false;

  const avgVol =
    candles.slice(-lookback - 1, -1).reduce((sum, c) => sum + c.volume, 0) /
    lookback;
  const lastVol = candles[candles.length - 1].volume;

  return lastVol > avgVol * multiplier;
}

function calculateMomentum(candles, period = 5) {
  if (candles.length < period + 1) return 0;

  const current = candles[candles.length - 1].close;
  const past = candles[candles.length - 1 - period].close;

  return ((current - past) / past) * 100;
}

function predictNextCandle(candles) {
  const closes = candles.map((c) => c.close);
  const ema9Series = calculateEMAseries(9, closes);
  const ema15Series = calculateEMAseries(15, closes);

  const momentum = calculateMomentum(candles, 5);
  const rsi = calculateRSI(candles, 7);
  const { macdLine, signalLine, histogram } = calculateMACD(candles);

  const ema9Angle = getEMAAngleFromSeries(ema9Series, 3);
  const ema15Angle = getEMAAngleFromSeries(ema15Series, 3);

  const bullish =
    ema9Series.at(-1) > ema15Series.at(-1) &&
    ema9Angle > 0 &&
    ema15Angle > 0 &&
    macdLine > signalLine &&
    histogram > 0 &&
    momentum > 0 &&
    rsi > 50;

  const bearish =
    ema9Series.at(-1) < ema15Series.at(-1) &&
    ema9Angle < 0 &&
    ema15Angle < 0 &&
    macdLine < signalLine &&
    histogram < 0 &&
    momentum < 0 &&
    rsi < 50;

  if (bullish) return "Probable GREEN Candle";
  if (bearish) return "Probable RED Candle";
  return "Uncertain / Doji Likely";
}

async function decideTradeDirection(symbol, candles1m, candles5m, candleIndex) {
  try {
    console.log(`🔍 Analyzing ${symbol} at candle ${candleIndex}...`);

    const pastCandles1m = candles1m.slice(0, candleIndex + 1);
    const pastCandles5m = candles5m.slice(0, Math.floor(candleIndex / 5) + 1);

    if (pastCandles1m.length < 50 || pastCandles5m.length < 20) {
      return "HOLD";
    }

    const closes1m = pastCandles1m.map((c) => c.close);
    const closes5m = pastCandles5m.map((c) => c.close);
    const ema9Series1m = calculateEMAseries(9, closes1m);
    const ema15Series1m = calculateEMAseries(15, closes1m);
    const ema21Series1m = calculateEMAseries(21, closes1m);
    const ema9Series5m = calculateEMAseries(9, closes5m);
    const ema15Series5m = calculateEMAseries(15, closes5m);

    const ema9 = ema9Series1m[ema9Series1m.length - 1];
    const ema15 = ema15Series1m[ema15Series1m.length - 1];
    const ema21 = ema21Series1m[ema21Series1m.length - 1];
    const ema9_5m = ema9Series5m[ema9Series5m.length - 1];
    const ema15_5m = ema15Series5m[ema15Series5m.length - 1];

    const ema9Angle = getEMAAngleFromSeries(ema9Series1m, 3);
    const ema15Angle = getEMAAngleFromSeries(ema15Series1m, 3);

    const volatility = calculateVolatility(pastCandles1m, 20);
    console.log(`🌊 Market Volatility: ${volatility.toFixed(2)}%`);
    if (volatility < 0.2) {
      // Increased minimum volatility
      console.log(`⚠️ Market too flat (volatility < 0.2%). Decision: HOLD`);
      return "HOLD";
    }

    if (
      Math.abs(ema9Angle) < MIN_ANGLE_THRESHOLD &&
      Math.abs(ema15Angle) < MIN_ANGLE_THRESHOLD
    ) {
      console.log(
        `⚠️ EMA angles too flat (<${MIN_ANGLE_THRESHOLD}°). Decision: HOLD`
      );
      return "HOLD";
    }

    const lastCandle = pastCandles1m[pastCandles1m.length - 1];
    const candleType = detectCandleType(lastCandle);

    const rsi1m = calculateRSI(pastCandles1m, 7);
    const rsi5m = calculateRSI(pastCandles5m, 14);

    const { macdLine, signalLine, histogram } = calculateMACD(pastCandles1m);

    const volumeSpike = checkVolumeSpike(
      pastCandles1m,
      5,
      MIN_VOLUME_MULTIPLIER
    );
    const momentum = calculateMomentum(pastCandles1m, 5);

    const longConditions = [
      ema9 > ema15,
      ema15 > ema21,
      ema9_5m > ema15_5m, // 5m trend confirmation
      ema9Angle > EMA_ANGLE_THRESHOLD || ema15Angle > EMA_ANGLE_THRESHOLD,
      rsi1m > 50 && rsi1m < 75, // Tighter RSI range
      macdLine > signalLine && Math.abs(histogram) > 0.0001, // Stronger MACD
      momentum > MIN_MOMENTUM,
      volumeSpike,
    ];

    const longScore = longConditions.filter(Boolean).length;
    console.log(`🟢 LONG Score: ${longScore}/8`);

    const shortConditions = [
      ema9 < ema15,
      ema15 < ema21,
      ema9_5m < ema15_5m, // 5m trend confirmation
      ema9Angle < -EMA_ANGLE_THRESHOLD || ema15Angle < -EMA_ANGLE_THRESHOLD,
      rsi1m < 50 && rsi1m > 25, // Tighter RSI range
      macdLine < signalLine && Math.abs(histogram) > 0.0001, // Stronger MACD
      momentum < -MIN_MOMENTUM,
      volumeSpike,
    ];

    const shortScore = shortConditions.filter(Boolean).length;
    console.log(`🔴 SHORT Score: ${shortScore}/8`);

    if (longScore >= 7) {
      // Increased threshold
      console.log(`✅ Strong LONG signal (Score: ${longScore}/8)`);
      return "LONG";
    }

    if (shortScore >= 7) {
      // Increased threshold
      console.log(`✅ Strong SHORT signal (Score: ${shortScore}/8)`);
      return "SHORT";
    }

    console.log(`⚖️ No clear signal. Decision: HOLD`);
    return "HOLD";
  } catch (err) {
    console.error("❌ Decision error:", err.message);
    return "HOLD";
  }
}

async function backtest(symbols, startDate, endDate) {
  const startTime = new Date(startDate).getTime();
  const endTime = new Date(endDate).getTime();

  console.log(`🚀 Starting backtest from ${startDate} to ${endDate}...`);

  for (const symbol of symbols) {
    console.log(`\n📊 Backtesting ${symbol}...`);

    const candles1m = await getCandles(
      symbol,
      TIMEFRAME_MAIN,
      startTime,
      endTime
    );
    const candles5m = await getCandles(
      symbol,
      TIMEFRAME_TREND,
      startTime,
      endTime
    );

    if (candles1m.length < 50 || candles5m.length < 20) {
      console.log(`⚠️ Insufficient data for ${symbol}. Skipping...`);
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
    let stopLossPrice = null;

    for (let i = 50; i < candles1m.length - 1; i++) {
      const signal = await decideTradeDirection(
        symbol,
        candles1m,
        candles5m,
        i
      );
      results[signal]++;

      const currentCandle = candles1m[i];
      const nextCandle = candles1m[i + 1];
      const volatility = calculateVolatility(candles1m.slice(0, i + 1), 20);
      const stopLossPercent = Math.max(0.01, volatility / 100); // Adaptive stop loss

      if ((signal === "LONG" || signal === "SHORT") && !position) {
        position = {
          type: signal,
          entryPrice: currentCandle.close,
          entryTime: currentCandle.openTime,
        };
        stopLossPrice =
          signal === "LONG"
            ? currentCandle.close * (1 - stopLossPercent)
            : currentCandle.close * (1 + stopLossPercent);
      } else if (position) {
        if (position.type === "LONG") {
          const currentProfit =
            (nextCandle.close - position.entryPrice) / position.entryPrice;
          if (currentProfit > stopLossPercent) {
            const newStopLoss = nextCandle.close * (1 - stopLossPercent);
            stopLossPrice = Math.max(stopLossPrice, newStopLoss);
          }
          if (nextCandle.low <= stopLossPrice) {
            const exitPrice = Math.max(nextCandle.open, stopLossPrice);
            const profit =
              (exitPrice - position.entryPrice) / position.entryPrice;
            const netProfit = profit - 2 * TAKER_FEE;

            results.profit += netProfit * 100;
            if (netProfit > 0) results.wins++;
            else results.losses++;

            results.trades.push({
              timestamp: new Date(position.entryTime).toLocaleString(),
              signal: position.type,
              entryPrice: position.entryPrice,
              exitPrice,
              profit: (netProfit * 100).toFixed(2),
              stopLossTriggered: true,
            });

            position = null;
            stopLossPrice = null;
            continue;
          }
        } else if (position.type === "SHORT") {
          const currentProfit =
            (position.entryPrice - nextCandle.close) / position.entryPrice;
          if (currentProfit > stopLossPercent) {
            const newStopLoss = nextCandle.close * (1 + stopLossPercent);
            stopLossPrice = Math.min(stopLossPrice, newStopLoss);
          }
          if (nextCandle.high >= stopLossPrice) {
            const exitPrice = Math.min(nextCandle.open, stopLossPrice);
            const profit =
              (position.entryPrice - exitPrice) / position.entryPrice;
            const netProfit = profit - 2 * TAKER_FEE;

            results.profit += netProfit * 100;
            if (netProfit > 0) results.wins++;
            else results.losses++;

            results.trades.push({
              timestamp: new Date(position.entryTime).toLocaleString(),
              signal: position.type,
              entryPrice: position.entryPrice,
              exitPrice,
              profit: (netProfit * 100).toFixed(2),
              stopLossTriggered: true,
            });

            position = null;
            stopLossPrice = null;
            continue;
          }
        }

        if (signal === "HOLD") {
          const exitPrice = nextCandle.close;
          const profit =
            position.type === "LONG"
              ? (exitPrice - position.entryPrice) / position.entryPrice
              : (position.entryPrice - exitPrice) / position.entryPrice;
          const netProfit = profit - 2 * TAKER_FEE;

          results.profit += netProfit * 100;
          if (netProfit > 0) results.wins++;
          else results.losses++;

          results.trades.push({
            timestamp: new Date(position.entryTime).toLocaleString(),
            signal: position.type,
            entryPrice: position.entryPrice,
            exitPrice,
            profit: (netProfit * 100).toFixed(2),
            stopLossTriggered: false,
          });

          position = null;
          stopLossPrice = null;
        }
      }
    }

    if (position && candles1m.length > 50) {
      const exitPrice = candles1m[candles1m.length - 1].close;
      const profit =
        position.type === "LONG"
          ? (exitPrice - position.entryPrice) / position.entryPrice
          : (position.entryPrice - exitPrice) / position.entryPrice;
      const netProfit = profit - 2 * TAKER_FEE;

      results.profit += netProfit * 100;
      if (netProfit > 0) results.wins++;
      else results.losses++;

      results.trades.push({
        timestamp: new Date(position.entryTime).toLocaleString(),
        signal: position.type,
        entryPrice: position.entryPrice,
        exitPrice,
        profit: (netProfit * 100).toFixed(2),
        stopLossTriggered: false,
      });
    }

    console.log(`\n📈 Backtest Summary for ${symbol}`);
    console.log(`🟢 LONG Signals: ${results.LONG}`);
    console.log(`🔴 SHORT Signals: ${results.SHORT}`);
    console.log(`⚪ HOLD Signals: ${results.HOLD}`);
    console.log(
      `📊 Total Signals: ${results.LONG + results.SHORT + results.HOLD}`
    );
    console.log(`💰 Total Profit: ${results.profit.toFixed(2)}%`);
    console.log(`✅ Wins: ${results.wins} | ❌ Losses: ${results.losses}`);
    console.log(
      `🏆 Win Rate: ${(
        (results.wins / (results.wins + results.losses) || 0) * 100
      ).toFixed(2)}%`
    );
    console.log(`\nDetailed Trades:`);
    results.trades.forEach((trade) => {
      console.log(
        `${trade.timestamp} | Signal: ${
          trade.signal
        } | Entry: ${trade.entryPrice.toFixed(
          6
        )} | Exit: ${trade.exitPrice.toFixed(6)} | Profit: ${
          trade.profit
        }% | Stop Loss: ${
          trade.stopLossTriggered ? "Triggered" : "Not Triggered"
        }`
      );
    });
    console.log("=".repeat(60));
  }
}

const startDate = "2025-05-01T00:00:00Z";
const endDate = "2025-06-28T23:59:59Z";

backtest(symbols, startDate, endDate).catch((err) => {
  console.error("❌ Backtest error:", err.message);
});
