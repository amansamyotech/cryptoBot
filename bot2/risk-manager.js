// risk-manager.js - FIXED & OPTIMIZED
require("dotenv").config({ path: "../.env" });
const config = require('./config');

class RiskManager {
  constructor() {
    this.dailyStats = {
      pnl: 0,
      trades: 0,
      startTime: Date.now(),
      activePositions: 0
    };

    this.trackedPositions = {}; // all coins being traded
  }

  calculateStopLossTakeProfit(currentPrice, atr, side) {
    const atrMultiplier = config.atrMultiplier || 1.5;
    const stopLossDistance = atr ? (atr * atrMultiplier) : (currentPrice * 0.02);
    const takeProfitDistance = stopLossDistance * config.riskRewardRatio;

    return side === 'long'
      ? {
          stopLoss: currentPrice - stopLossDistance,
          takeProfit: currentPrice + takeProfitDistance,
          stopLossDistance,
          takeProfitDistance
        }
      : {
          stopLoss: currentPrice + stopLossDistance,
          takeProfit: currentPrice - takeProfitDistance,
          stopLossDistance,
          takeProfitDistance
        };
  }

  canTrade() {
    if (this.dailyStats.pnl <= -config.maxDailyLoss * 100) {
      console.log('🚫 Daily loss limit reached');
      return false;
    }
    return true;
  }

  updateTradeResult(profit) {
    this.dailyStats.pnl += profit;
    this.dailyStats.trades++;
  }

  trackPosition(symbol, positionData) {
    this.trackedPositions[symbol] = {
      ...positionData,
      entryTime: Date.now()
    };
    this.dailyStats.activePositions = Object.keys(this.trackedPositions).length;
  }

  removePosition(symbol) {
    delete this.trackedPositions[symbol];
    this.dailyStats.activePositions = Object.keys(this.trackedPositions).length;
  }

  getPosition(symbol) {
    return this.trackedPositions[symbol] || null;
  }

  hasOpenPosition(symbol) {
    return !!this.trackedPositions[symbol];
  }

  displayStats() {
    console.log('\n' + '='.repeat(120));
    console.log(`💼 RISK STATS: Trades: ${this.dailyStats.trades} | PnL: ${this.dailyStats.pnl.toFixed(2)}% | Active: ${this.dailyStats.activePositions}`);

    if (this.dailyStats.activePositions > 0) {
      console.log(`\n📍 ACTIVE POSITIONS:`);
      for (const [sym, pos] of Object.entries(this.trackedPositions)) {
        const timeHeld = Math.floor((Date.now() - pos.entryTime) / 60000);
        console.log(`   ${sym}: ${pos.side.toUpperCase()} | Entry: ${pos.entry.toFixed(5)} | Time: ${timeHeld}min`);
      }
    }
    console.log('='.repeat(120));
  }
}

module.exports = RiskManager;
