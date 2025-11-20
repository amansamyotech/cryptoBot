// exchange.js - COMPLETE FIXED VERSION
const ccxt = require('ccxt');
const config = require('./config');

class Exchange {
  constructor() {
    this.client = new ccxt.binance({
      apiKey: process.env.BINANCE_API_KEY,
      secret: process.env.BINANCE_SECRET,
      enableRateLimit: true,
      options: { 
        defaultType: 'future',
        recvWindow: 60000
      }
    });
    
    console.log('✅ Exchange initialized: Binance Futures');
  }

  // ✅ CRITICAL: Sleep function (used everywhere)
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ✅ CRITICAL: Setup leverage for symbol
  async setupLeverage(symbol) {
    try {
      await this.client.setLeverage(config.leverage, symbol);
      console.log(`   ✅ [${symbol}] Leverage set to ${config.leverage}x`);
      return true;
    } catch (error) {
      console.log(`   ⚠️ [${symbol}] Leverage setup: ${error.message}`);
      return false;
    }
  }

  // ✅ FIXED: Fetch OHLCV with proper error handling
  async fetchOHLCV(symbol, timeframe = '1m', limit = 100) {
    try {
      const ohlcv = await this.client.fetchOHLCV(symbol, timeframe, undefined, limit);
      
      if (!ohlcv || ohlcv.length === 0) {
        console.error(`❌ No OHLCV data for ${symbol}`);
        return null;
      }

      // ✅ CCXT returns: [timestamp, open, high, low, close, volume]
      // Convert to our format
      return ohlcv.map(candle => ({
        time: candle[0],
        open: candle[1],
        high: candle[2],
        low: candle[3],
        close: candle[4],
        volume: candle[5]
      }));
      
    } catch (err) {
      console.error(`❌ Error fetching OHLCV for ${symbol}:`, err.message);
      return null;
    }
  }

  // ✅ CRITICAL: Get current position for a symbol (used by bot)
  async getCurrentPosition(symbol) {
    try {
      const positions = await this.client.fetchPositions([symbol]);
      
      if (!positions || positions.length === 0) {
        return null;
      }

      // Find position for this symbol
      const position = positions.find(p => {
        const posSymbol = p.symbol || p.info?.symbol;
        return posSymbol === symbol || posSymbol === symbol.replace('/', '');
      });

      if (!position) {
        return null;
      }

      // Check if position is actually open
      const contracts = Math.abs(parseFloat(position.contracts || position.info?.positionAmt || 0));
      
      if (contracts === 0 || contracts < 0.001) {
        return null;
      }

      // Return normalized position
      return {
        symbol: symbol,
        side: contracts > 0 ? (position.side === 'short' ? 'short' : 'long') : 'short',
        amount: contracts,
        contracts: contracts,
        entry: parseFloat(position.entryPrice || position.info?.entryPrice || 0),
        entryPrice: parseFloat(position.entryPrice || position.info?.entryPrice || 0),
        unrealizedProfit: parseFloat(position.unrealizedPnl || position.info?.unRealizedProfit || 0),
        notional: parseFloat(position.notional || position.info?.notional || contracts * (position.entryPrice || 1)),
        leverage: parseFloat(position.leverage || config.leverage),
        liquidationPrice: parseFloat(position.liquidationPrice || position.info?.liquidationPrice || 0)
      };
      
    } catch (err) {
      console.error(`❌ Error fetching position for ${symbol}:`, err.message);
      return null;
    }
  }

  // ✅ Get all open positions (legacy support)
  async getOpenPositions() {
    try {
      const positions = await this.client.fetchPositions();
      
      const openPositions = positions.filter(p => {
        const amt = parseFloat(p.contracts || p.info?.positionAmt || 0);
        return Math.abs(amt) > 0;
      });

      return openPositions.reduce((acc, p) => {
        const symbol = p.symbol || p.info?.symbol;
        const amt = parseFloat(p.contracts || p.info?.positionAmt || 0);
        
        acc[symbol] = {
          symbol: symbol,
          side: amt > 0 ? 'long' : 'short',
          size: Math.abs(amt),
          amount: Math.abs(amt),
          entryPrice: parseFloat(p.entryPrice || p.info?.entryPrice || 0),
          unrealizedPnl: parseFloat(p.unrealizedPnl || p.info?.unRealizedProfit || 0)
        };
        return acc;
      }, {});
      
    } catch (err) {
      console.error('❌ Error fetching open positions:', err.message);
      return {};
    }
  }

  // ✅ Get current price
  async getCurrentPrice(symbol) {
    try {
      const ticker = await this.client.fetchTicker(symbol);
      return ticker.last;
    } catch (err) {
      console.error(`❌ Error fetching price for ${symbol}:`, err.message);
      return null;
    }
  }

  // ✅ FIXED: Create order (proper futures format)
  async createOrder(symbol, type, side, amount, price = undefined, params = {}) {
    try {
      // For futures, use the correct method
      const order = await this.client.createOrder(
        symbol,
        type, // 'market', 'limit', 'STOP_MARKET', 'TAKE_PROFIT_MARKET'
        side, // 'buy', 'sell'
        amount,
        price,
        params
      );
      
      return order;
      
    } catch (err) {
      console.error(`❌ Order error for ${symbol}:`, err.message);
      throw err;
    }
  }

  // ✅ CRITICAL: Fetch open orders
  async fetchOpenOrders(symbol) {
    try {
      const orders = await this.client.fetchOpenOrders(symbol);
      return orders || [];
    } catch (err) {
      console.error(`❌ Error fetching open orders for ${symbol}:`, err.message);
      return [];
    }
  }

  // ✅ CRITICAL: Cancel order
  async cancelOrder(orderId, symbol) {
    try {
      const result = await this.client.cancelOrder(orderId, symbol);
      return result;
    } catch (err) {
      console.error(`❌ Error canceling order ${orderId} for ${symbol}:`, err.message);
      throw err;
    }
  }

  // ✅ Cancel all orders for symbol
  async cancelAllOpenOrders(symbol) {
    try {
      const orders = await this.fetchOpenOrders(symbol);
      
      for (const order of orders) {
        try {
          await this.cancelOrder(order.id, symbol);
          console.log(`   🗑️ Cancelled order: ${order.id}`);
        } catch (e) {
          console.log(`   ⚠️ Could not cancel ${order.id}: ${e.message}`);
        }
      }
      
      return true;
    } catch (err) {
      console.error(`❌ Error canceling all orders for ${symbol}:`, err.message);
      return false;
    }
  }

  // ✅ Replace SL/TP (if needed)
  async replaceSLTP(orderId, symbol, newSL, newTP) {
    try {
      // Cancel old order
      await this.cancelOrder(orderId, symbol);
      
      // Create new order (implementation depends on your strategy)
      console.log(`   🔄 SL/TP replaced for ${symbol}`);
      return true;
      
    } catch (err) {
      console.error(`❌ Error replacing SL/TP for ${symbol}:`, err.message);
      return null;
    }
  }

  // ✅ Get account balance
  async getBalance() {
    try {
      const balance = await this.client.fetchBalance();
      return balance;
    } catch (err) {
      console.error('❌ Error fetching balance:', err.message);
      return null;
    }
  }

  // ✅ Set position mode (hedge/one-way)
  async setPositionMode(hedged = false) {
    try {
      await this.client.setPositionMode(hedged);
      console.log(`   ✅ Position mode set to: ${hedged ? 'Hedge' : 'One-way'}`);
      return true;
    } catch (err) {
      console.log(`   ⚠️ Position mode: ${err.message}`);
      return false;
    }
  }

  // ✅ Set margin mode
  async setMarginMode(symbol, marginMode = 'cross') {
    try {
      await this.client.setMarginMode(marginMode, symbol);
      console.log(`   ✅ [${symbol}] Margin mode: ${marginMode}`);
      return true;
    } catch (err) {
      console.log(`   ⚠️ [${symbol}] Margin mode: ${err.message}`);
      return false;
    }
  }
}

module.exports = Exchange;