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
const EMA_ANGLE_THRESHOLD = 30;
const VOLATILITY_MULTIPLIER = 100;
const TAKER_FEE = 0.04 / 100;

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

function calculateVolatility(candles, period = 10) {
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

function checkVolumeSpike(candles, lookback = 5) {
  if (candles.length < lookback + 1) return false;

  const avgVol =
    candles.slice(-lookback - 1, -1).reduce((sum, c) => sum + c.volume, 0) /
    lookback;
  const lastVol = candles[candles.length - 1].volume;

  return lastVol > avgVol * 1.15;
}

function calculateMomentum(candles, period = 5) {
  if (candles.length < period + 1) return 0;

  const current = candles[candles.length - 1].close;
  const past = candles[candles.length - 1 - period].close;

  return ((current - past) / past) * 100;
}

async function decideTradeDirection(symbol, candles1m, candles5m, candleIndex) {
  try {
    const pastCandles5m = candles1m.slice(0, candleIndex + 1);
    const pastCandles15m = candles5m.slice(0, Math.floor(candleIndex / 3) + 1);

    if (pastCandles5m.length < 30 || pastCandles15m.length < 30) return 'HOLD';

    // Use last 50 candles
    const recent5m = pastCandles5m.slice(-50);
    const recent15m = pastCandles15m.slice(-50);

    const ema9 = calculateEMA(9, recent5m);
    const ema15 = calculateEMA(15, recent5m);
    const emaAngle = getEMAangle(ema9, ema15);

    if (Math.abs(emaAngle) < 10) return 'HOLD';

    const lastCandle = recent5m[recent5m.length - 1];
    const candleType = detectCandleType(lastCandle);
    if (candleType === 'none') return 'HOLD';

    const rsi15m = calculateRSI(recent15m);
    const { macdLine, signalLine } = calculateMACD(recent5m);
    const volumeSpike = checkVolumeSpike(recent5m);

    if (ema9 > ema15 && emaAngle > EMA_ANGLE_THRESHOLD && rsi15m > 50 && macdLine > signalLine && volumeSpike) {
      return 'LONG';
    }

    if (ema15 > ema9 && emaAngle < -EMA_ANGLE_THRESHOLD && rsi15m < 50 && macdLine < signalLine && volumeSpike) {
      return 'SHORT';
    }

    return 'HOLD';
  } catch (err) {
    console.error("❌ Decision error:", err.message);
    return "HOLD";
  }
}


async function backtest(symbols, startDate, endDate) {
  const startTime = new Date(startDate).getTime();
  const endTime = new Date(endDate).getTime();

  //   console.log(`🚀 Starting backtest from ${startDate} to ${endDate}...`);

  for (const symbol of symbols) {
    // console.log(`\n📊 Backtesting ${symbol}...`);

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
      //   console.log(`⚠️ Insufficient data for ${symbol}. Skipping...`);
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

    for (let i = 50; i < candles1m.length - 1; i++) {
      const signal = await decideTradeDirection(
        symbol,
        candles1m,
        candles5m,
        i
      );
      results[signal]++;

      const currentCandle = candles1m[i];

      if ((signal === "LONG" || signal === "SHORT") && !position) {
        position = {
          type: signal,
          entryPrice: currentCandle.close,
          entryTime: currentCandle.openTime,
        };
      } else if (position) {
        const nextCandle = candles1m[i + 1];
        const currentPrice = nextCandle.close;
        let exitTrade = false;
        let reason = "";

        if (position.type === "LONG") {
          const profitPercent =
            ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
          if (profitPercent >= 1) {
            reason = "💰 Profit Target Hit";
            exitTrade = true;
          } else if (profitPercent <= -1) {
            reason = "🛑 Stop Loss Hit";
            exitTrade = true;
          }
        } else if (position.type === "SHORT") {
          const profitPercent =
            ((position.entryPrice - currentPrice) / position.entryPrice) * 100;
          if (profitPercent >= 1) {
            reason = "💰 Profit Target Hit";
            exitTrade = true;
          } else if (profitPercent <= -1) {
            reason = "🛑 Stop Loss Hit";
            exitTrade = true;
          }
        }

        if (exitTrade) {
          const profit =
            position.type === "LONG"
              ? (currentPrice - position.entryPrice) / position.entryPrice
              : (position.entryPrice - currentPrice) / position.entryPrice;

          const netProfit = profit - 2 * TAKER_FEE;
          results.profit += netProfit * 100;

          if (netProfit > 0) results.wins++;
          else results.losses++;

          results.trades.push({
            timestamp: new Date(position.entryTime).toLocaleString(),
            signal: position.type,
            entryPrice: position.entryPrice,
            exitPrice: currentPrice,
            profit: (netProfit * 100).toFixed(2),
            reason,
          });

          position = null;
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
      //   console.log(`profit---->>> >`, (netProfit * 100).toFixed(2));

      results.trades.push({
        timestamp: new Date(position.entryTime).toLocaleString(),
        signal: position.type,
        entryPrice: position.entryPrice,
        exitPrice,
        profit: (netProfit * 100).toFixed(2),
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
        )} | Exit: ${trade.exitPrice.toFixed(6)} | Profit: ${trade.profit}%`
      );
    });
    console.log("=".repeat(60));
  }
}

const startDate = "2025-05-01T00:00:00Z";
const endDate = "2025-05-30T23:59:59Z";

backtest(symbols, startDate, endDate).catch((err) => {
  console.error("❌ Backtest error:", err.message);
});
