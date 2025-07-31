const Binance = require("node-binance-api");
const axios = require("axios");

const binance = new Binance().options({
  APIKEY: "whfiekZqKdkwa9fEeUupVdLZTNxBqP1OCEuH2pjyImaWt51FdpouPPrCawxbsupK",
  APISECRET: "E4IcteWOQ6r9qKrBZJoBy4R47nNPBDepVXMnS3Lf2Bz76dlu0QZCNh82beG2rHq4",
  useServerTime: true,
  test: false,
});

const TIMEFRAME_MAIN = "5m";
const TIMEFRAME_TREND = "5m";
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
async function getCandles(symbol, interval, startTime, endTime, limit = 9) {
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

async function decideTradeDirection(
  symbol,
  candles5m,
  candles15m,
  candleIndex
) {
  try {
    const pastCandles5m = candles5m.slice(0, candleIndex + 1);

    if (pastCandles5m.length < 2) {
      return "HOLD";
    }

    const secondLastCandle = pastCandles5m[candles5m.length - 2];
    const angle = getCandleAngle(secondLastCandle);

    if (angle >= 90 && angle <= 150) {
      return "LONG";
    }

    if (angle >= 210 && angle <= 270) {
      return "SHORT";
    }

    return "HOLD";
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
          } else if (roi <= -1.5) {
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
          } else if (roi <= -1.5) {
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
    console.log(`📊 Average ROI per Trade: ${avgROI}%`);
    console.log(`💵 Margin per Trade: ${MARGIN_AMOUNT} USDT`);
    console.log(`⚖️ Leverage: ${LEVERAGE}x`);

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
