const Binance = require("node-binance-api");
const axios = require('axios');

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
  "1000PEPEUSDT",
  "1000BONKUSDT",
  "DOGEUSDT",
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
          console.error(`❌ No candle data for ${symbol} - ${interval} at ${new Date(currentStartTime).toISOString()}`);
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
        .filter(c => c && !isNaN(c.close));
    } else {
      const res = await axios.get(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
      if (!res.data || !Array.isArray(res.data)) {
        console.error(`❌ Invalid response from axios for ${symbol} - ${interval}`);
        return [];
      }
      return res.data.map(c => ({
        openTime: c[0],
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[5]),
      })).filter(c => !isNaN(c.close));
    }
  } catch (err) {
    console.error(`❌ Error fetching candles for ${symbol} (${interval}):`, err.message);
    return [];
  }
}

function getCandleAngle(candle, timeSpan = 300) { // timeSpan in seconds for 5m candle
  const delta = (candle.close - candle.open) / candle.open * 100000; // Scale for small-priced assets
  const rawAngleRad = Math.atan(delta / timeSpan);
  let angle = rawAngleRad * (180 / Math.PI);

  // Map angle to 360° scale: upward (close > open) to 90°-150°, downward to 210°-270°
  if (candle.close > candle.open) {
    // Upward trend: map to 90°-150°
    angle = 90 + (Math.abs(delta) / (Math.abs(delta) + 100)) * 60; // Scale to 90°-150°
  } else if (candle.close < candle.open) {
    // Downward trend: map to 210°-270°
    angle = 210 + (Math.abs(delta) / (Math.abs(delta) + 100)) * 60; // Scale to 210°-270°
  } else {
    angle = 180; // Neutral case
  }

  return angle;
}

async function decideTradeDirection(symbol, candles5m, candles15m, candleIndex) {
  try {
    const pastCandles5m = candles5m.slice(0, candleIndex + 1);

    if (pastCandles5m.length < 2) {
      console.log(`⚠️ Insufficient candles for ${symbol} at index ${candleIndex}: 5m=${pastCandles5m.length}`);
      return "HOLD";
    }

    const secondLastCandle = pastCandles5m[pastCandles5m.length - 2]; // 2nd last candle
    const angle = getCandleAngle(secondLastCandle);

    console.log(
      `🔍 ${symbol} | 2nd Last Candle Open: ${secondLastCandle.open.toFixed(6)} | Close: ${secondLastCandle.close.toFixed(6)} | Angle: ${angle.toFixed(2)}°`
    );

    if (angle >= 90 && angle <= 150) {
      console.log(`✅ Strong LONG signal for ${symbol} (Angle: ${angle.toFixed(2)}°)`);
      return "LONG";
    }

    if (angle >= 210 && angle <= 270) {
      console.log(`✅ Strong SHORT signal for ${symbol} (Angle: ${angle.toFixed(2)}°)`);
      return "SHORT";
    }

    console.log(`⚖️ No clear signal for ${symbol}. Decision: HOLD (Angle: ${angle.toFixed(2)}°)`);
    return "HOLD";
  } catch (err) {
    console.error(`❌ Decision error for ${symbol}:`, err.message);
    return "HOLD";
  }
}

async function backtest(symbols, startDate, endDate) {
  const startTime = new Date(startDate).getTime();
  const endTime = new Date(endDate).getTime();

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
      console.log(`⚠️ Insufficient data for ${symbol}. Skipping... (5m: ${candles5m.length}, 15m: ${candles15m.length})`);
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
        position = {
          type: signal,
          entryPrice: currentCandle.close,
          entryTime: currentCandle.openTime,
        };
      } else if (position) {
        const nextCandle = candles5m[i + 1];
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

    if (position && candles5m.length > 50) {
      const exitPrice = candles5m[candles5m.length - 1].close;
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

module.exports = { decideTradeDirection };