// positionManager.js - ULTIMATE DUPLICATE PREVENTION + OCO FIX
require("dotenv").config({ path: "../.env" });
const config = require("./config");
const TradeDetails = require("../backend/models/tradeDetails.js");
const ENVUSERID = process.env.USER_ID || "689c48ecdbd3da869cb3e0c5";

class PositionManager {
  constructor(exchange) {
    this.exchange = exchange;
    this.trackedPositions = {}; // { symbol: { side, entry, amount, ... } }
    this.orderCooldown = {}; // { symbol: timestamp }
    this.lastSTTPCheck = {}; // { symbol: timestamp }
    this.entryInProgress = {}; // { symbol: timestamp } - prevents race conditions

    // ✅ IMPROVED SL/TP SETTINGS
    this.ATR_LENGTH = config.ATR_LENGTH || 14;
    this.ATR_MULTIPLIER_SL = 0.5; //  ATR for SL (improved)
    this.ATR_MULTIPLIER_TP = 0.5; //  ATR for TP (improved)

    this.performanceStats = {
      bullish: { trades: 0, wins: 0, losses: 0, pnl: 0 },
      bearish: { trades: 0, wins: 0, losses: 0, pnl: 0 },
      neutral: { trades: 0, wins: 0, losses: 0, pnl: 0 },
    };

    // Auto-clean stale locks
    this.startLockCleaner();

    // ✅ NEW: Start position monitoring
    this.startPositionMonitoring();
  }

  async calculateDynamicPositionSize(symbol) {
    try {
      if (!config.ENABLE_DYNAMIC_ALLOCATION) {
        return config.positionSizeUSDT;
      }
      const balance = await this.exchange.client.fetchBalance();
      const availableUSDT = parseFloat(balance.USDT?.free || 0);

      if (availableUSDT < config.RESERVE_BALANCE) {
        console.log(`   ⚠️ Insufficient balance: ${availableUSDT} USDT`);
        return 0;
      }

      // Calculate tradeable balance
      const tradeableBalance = availableUSDT - config.RESERVE_BALANCE;

      // Divide by number of symbols
      const allocationPerSymbol = tradeableBalance / config.symbols.length;

      console.log(`   💰 Total Balance: ${availableUSDT.toFixed(2)} USDT`);
      console.log(`   🔒 Reserved: ${config.RESERVE_BALANCE} USDT`);
      console.log(`   📊 Tradeable: ${tradeableBalance.toFixed(2)} USDT`);
      console.log(
        `   🎯 Per Symbol (${
          config.symbols.length
        } coins): ${allocationPerSymbol.toFixed(2)} USDT`
      );

      return allocationPerSymbol;
    } catch (error) {
      console.error(`   ❌ Balance calculation error:`, error.message);
      return config.positionSizeUSDT; // Fallback to fixed size
    }
  }

  startLockCleaner() {
    setInterval(() => {
      const now = Date.now();
      const staleThreshold = 60000; // 60 seconds

      for (const symbol in this.entryInProgress) {
        const timeSince = now - this.entryInProgress[symbol];
        if (timeSince > staleThreshold) {
          console.log(
            `   🧹 [CLEANER] Auto-clearing stale lock for ${symbol} (${(
              timeSince / 1000
            ).toFixed(0)}s old)`
          );
          delete this.entryInProgress[symbol];
        }
      }
    }, 30000); // Check every 30 seconds
  }

  // ✅ NEW: Auto-monitor positions every 30 seconds
  startPositionMonitoring() {
    setInterval(async () => {
      try {
        await this.monitorPositions();
      } catch (error) {
        console.error("❌ Position monitoring error:", error.message);
      }
    }, 30000); // Check every 30 seconds
  }

  // ✅ Check if symbol has active position
  hasActivePosition(symbol) {
    return !!this.trackedPositions[symbol];
  }

  getPriceDecimals(symbol) {
    if (
      symbol.includes("BTC") ||
      symbol.includes("BNB") ||
      symbol.includes("ETH")
    )
      return 2;
    else if (symbol.includes("SOL")) return 3;
    else return 5;
  }

  roundToStepSize(symbol, amount) {
    if (symbol.includes("BTC")) return Math.floor(amount * 1000) / 1000;
    else if (symbol.includes("ETH") || symbol.includes("BNB"))
      return Math.floor(amount * 100) / 100;
    else if (symbol.includes("SOL")) return Math.floor(amount * 10) / 10;
    else return Math.floor(amount);
  }

  isInCooldown(symbol) {
    return (
      this.orderCooldown[symbol] &&
      Date.now() - this.orderCooldown[symbol] < 45000
    );
  }

  setCooldown(symbol) {
    this.orderCooldown[symbol] = Date.now();
  }

  getATRBasedSLTP(currentPrice, atr, side, symbol) {
    try {
      let stopLossPrice, takeProfitPrice;

      // ✅ IMPROVED: Minimum SL distance for safety
      const minSLDistance = currentPrice * 0.002; // 0.2% minimum SL
      const calculatedSLDistance = atr * this.ATR_MULTIPLIER_SL;
      const finalSLDistance = Math.max(calculatedSLDistance, minSLDistance);

      const tpDistance = atr * this.ATR_MULTIPLIER_TP;

      if (side === "LONG" || side === "BUY" || side === "buy") {
        stopLossPrice = parseFloat(
          (currentPrice - finalSLDistance).toFixed(
            this.getPriceDecimals(symbol)
          )
        );
        takeProfitPrice = parseFloat(
          (currentPrice + tpDistance).toFixed(this.getPriceDecimals(symbol))
        );
      } else {
        stopLossPrice = parseFloat(
          (currentPrice + finalSLDistance).toFixed(
            this.getPriceDecimals(symbol)
          )
        );
        takeProfitPrice = parseFloat(
          (currentPrice - tpDistance).toFixed(this.getPriceDecimals(symbol))
        );
      }

      console.log(
        `   📏 ATR=${atr.toFixed(5)} | SL Distance=${finalSLDistance.toFixed(
          5
        )} | TP Distance=${tpDistance.toFixed(5)} | ROI: ${(
          (tpDistance / currentPrice) *
          100
        ).toFixed(2)}%`
      );

      return { stopLossPrice, takeProfitPrice };
    } catch (error) {
      console.error("   ❌ ATR SL/TP error:", error.message);
      const stopLossDistance = currentPrice * 0.01; // 1% fixed
      const takeProfitDistance = stopLossDistance * config.riskRewardRatio;

      if (side === "LONG" || side === "BUY" || side === "buy") {
        return {
          stopLossPrice: currentPrice - stopLossDistance,
          takeProfitPrice: currentPrice + takeProfitDistance,
        };
      } else {
        return {
          stopLossPrice: currentPrice + stopLossDistance,
          takeProfitPrice: currentPrice - takeProfitDistance,
        };
      }
    }
  }

  trackTradePerformance(symbol, side, marketSide, pnl, isWin) {
    const sideKey = marketSide
      ? marketSide.toLowerCase().replace(" ", "_")
      : "neutral";
    const stats =
      this.performanceStats[sideKey] || this.performanceStats.neutral;

    stats.trades++;
    stats.pnl += pnl;
    if (isWin) stats.wins++;
    else stats.losses++;
  }

  async placeSTTPOrders(symbol, side, amount, stopLoss, takeProfit) {
    try {
      const stopSide = side === "buy" ? "sell" : "buy";

      console.log(`   🔧 Placing SL/TP orders (OCO)...`);
      console.log(`   🛑 SL: ${stopLoss} | 🎯 TP: ${takeProfit}`);

      await this.exchange.sleep(1000);

      let stopOrderId = null;
      let tpOrderId = null;

      // Place Stop Loss
      try {
        const stopOrder = await this.exchange.createOrder(
          symbol,
          "STOP_MARKET",
          stopSide,
          amount,
          null,
          {
            stopPrice: stopLoss,
            reduceOnly: true,
            workingType: "MARK_PRICE",
            priceProtect: true,
          }
        );
        stopOrderId = stopOrder.id;
        console.log(`   🛑 SL placed: ${stopOrderId}`);
      } catch (error) {
        console.error(`   ❌ SL failed:`, error.message);
      }

      // Place Take Profit
      try {
        const tpOrder = await this.exchange.createOrder(
          symbol,
          "TAKE_PROFIT_MARKET",
          stopSide,
          amount,
          null,
          {
            stopPrice: takeProfit,
            reduceOnly: true,
            workingType: "MARK_PRICE",
            priceProtect: true,
          }
        );
        tpOrderId = tpOrder.id;
        console.log(`   🎯 TP placed: ${tpOrderId}`);
      } catch (error) {
        console.error(`   ❌ TP failed:`, error.message);
      }

      await this.exchange.sleep(2000);
      const verified = await this.verifySTTPOrders(
        symbol,
        stopOrderId,
        tpOrderId
      );

      return { success: verified, stopOrderId, tpOrderId };
    } catch (error) {
      console.error(`   ❌ STTP placement failed:`, error.message);
      return { success: false, stopOrderId: null, tpOrderId: null };
    }
  }

  async verifySTTPOrders(symbol, stopOrderId, tpOrderId) {
    try {
      await this.exchange.sleep(3000);
      const openOrders = await this.exchange.fetchOpenOrders(symbol);

      const stopExists = openOrders.some((o) => o.type === "STOP_MARKET");
      const tpExists = openOrders.some((o) => o.type === "TAKE_PROFIT_MARKET");

      console.log(
        `   🔍 Verified: SL ${stopExists ? "✅" : "❌"} | TP ${
          tpExists ? "✅" : "❌"
        }`
      );

      return stopExists && tpExists;
    } catch (error) {
      console.error(`   ❌ Verification failed:`, error.message);
      return false;
    }
  }

  // ✅ NEW: Monitor positions and handle OCO cleanup
  async monitorPositions() {
    try {
      // ✅ Get all open positions from exchange
      const positions = await this.exchange.client.fetchPositions();

      // ✅ Filter only positions that are actually open (positionAmt != 0)
      const openPositions = positions.filter((p) => {
        const amt = parseFloat(p.info?.positionAmt || 0);
        return Math.abs(amt) > 0;
      });

      console.log(`\n🔍 Monitoring ${config.symbols.length} symbols...`);

      for (const sym of config.symbols) {
        // ✅ Find open trade from DB for this symbol
        const trade = await TradeDetails.findOne({
          symbol: sym,
          status: "0",
          createdBy: ENVUSERID,
        });

        // ✅ Check if position exists on exchange for this symbol
        let livePos = null;
        if (openPositions.length > 0) {
          livePos = openPositions.find((p) => {
            const exchangeSymbol = p.symbol; // 'XRP/USDT:USDT'
            const dbSymbol = sym; // 'XRP/USDT'

            // Match symbols (handle both formats)
            return (
              exchangeSymbol === dbSymbol ||
              exchangeSymbol.replace(":USDT", "") === dbSymbol ||
              p.info?.symbol === dbSymbol.replace("/", "")
            );
          });
        }

        // ✅ CASE 1: Both DB trade AND exchange position exist → Skip (all good)
        if (trade && livePos) {
          console.log(
            `   🔒 [${sym}] Position active on exchange & DB — skipping`
          );
          continue;
        }

        // ✅ CASE 2: DB trade exists BUT no exchange position → Clean up
        if (trade && !livePos) {
          console.log(
            `   🔔 [${sym}] DB has open trade but NO exchange position — cleaning up`
          );

          // Cancel all SL/TP orders for this symbol
          const openOrders = await this.exchange.fetchOpenOrders(sym);
          console.log(
            `   📋 Found ${openOrders.length} open orders for ${sym}`
          );

          let canceledCount = 0;

          for (const order of openOrders) {
            // ✅ FIXED: Check both normalized type and original type
            const orderType = order.type?.toLowerCase(); // 'take_profit_market', 'stop_market'
            const isReduceOnly =
              order.reduceOnly === true || order.info?.reduceOnly === true;

            const isSLTPOrder =
              (orderType === "stop_market" ||
                orderType === "take_profit_market" ||
                order.info?.type === "STOP_MARKET" ||
                order.info?.type === "TAKE_PROFIT_MARKET") &&
              isReduceOnly;

            if (isSLTPOrder) {
              try {
                console.log(
                  `      🗑️ Canceling ${order.type} order: ${order.id}`
                );
                await this.exchange.cancelOrder(order.id, sym);
                console.log(
                  `      ✅ Canceled ${order.type} order: ${order.id}`
                );
                canceledCount++;
                await this.exchange.sleep(500); // Small delay between cancellations
              } catch (err) {
                console.error(
                  `      ⚠️ Failed to cancel order ${order.id}:`,
                  err.message
                );
              }
            } else {
              console.log(
                `      ⏭️ Skipping order ${order.id} (type: ${order.type}, reduceOnly: ${order.reduceOnly})`
              );
            }
          }

          if (canceledCount === 0) {
            console.log(`      ℹ️ No SL/TP orders to cancel for ${sym}`);
          } else {
            console.log(`      ✅ Canceled ${canceledCount} orders for ${sym}`);
          }

          // Update DB status to closed (1)
          await TradeDetails.findOneAndUpdate(
            { _id: trade._id, createdBy: ENVUSERID },
            { status: "1" }
          );

          console.log(`   🔄 [${sym}] Status updated to CLOSED in DB`);

          // Remove from tracked positions
          if (this.trackedPositions[sym]) {
            delete this.trackedPositions[sym];
            console.log(`   🗑️ [${sym}] Removed from tracked positions`);
          }
        }

        // ✅ CASE 3: No DB trade, no position → Nothing to do
        if (!trade && !livePos) {
          // Silent - this is normal
          continue;
        }

        // ✅ CASE 4: Exchange position exists but no DB trade → Warning (shouldn't happen)
        if (!trade && livePos) {
          console.log(
            `   ⚠️ [${sym}] Exchange position exists but NO DB record!`
          );
          // You might want to handle this case differently
        }
      }

      console.log(`✅ Position monitoring completed\n`);
    } catch (error) {
      console.error("❌ Position monitoring error:", error.message);
    }
  }

  async placeOrderWithSTTP(symbol, side, currentPrice, analysis, marketSide) {
    try {
      console.log(`\n🚀 [${symbol}] === ORDER PLACEMENT ===`);
      console.log(`   🔒 Setting entry lock...`);
      this.entryInProgress[symbol] = Date.now();

      const dynamicPositionSize = await this.calculateDynamicPositionSize(
        symbol
      );

      if (dynamicPositionSize === 0) {
        console.log(`   ❌ Insufficient balance for ${symbol}`);
        delete this.entryInProgress[symbol];
        return null;
      }

      const notionalValue = dynamicPositionSize * config.leverage;
      const amount = notionalValue / currentPrice;
      const roundedAmount = this.roundToStepSize(symbol, amount);

      console.log(
        `   💰 Allocated Balance: ${dynamicPositionSize.toFixed(2)} USDT`
      );
      console.log(`   📊 Leverage: ${config.leverage}x`);
      console.log(
        `   💵 Total Position Value: ${notionalValue.toFixed(2)} USDT`
      );
      console.log(`   📦 Amount: ${roundedAmount} ${symbol.split("/")[0]}`);
      let stopLoss, takeProfit;

      if (analysis.atr && analysis.atr.length > 0) {
        const atrValue = analysis.atr[analysis.atr.length - 1];
        const sltp = this.getATRBasedSLTP(currentPrice, atrValue, side, symbol);
        stopLoss = sltp.stopLossPrice;
        takeProfit = sltp.takeProfitPrice;
      } else {
        stopLoss = side === "buy" ? analysis.longStop : analysis.shortStop;
        takeProfit =
          side === "buy" ? analysis.longTakeProfit : analysis.shortTakeProfit;
      }

      console.log(
        `   📋 ${side.toUpperCase()} ${roundedAmount} @ ${currentPrice.toFixed(
          this.getPriceDecimals(symbol)
        )}`
      );
      console.log(
        `   📏 SL: ${stopLoss.toFixed(
          this.getPriceDecimals(symbol)
        )} | TP: ${takeProfit.toFixed(this.getPriceDecimals(symbol))}`
      );

      await this.exchange.sleep(2000);
      // Place market order
      const order = await this.exchange.createOrder(
        symbol,
        "market",
        side,
        roundedAmount
      );
      console.log(`   ✅ Market order placed: ${order.id}`);

      await this.exchange.sleep(3000);

      // Place SL/TP
      const sttpResult = await this.placeSTTPOrders(
        symbol,
        side,
        roundedAmount,
        stopLoss,
        takeProfit
      );

      this.setCooldown(symbol);

      // ✅ Clear entry lock AFTER successful order
      delete this.entryInProgress[symbol];
      console.log(`   🔓 Entry lock cleared`);

      return {
        order,
        amount: roundedAmount,
        sttpPlaced: sttpResult.success,
        stopOrderId: sttpResult.stopOrderId,
        tpOrderId: sttpResult.tpOrderId,
        marketSide,
        stopLoss,
        takeProfit,
      };
    } catch (error) {
      console.error(`❌ Order placement failed:`, error.message);

      // Clear lock on error
      delete this.entryInProgress[symbol];
      console.log(`   🔓 Entry lock cleared (error)`);

      return null;
    }
  }

  // ✅ MAIN ENTRY FUNCTION: Executes trade with all protections
  async executeProfessionalEntry(symbol, analysis, currentPrice, dailyStats) {
    try {
      console.log(`\n🎯 [${symbol}] === ENTRY EXECUTION START ===`);

      // ✅ PROTECTION 3: Check signals
      const minScore = analysis.minScoreRequired || config.minSignalScore;
      const hasLongSignal =
        analysis.longEntry && analysis.longScore >= minScore;
      // const hasShortSignal =
      //   analysis.shortEntry && analysis.shortScore >= minScore;
      const hasShortSignal = true;

      if (!hasLongSignal && !hasShortSignal) {
        console.log(
          `   ⏸️  No valid signal (L:${analysis.longScore}/${minScore} S:${analysis.shortScore}/${minScore})`
        );
        console.log(`   === ENTRY ABORTED ===\n`);
        return;
      }

      let result;
      let side;
      if (hasLongSignal) {
        side = "LONG";
        console.log(
          `\n🟢 LONG ENTRY CONFIRMED (${analysis.longScore}/${minScore})`
        );

        result = await this.placeOrderWithSTTP(
          symbol,
          "buy",
          currentPrice,
          analysis,
          analysis.marketSide
        );

        if (result && result.order) {
          // ✅ IMMEDIATE TRACKING
          this.trackedPositions[symbol] = {
            side: "long",
            entry: currentPrice,
            takeProfit: result.takeProfit,
            stopLoss: result.stopLoss,
            amount: result.amount,
            sttpPlaced: result.sttpPlaced,
            stopOrderId: result.stopOrderId,
            tpOrderId: result.tpOrderId,
            marketSide: analysis.marketSide,
            entryTime: Date.now(),
          };
          dailyStats.trades++;

          console.log(`   ✅ LONG position tracked - ${symbol} LOCKED 🔒`);
          console.log(
            `   🚫 No new trades allowed for ${symbol} until position closes`
          );
        }
      } else if (hasShortSignal) {
        side = "SHORT";
        console.log(
          `\n🔴 SHORT ENTRY CONFIRMED (${analysis.shortScore}/${minScore})`
        );

        result = await this.placeOrderWithSTTP(
          symbol,
          "sell",
          currentPrice,
          analysis,
          analysis.marketSide
        );

        if (result && result.order) {
          // ✅ IMMEDIATE TRACKING
          this.trackedPositions[symbol] = {
            side: "short",
            entry: currentPrice,
            takeProfit: result.takeProfit,
            stopLoss: result.stopLoss,
            amount: result.amount,
            sttpPlaced: result.sttpPlaced,
            stopOrderId: result.stopOrderId,
            tpOrderId: result.tpOrderId,
            marketSide: analysis.marketSide,
            entryTime: Date.now(),
          };
          dailyStats.trades++;

          console.log(`   ✅ SHORT position tracked - ${symbol} LOCKED 🔒`);
          console.log(
            `   🚫 No new trades allowed for ${symbol} until position closes`
          );
        }
      }

      if (!result || !result?.order) {
        console.error(
          `   ❌ Order placement failed for ${symbol}, no DB record created.`
        );
        delete this.entryInProgress[symbol];
        return;
      }

      const tradeData = {
        symbol,
        side,
        placeOrderId: result?.order?.id,
        quantity: result?.amount.toString(),
        LongTimeCoinPrice: currentPrice,
        ShortTimeCurrentPrice: currentPrice,
        stopLossPrice: result?.stopLoss.toString(),
        takeProfitPrice: result?.takeProfit.toString(),
        stopLossOrderId: result?.stopOrderId,
        takeProfitOrderId: result?.tpOrderId,
        marginUsed: result?.amount,
        createdBy: ENVUSERID,
        leverage: config.leverage.toString(),
      };

      const createdTrade = await TradeDetails.create(tradeData);
      console.log(`   ✅ Trade saved in DB: ${createdTrade._id}`);
      console.log(`   === ENTRY EXECUTION END ===\n`);
    } catch (error) {
      console.error(`   ❌ Entry execution error:`, error.message);

      // Clear lock on error
      delete this.entryInProgress[symbol];
    }
  }

  displayOverallStats(stats) {
    console.log("\n" + "=".repeat(100));
    console.log(
      `💼 DAILY STATS: Trades: ${stats.trades} | PnL: ${stats.pnl.toFixed(
        2
      )}% | Active Positions: ${Object.keys(this.trackedPositions).length}`
    );

    // Performance breakdown
    console.log(`\n📊 PERFORMANCE BY MARKET SIDE:`);
    for (const [side, sideStats] of Object.entries(this.performanceStats)) {
      if (sideStats.trades > 0) {
        const winRate = ((sideStats.wins / sideStats.trades) * 100).toFixed(1);
        console.log(
          `   ${side.toUpperCase()}: ${
            sideStats.trades
          } trades | Win Rate: ${winRate}% | PnL: ${sideStats.pnl.toFixed(2)}%`
        );
      }
    }

    // Cooldowns
    const cooldownSymbols = Object.keys(this.orderCooldown).filter(
      (sym) => Date.now() - this.orderCooldown[sym] < 45000
    );
    if (cooldownSymbols.length > 0) {
      console.log(`\n⏳ COOLDOWN (45s): ${cooldownSymbols.join(", ")}`);
    }

    console.log("=".repeat(100));
  }
}

module.exports = PositionManager;
