const Binance = require("binance-api-node").default;
const { EMA, RSI, Stochastic } = require("technicalindicators");

// Initialize Binance client (no keys needed for historical data)
const client = Binance();

// Strategy Configuration
const config = {
  symbol: "BTCUSDT",
  interval: "1m", // 1-minute candles
  startTime: "2024-07-01", // Backtest start date (YYYY-MM-DD)
  endTime: "2024-07-28", // Backtest end date
  emaFast: 9, // Fast EMA period
  emaSlow: 21, // Slow EMA period
  rsiPeriod: 14, // RSI period
  stochPeriod: 14, // Stochastic period
  stopLossPercent: 0.8, // 0.8% Stop Loss
  takeProfitPercent: 1.2, // 1.2% Take Profit
};

// Performance Tracking
const results = {
  trades: [],
  totalTrades: 0,
  profitableTrades: 0,
  totalProfit: 0,
  maxProfit: 0,
  maxLoss: 0,
};

async function backtestStrategy() {
  try {
    console.log("🚀 Fetching historical data...");

    // Get historical candles
    const candles = await client.candles({
      symbol: config.symbol,
      interval: config.interval,
      startTime: new Date(config.startTime).getTime(),
      endTime: new Date(config.endTime).getTime(),
      limit: 1000,
    });

    console.log(`📊 Analyzing ${candles.length} candles...`);

    // Prepare data arrays
    const closes = candles.map((c) => parseFloat(c.close));
    const highs = candles.map((c) => parseFloat(c.high));
    const lows = candles.map((c) => parseFloat(c.low));
    const timestamps = candles.map((c) => new Date(c.openTime));

    // Track trading position
    let position = null;

    // Process each candle
    for (
      let i = Math.max(config.emaSlow, config.stochPeriod);
      i < candles.length;
      i++
    ) {
      // Slice data up to current index
      const closesSlice = closes.slice(0, i + 1);
      const highsSlice = highs.slice(0, i + 1);
      const lowsSlice = lows.slice(0, i + 1);

      // Calculate indicators
      const emaFast = EMA.calculate({
        period: config.emaFast,
        values: closesSlice,
      }).pop();

      const emaSlow = EMA.calculate({
        period: config.emaSlow,
        values: closesSlice,
      }).pop();

      const rsi = RSI.calculate({
        period: config.rsiPeriod,
        values: closesSlice,
      }).pop();

      const stoch = Stochastic.calculate({
        high: highsSlice,
        low: lowsSlice,
        close: closesSlice,
        period: config.stochPeriod,
        signalPeriod: 3,
      }).pop();

      const price = closes[i];
      const timestamp = timestamps[i];

      // Generate signal
      const bullish =
        emaFast > emaSlow && rsi < 35 && stoch.k < 20 && stoch.k > stoch.d;
      const bearish =
        emaFast < emaSlow && rsi > 65 && stoch.k > 80 && stoch.k < stoch.d;

      // Check for entry signal
      if (!position && (bullish || bearish)) {
        position = {
          type: bullish ? "LONG" : "SHORT",
          entryPrice: price,
          entryTime: timestamp,
          stopLoss: bullish
            ? price * (1 - config.stopLossPercent / 100)
            : price * (1 + config.stopLossPercent / 100),
          takeProfit: bullish
            ? price * (1 + config.takeProfitPercent / 100)
            : price * (1 - config.takeProfitPercent / 100),
        };
      }

      // Check for exit conditions
      if (position) {
        let exitReason = "";
        let exitPrice = price;
        let profit = 0;

        // LONG position exit checks
        if (position.type === "LONG") {
          // Take Profit hit
          if (price >= position.takeProfit) {
            exitReason = "TP";
          }
          // Stop Loss hit
          else if (price <= position.stopLoss) {
            exitReason = "SL";
          }
        }
        // SHORT position exit checks
        else if (position.type === "SHORT") {
          // Take Profit hit
          if (price <= position.takeProfit) {
            exitReason = "TP";
          }
          // Stop Loss hit
          else if (price >= position.stopLoss) {
            exitReason = "SL";
          }
        }

        // Close position if exit triggered
        if (exitReason) {
          // Calculate profit percentage
          if (position.type === "LONG") {
            profit =
              ((exitPrice - position.entryPrice) / position.entryPrice) * 100;
          } else {
            profit =
              ((position.entryPrice - exitPrice) / position.entryPrice) * 100;
          }

          // Update performance metrics
          results.totalTrades++;
          if (profit > 0) results.profitableTrades++;
          results.totalProfit += profit;

          if (profit > results.maxProfit) results.maxProfit = profit;
          if (profit < results.maxLoss) results.maxLoss = profit;

          // Record trade details
          results.trades.push({
            entry: position.entryPrice.toFixed(2),
            exit: exitPrice.toFixed(2),
            profit: profit.toFixed(2) + "%",
            type: position.type,
            reason: exitReason,
            duration:
              Math.round((timestamp - position.entryTime) / (1000 * 60)) +
              " mins",
          });

          // Reset position
          position = null;
        }
      }
    }

    // Generate report
    const winRate = (results.profitableTrades / results.totalTrades) * 100 || 0;
    const avgProfit =
      results.totalTrades > 0
        ? (results.totalProfit / results.totalTrades).toFixed(2)
        : 0;

    console.log("\n=============== BACKTEST REPORT ===============");
    console.log(`📅 Period: ${config.startTime} to ${config.endTime}`);
    console.log(`💹 Symbol: ${config.symbol} | Timeframe: ${config.interval}`);
    console.log(`🔢 Total Trades: ${results.totalTrades}`);
    console.log(`✅ Win Rate: ${winRate.toFixed(2)}%`);
    console.log(`📈 Avg Profit Per Trade: ${avgProfit}%`);
    console.log(`🚀 Total Profit: ${results.totalProfit.toFixed(2)}%`);
    console.log(`🏆 Max Profit: ${results.maxProfit.toFixed(2)}%`);
    console.log(`🔥 Max Loss: ${results.maxLoss.toFixed(2)}%`);
    console.log("-----------------------------------------------");

    // Show recent trades
    console.log("🔁 Last 5 Trades:");
    results.trades.slice(-5).forEach((trade, i) => {
      console.log(
        `#${i + 1}: ${trade.type} | Entry: ${trade.entry} | Exit: ${
          trade.exit
        } | Profit: ${trade.profit} (${trade.reason}) | Duration: ${
          trade.duration
        }`
      );
    });

    // Calculate risk-reward ratio
    const avgWin =
      results.trades
        .filter((t) => parseFloat(t.profit) > 0)
        .reduce((sum, t) => sum + parseFloat(t.profit), 0) /
        results.profitableTrades || 0;
    const avgLoss =
      results.trades
        .filter((t) => parseFloat(t.profit) < 0)
        .reduce((sum, t) => sum + parseFloat(t.profit), 0) /
        (results.totalTrades - results.profitableTrades) || 0;
    const riskReward = Math.abs(avgWin / avgLoss);

    console.log("-----------------------------------------------");
    console.log(`⚖️ Risk-Reward Ratio: ${riskReward.toFixed(2)}:1`);
    console.log(
      `💰 Expectancy: ${(
        (winRate / 100) * avgWin +
        ((100 - winRate) / 100) * avgLoss
      ).toFixed(2)}%`
    );
    console.log("===============================================");
  } catch (error) {
    console.error("Backtest failed:", error);
  }
}

// Run backtest
backtestStrategy();
