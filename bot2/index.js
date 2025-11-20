// bot.js - ULTIMATE FIX: Prevents ALL duplicate trades + DUAL TEMA FILTER
const Exchange = require("./exchange");
const Indicators = require("./indicators");
const Strategy = require("./strategy");
const PositionManager = require("./positionManager");
const config = require("./config");
const TradeDetails = require("../backend/models/tradeDetails.js");

const ENVUSERID = process.env.USER_ID || "689c48ecdbd3da869cb3e0c5";

console.log(
  "🚀 Smart Scanner Bot Started - DUPLICATE FIXED + DUAL TEMA FILTER"
);
console.log("📊 Trading Pairs:", config.symbols.join(", "));
console.log("⏰ Decision Timeframe:", config.timeframe);
console.log("🔍 Scan Interval:", config.scanInterval / 1000 + " seconds");
console.log("📏 Min Candles Required:", config.minCandlesRequired);
console.log("🔒 Position Mode: ONE POSITION PER TOKEN ONLY");
console.log("🛡️  DUPLICATE PROTECTION: ACTIVE");
console.log("🎯 DUAL TEMA FILTER: 5m TEMA 200 + 15m TEMA 100");

class TradingBot {
  constructor() {
    this.exchange = new Exchange();
    this.indicators = new Indicators();
    this.strategy = new Strategy();
    this.positionManager = new PositionManager(this.exchange);
    this.dailyStats = {
      pnl: 0,
      trades: 0,
      wins: 0,
      losses: 0,
      startTime: Date.now(),
    };
    this.lastCandleTime = {};
    this.analysisCount = {};
    this.positionCheckCache = {}; // Cache for position checks
  }

  async sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ✅ CRITICAL: Sync position from exchange to memory
  async syncPositionState(symbol) {
    try {
      const actualPosition = await this.exchange.getCurrentPosition(symbol);
      const trackedPosition = this.positionManager.trackedPositions[symbol];

      // Found exchange position but not tracked
      if (actualPosition && !trackedPosition) {
        console.log(
          `   🔄 [${symbol}] SYNC: Found untracked position - adding to memory`
        );
        this.positionManager.trackedPositions[symbol] = {
          side: actualPosition.side,
          entry: actualPosition.entry,
          amount: actualPosition.amount,
          sttpPlaced: false,
          entryTime: Date.now(),
          syncedFromExchange: true,
        };
      }

      // Tracked position but no exchange position
      if (!actualPosition && trackedPosition) {
        console.log(
          `   🧹 [${symbol}] SYNC: No exchange position - removing from memory`
        );
        delete this.positionManager.trackedPositions[symbol];
        delete this.positionManager.entryInProgress[symbol];
      }
    } catch (error) {
      console.error(`   ❌ Sync error for ${symbol}:`, error.message);
    }
  }

  hasNewCandle(symbol, currentCandleTime) {
    if (!this.lastCandleTime[symbol]) {
      this.lastCandleTime[symbol] = currentCandleTime;
      return true;
    }

    if (currentCandleTime > this.lastCandleTime[symbol]) {
      this.lastCandleTime[symbol] = currentCandleTime;
      return true;
    }

    return false;
  }

  async processSymbolWithDetails(symbol) {
    try {
      console.log(`\n🔍 [${symbol}] === SCAN START ===`);
      // ✅ CRITICAL: Always sync position state first
      await this.syncPositionState(symbol);

      const candles = await this.exchange.fetchOHLCV(
        symbol,
        config.timeframe,
        config.candleFetchLimit
      );

      if (!candles || candles.length < config.minCandlesRequired) {
        console.log(
          `⏳ [${symbol}] Waiting for data: ${candles ? candles.length : 0}/${
            config.minCandlesRequired
          }`
        );
        return;
      }

      // Normalize candles
      const normalizedCandles = candles
        .map((c) => {
          if (Array.isArray(c)) {
            return {
              time: c[0],
              open: c[1],
              high: c[2],
              low: c[3],
              close: c[4],
              volume: c[5],
            };
          } else if (c.timestamp !== undefined) {
            return {
              time: c.timestamp,
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
              volume: c.volume,
            };
          } else {
            return c;
          }
        })
        .filter((c) => c !== null && c.close !== undefined);

      if (normalizedCandles.length === 0) {
        console.log(`❌ [${symbol}] No valid candles`);
        return;
      }

      const currentCandle = normalizedCandles[normalizedCandles.length - 1];
      const currentPrice = currentCandle.close;
      const currentCandleTime = currentCandle.time;

      const isNewCandle = this.hasNewCandle(symbol, currentCandleTime);

      if (!isNewCandle) {
        console.log(`⏳ [${symbol}] Waiting for new candle...`);
        return;
      }

      console.log(
        `\n🔄 [${symbol}] ANALYZING ${config.timeframe} CANDLE! (${normalizedCandles.length} candles)`
      );

      const indicatorsData = this.indicators.calculateAll(normalizedCandles);
      if (!indicatorsData) {
        console.log(`❌ [${symbol}] Indicators failed`);
        return;
      }

      // ✅ NEW: Calculate 15m TEMA 100
      console.log(`   📊 Calculating 15m TEMA 100...`);
      const tema100_15m = await this.indicators.calculateTEMA100_15m(
        this.exchange,
        symbol
      );

      if (!tema100_15m || tema100_15m.length === 0) {
        console.log(
          `   ⚠️ TEMA 100 (15m) calculation failed - skipping ${symbol}`
        );
        return;
      }

      // ✅ Add TEMA 100 to indicators data
      indicatorsData.tema100_15m = tema100_15m;

      // ✅ CRITICAL: Get existing position for strategy
      const existingPosition = this.positionManager.trackedPositions[symbol];
      const analysis = this.strategy.analyze(
        indicatorsData,
        currentPrice,
        existingPosition
      );

      if (analysis.error) {
        console.log(`⏳ [${symbol}] ${analysis.error}`);
        return;
      }

      const trackedPosition = this.positionManager.trackedPositions[symbol];

      console.log(
        `📊 [${symbol}] Price: ${currentPrice.toFixed(
          this.positionManager.getPriceDecimals(symbol)
        )}`
      );

      // Display indicators
      this.displayIndicatorsImproved(analysis, currentPrice, symbol);

      // ✅ ULTIMATE PROTECTION: 6-CHECK SYSTEM BEFORE ENTRY
      console.log(`\n🎯 [${symbol}] === PRE-ENTRY VALIDATION (6 CHECKS) ===`);

      // CHECK 1: Exchange position (already checked above)
      console.log(`   ✅ CHECK 1: No exchange position`);

      // CHECK 2: Tracked position
      if (trackedPosition) {
        console.log(
          `   🚫 CHECK 2 FAILED: Tracked position exists (${trackedPosition.side})`
        );
        console.log(`   === ENTRY BLOCKED ===\n`);
        return;
      }
      console.log(`   ✅ CHECK 2: No tracked position`);

      // CHECK 3: Active position check
      if (this.positionManager.hasActivePosition(symbol)) {
        console.log(`   🚫 CHECK 3 FAILED: Active position detected`);
        console.log(`   === ENTRY BLOCKED ===\n`);
        return;
      }
      console.log(`   ✅ CHECK 3: No active position`);

      // CHECK 4: Entry in progress (with auto-clear of stale locks)
      if (this.positionManager.entryInProgress[symbol]) {
        const age = Math.floor(
          (Date.now() - this.positionManager.entryInProgress[symbol]) / 1000
        );

        if (age > 60) {
          console.log(`   🔄 CHECK 4: Clearing stale lock (${age}s old)`);
          delete this.positionManager.entryInProgress[symbol];
        } else {
          console.log(`   🚫 CHECK 4 FAILED: Entry in progress (${age}s ago)`);
          console.log(`   === ENTRY BLOCKED ===\n`);
          return;
        }
      }
      console.log(`   ✅ CHECK 4: No entry in progress`);

      // CHECK 5: Cooldown check
      if (this.positionManager.isInCooldown(symbol)) {
        const remaining =
          45 -
          Math.floor(
            (Date.now() - this.positionManager.orderCooldown[symbol]) / 1000
          );
        console.log(
          `   🚫 CHECK 5 FAILED: Cooldown active (${remaining}s remaining)`
        );
        console.log(`   === ENTRY BLOCKED ===\n`);
        return;
      }
      console.log(`   ✅ CHECK 5: Not in cooldown`);

      // CHECK 6: Final exchange verification (race condition prevention)
      console.log(`   🔍 CHECK 6: Final exchange verification...`);
      const finalCheck = await this.exchange.getCurrentPosition(symbol);
      if (finalCheck && Math.abs(finalCheck.amount || 0) > 0.001) {
        console.log(`   🚫 CHECK 6 FAILED: Position appeared during checks!`);

        // Auto-track immediately
        this.positionManager.trackedPositions[symbol] = {
          side: finalCheck.side,
          entry: finalCheck.entry || finalCheck.entryPrice,
          amount: finalCheck.amount,
          sttpPlaced: false,
          entryTime: Date.now(),
          raceConditionTracked: true,
        };

        console.log(`   🔄 Position auto-tracked (race condition protection)`);
        console.log(`   === ENTRY BLOCKED ===\n`);
        return;
      }
      console.log(`   ✅ CHECK 6: Final verification passed`);

      console.log(`   ✅✅✅✅✅✅ ALL 6 CHECKS PASSED`);
      console.log(`   🟢 ENTRY ALLOWED\n`);

      // Execute entry (with internal validation)
      await this.positionManager.executeProfessionalEntry(
        symbol,
        analysis,
        currentPrice,
        this.dailyStats
      );

      console.log(`   === SCAN END ===\n`);
    } catch (error) {
      console.error(`❌ [${symbol}] Error:`, error.message);
    }
  }

  displayIndicatorsImproved(analysis, currentPrice, symbol) {
    console.log(`\n📈 ${config.timeframe} TECHNICAL INDICATORS:`);
    console.log(
      `   TEMA 9:     ${
        analysis.temaFast ? analysis.temaFast.toFixed(5) : "N/A"
      }`
    );
    console.log(
      `   TEMA 15:    ${
        analysis.temaMedium ? analysis.temaMedium.toFixed(5) : "N/A"
      }`
    );
    console.log(
      `   TEMA 200 (5m):  ${
        analysis.tema200_5m ? analysis.tema200_5m.toFixed(5) : "N/A"
      } | Price ${analysis.isAboveTEMA200_5m ? "✅ Above" : "❌ Below"} (${
        analysis.distanceFromTEMA200_5m
      }%)`
    );
    console.log(
      `   TEMA 100 (15m): ${
        analysis.tema100_15m ? analysis.tema100_15m.toFixed(5) : "N/A"
      } | Price ${analysis.isAboveTEMA100_15m ? "✅ Above" : "❌ Below"} (${
        analysis.distanceFromTEMA100_15m
      }%)`
    );
    console.log(`   TEMA Cross: ${analysis.temaCrossover || "N/A"}`);

    console.log(
      `   MACD:       ${
        analysis.macdLine ? analysis.macdLine.toFixed(6) : "N/A"
      }`
    );
    console.log(
      `   MACD Signal:${
        analysis.macdSignal ? analysis.macdSignal.toFixed(6) : "N/A"
      }`
    );
    console.log(
      `   MACD Histo: ${
        analysis.macdHistogram ? analysis.macdHistogram.toFixed(6) : "N/A"
      } ${analysis.macdHistogram > 0 ? "🟢" : "🔴"}`
    );

    if (analysis.dmiAdx) {
      console.log(
        `   DMI: ADX=${analysis.dmiAdx.toFixed(
          1
        )} +DI=${analysis.dmiPdi?.toFixed(1)} -DI=${analysis.dmiMdi?.toFixed(
          1
        )} | ${analysis.dmiSignal || "N/A"}`
      );
    }

    // ✅ FIXED: ATR display - get last value from array
    const atrValue =
      analysis.atr && Array.isArray(analysis.atr) && analysis.atr.length > 0
        ? analysis.atr[analysis.atr.length - 1]
        : analysis.atr || 0;
    console.log(`   ATR:        ${atrValue.toFixed(5)}`);

    console.log(
      `   Volume:     ${
        analysis.volumeRatio ? analysis.volumeRatio.toFixed(2) : "N/A"
      }x`
    );

    console.log(`\n🎪 MARKET ANALYSIS:`);
    console.log(`   Market Side: ${analysis.marketSide || "N/A"}`);
    console.log(`   Trend Filter: ${analysis.trendFilter || "N/A"}`);

    // ✅ NEW: Show TEMA filter status
    if (analysis.trendFilter === "NO_TRADE") {
      console.log(`   ⚠️ TEMA FILTER: NO TRADE ZONE - Conflicting signals`);
      console.log(
        `      5m TEMA 200: ${
          analysis.isAboveTEMA200_5m ? "Above ✅" : "Below ❌"
        }`
      );
      console.log(
        `      15m TEMA 100: ${
          analysis.isAboveTEMA100_15m ? "Above ✅" : "Below ❌"
        }`
      );
    } else if (analysis.trendFilter === "LONG_ONLY") {
      console.log(`   ✅ TEMA FILTER: LONG ONLY - Both above`);
    } else if (analysis.trendFilter === "SHORT_ONLY") {
      console.log(`   ✅ TEMA FILTER: SHORT ONLY - Both below`);
    }

    console.log(`   Trend Direction: ${analysis.trendDirection || "N/A"}`);
    console.log(
      `   Volume Confirmation: ${analysis.volumeConfirmation ? "✅" : "❌"}`
    );

    console.log(`\n📊 ENTRY CONDITIONS:`);
    const totalConditions = analysis.totalConditions || 8;
    const minScore = analysis.minScoreRequired || config.minSignalScore;

    console.log(
      `   LONG:  ${analysis.longScore}/${totalConditions} ${
        analysis.longScore >= minScore ? "✅ READY" : "❌"
      }`
    );
    console.log(
      `   SHORT: ${analysis.shortScore}/${totalConditions} ${
        analysis.shortScore >= minScore ? "✅ READY" : "❌"
      }`
    );
  }

  async run() {
    try {
      console.log("✅ Bot ready. Starting scanner...\n");
      console.log(
        "🛡️  DUPLICATE PROTECTION: ACTIVE - One position per token only"
      );
      console.log("🎯 DUAL TEMA FILTER: 5m TEMA 200 + 15m TEMA 100 ACTIVE");

      while (true) {
        try {
          const scanStartTime = Date.now();

          console.log("\n" + "=".repeat(100));
          console.log(`🔍 SCAN - ${new Date().toLocaleTimeString()}`);
          console.log("=".repeat(100));

          if (this.dailyStats.pnl < -config.maxDailyLoss * 100) {
            console.log(
              `🛑 DAILY LOSS LIMIT: ${this.dailyStats.pnl.toFixed(2)}%`
            );
            await this.sleep(3600000);
            continue;
          }

          for (const symbol of config.symbols) {
            try {
              const trades = await TradeDetails.findOne({
                symbol: symbol,
                status: "0",
                createdBy: ENVUSERID,
              });
              if (trades) {
                console.log(
                  `   🚫 [${symbol}] Skipping entry — trade already open in DB.`
                );
                return;
              }
              await this.processSymbolWithDetails(symbol);
            } catch (err) {
              console.error(`❌ [${symbol}]:`, err.message);
            }
            await this.sleep(500);
          }

          this.positionManager.displayOverallStats(this.dailyStats);

          const scanDuration = Date.now() - scanStartTime;
          const waitTime = Math.max(1000, config.scanInterval - scanDuration);

          console.log(`\n⏰ Next scan in ${(waitTime / 1000).toFixed(1)}s`);
          await this.sleep(waitTime);
        } catch (err) {
          console.error("❌ Loop error:", err.message);
          await this.sleep(10000);
        }
      }
    } catch (error) {
      console.error("❌ Startup error:", error);
      process.exit(1);
    }
  }
}

const bot = new TradingBot();
bot.run().catch((err) => {
  console.error("❌ Fatal:", err);
  process.exit(1);
});
