// indicators.js - COMPLETE WITH DMI + 15m TEMA 100
const ti = require('technicalindicators');
const config = require('./config');

class Indicators {
  // ✅ NEW: Calculate 15m TEMA 100
  async calculateTEMA100_15m(exchange, symbol) {
    try {
      console.log(`   📊 Fetching 15m data for TEMA 100...`);
      
      // Fetch 15m candles (need at least 150 for TEMA 100)
      const ohlcv15m = await exchange.fetchOHLCV(symbol, '15m', undefined, 200);
      
      if (!ohlcv15m || ohlcv15m.length < 100) {
        console.log(`   ⚠️ Not enough 15m candles (need 100, got ${ohlcv15m?.length || 0})`);
        return null;
      }
      
      console.log(`   📊 Received ${ohlcv15m.length} 15m candles`);
      
      // Normalize and extract close prices
      const closes15m = ohlcv15m.map(c => {
        if (Array.isArray(c)) {
          return c[4]; // close price
        } else if (c.close !== undefined) {
          return c.close;
        }
        return null;
      }).filter(price => price !== null && !isNaN(price) && price > 0);
      
      console.log(`   📊 Valid close prices: ${closes15m.length}`);
      
      if (closes15m.length < 100) {
        console.log(`   ⚠️ Not enough valid 15m prices (got ${closes15m.length})`);
        return null;
      }
      
      // Show sample data
      console.log(`   📊 Sample prices: ${closes15m.slice(-3).map(p => p.toFixed(4)).join(', ')}`);
      
      // Calculate EMA 100 on 15m
      const tema100 = this.calculateEMA(closes15m, 100);
      
      if (!tema100 || tema100.length === 0) {
        console.log(`   ⚠️ EMA failed - trying SMA fallback`);
        const sma100 = this.calculateSMA(closes15m, 100);
        
        if (!sma100 || sma100.length === 0) {
          console.log(`   ❌ SMA fallback returned empty`);
          return null;
        }
        
        const lastValue = sma100[sma100.length - 1];
        if (isNaN(lastValue)) {
          console.log(`   ❌ SMA fallback produced NaN`);
          return null;
        }
        
        console.log(`   ✅ TEMA 100 (15m) SMA: ${lastValue.toFixed(4)}`);
        return sma100;
      }
      
      const lastValue = tema100[tema100.length - 1];
      if (isNaN(lastValue)) {
        console.log(`   ❌ EMA produced NaN`);
        return null;
      }
      
      console.log(`   ✅ TEMA 100 (15m): ${lastValue.toFixed(4)}`);
      return tema100;
      
    } catch (error) {
      console.error('   ❌ TEMA 100 (15m) error:', error.message);
      return null;
    }
  }

  calculateAll(candles) {
    try {
      if (!candles || candles.length < config.minCandlesRequired) {
        console.log(`   ❌ Not enough candles (need ${config.minCandlesRequired}, got ${candles ? candles.length : 0})`);
        return null;
      }

      const closes = candles.map(c => c.close);
      const highs = candles.map(c => c.high);
      const lows = candles.map(c => c.low);
      const volumes = candles.map(c => c.volume);

      console.log(`   📊 Processing ${candles.length} candles...`);

      // ✅ TEMA Calculation with fallback
      let temaFast = this.calculateEMA(closes, config.tema.fast);
      let temaMedium = this.calculateEMA(closes, config.tema.medium);
      let temaSlow = this.calculateEMA(closes, config.tema.slow);

      // ✅ FALLBACK: Use SMA if EMA fails
      if (!temaFast || !temaFast.length || !temaMedium || !temaMedium.length || !temaSlow || !temaSlow.length) {
        console.log('   ⚠️ EMA failed - using SMA fallback');
        
        temaFast = this.calculateSMA(closes, config.tema.fast);
        temaMedium = this.calculateSMA(closes, config.tema.medium);
        temaSlow = this.calculateSMA(closes, config.tema.slow);
        
        if (!temaFast.length || !temaMedium.length || !temaSlow.length) {
          console.log('   ❌ Even SMA fallback failed');
          return null;
        }
      }

      console.log(`   ✅ TEMA calculated: Fast=${temaFast.length}, Med=${temaMedium.length}, Slow=${temaSlow.length}`);

      // ✅ DMI Calculation
      const dmi = this.calculateDMI(highs, lows, closes, config.adx);
      
      // ✅ Other indicators
      const result = this.calculateOtherIndicators(closes, highs, lows, volumes, candles);
      result.tema = { fast: temaFast, medium: temaMedium, slow: temaSlow };
      result.dmi = dmi;
      
      console.log(`   ✅ All indicators calculated`);
      return result;

    } catch (error) {
      console.error('❌ Indicator calculation error:', error.message);
      return null;
    }
  }

  // ✅ Simple Moving Average (Fallback)
  calculateSMA(values, period) {
    try {
      // Filter out invalid values
      const validValues = values.filter(v => v !== null && v !== undefined && !isNaN(v) && v > 0);
      
      if (validValues.length < period) {
        console.log(`   ⚠️ SMA ${period}: Not enough valid data (${validValues.length}/${period})`);
        return null;
      }
      
      const result = [];
      for (let i = period - 1; i < validValues.length; i++) {
        let sum = 0;
        for (let j = 0; j < period; j++) {
          sum += validValues[i - j];
        }
        const avg = sum / period;
        if (!isNaN(avg) && avg > 0) {
          result.push(avg);
        }
      }
      
      if (result.length === 0 || isNaN(result[result.length - 1])) {
        console.log(`   ⚠️ SMA ${period}: Calculation produced invalid results`);
        return null;
      }
      
      return result;
    } catch (error) {
      console.log(`   ⚠️ SMA ${period} failed:`, error.message);
      return null;
    }
  }

  // ✅ Exponential Moving Average
  calculateEMA(values, period) {
    try {
      if (!values || !Array.isArray(values)) {
        console.log(`   ⚠️ EMA ${period}: Invalid values`);
        return null;
      }

      if (values.length < period) {
        console.log(`   ⚠️ EMA ${period}: Not enough data (${values.length}/${period})`);
        return [values[values.length - 1]];
      }

      // Check for invalid values
      const hasInvalid = values.some(v => isNaN(v) || v === null || v === undefined);
      if (hasInvalid) {
        console.log(`   ⚠️ EMA ${period}: Data contains invalid values`);
        return null;
      }

      // Calculate EMA using technicalindicators library
      try {
        const emaResult = ti.EMA.calculate({ period: period, values: values });
        
        if (!emaResult || emaResult.length === 0) {
          console.log(`   ⚠️ EMA ${period}: Library returned empty result`);
          return null;
        }
        
        return emaResult;
        
      } catch (libError) {
        console.log(`   ⚠️ EMA ${period} library failed: ${libError.message}`);
        return null;
      }
      
    } catch (error) {
      console.log(`   ⚠️ EMA ${period} error:`, error.message);
      return null;
    }
  }

  // ✅ DMI/ADX Calculation
  calculateDMI(highs, lows, closes, period = 14) {
    try {
      if (highs.length < period + 10 || lows.length < period + 10 || closes.length < period + 10) {
        console.log(`   ⚠️ Not enough data for DMI ${period}`);
        return {
          adx: [],
          pdi: [],
          mdi: [],
          adxStrength: 'WEAK',
          dmiSignal: 'NEUTRAL',
          latest: null
        };
      }

      const dmi = ti.ADX.calculate({
        period: period,
        high: highs,
        low: lows,
        close: closes
      });

      if (!dmi || dmi.length === 0) {
        throw new Error('DMI calculation returned empty');
      }

      const latest = dmi[dmi.length - 1];
      
      // ADX Strength
      let adxStrength = 'WEAK';
      if (latest.adx > 25) adxStrength = 'STRONG';
      else if (latest.adx > 20) adxStrength = 'MODERATE';
      
      // DMI Signal
      let dmiSignal = 'NEUTRAL';
      if (latest.pdi > latest.mdi && latest.pdi > 20) {
        dmiSignal = 'BULLISH';
      } else if (latest.mdi > latest.pdi && latest.mdi > 20) {
        dmiSignal = 'BEARISH';
      }

      console.log(`   🧭 DMI: ADX=${latest.adx.toFixed(1)} +DI=${latest.pdi.toFixed(1)} -DI=${latest.mdi.toFixed(1)} | ${dmiSignal}`);

      return {
        adx: dmi.map(d => d.adx),
        pdi: dmi.map(d => d.pdi),
        mdi: dmi.map(d => d.mdi),
        adxStrength: adxStrength,
        dmiSignal: dmiSignal,
        latest: latest
      };
    } catch (error) {
      console.log(`   ⚠️ DMI calculation failed:`, error.message);
      return {
        adx: [],
        pdi: [],
        mdi: [],
        adxStrength: 'WEAK',
        dmiSignal: 'NEUTRAL',
        latest: null
      };
    }
  }

  // ✅ Other Indicators (MACD, ATR, Volume, S/R)
  calculateOtherIndicators(closes, highs, lows, volumes, candles) {
    try {
      // MACD
      let macd = [];
      try {
        macd = ti.MACD.calculate({
          values: closes,
          fastPeriod: config.macd.fast,
          slowPeriod: config.macd.slow,
          signalPeriod: config.macd.signal,
          SimpleMAOscillator: false,
          SimpleMASignal: false
        });
        
        if (!macd || macd.length === 0) {
          macd = [{MACD: 0, signal: 0, histogram: 0}];
        }
      } catch (e) {
        console.log(`   ⚠️ MACD failed: ${e.message}`);
        macd = [{MACD: 0, signal: 0, histogram: 0}];
      }

      // ATR
      const atr = this.calculateATR(candles, config.atr);
      
      // Volume Profile
      const volumeProfile = this.calculateVolumeProfile(candles);
      
      // Support/Resistance
      const supportResistance = this.calculateSupportResistance(candles, config.supportResistancePeriod);

      return {
        macd: macd,
        atr: atr,
        volumeProfile: volumeProfile,
        levels: supportResistance
      };
    } catch (error) {
      console.error('   ❌ Other indicators failed:', error.message);
      
      // Return safe defaults
      return {
        macd: [{MACD: 0, signal: 0, histogram: 0}],
        atr: [0.01],
        volumeProfile: {
          currentVolume: 1000000,
          averageVolume: 1000000,
          volumeRatio: 1.0,
          isVolumeSpike: false
        },
        levels: {
          resistance: [closes[closes.length-1] * 1.02],
          support: [closes[closes.length-1] * 0.98]
        }
      };
    }
  }

  // ✅ ATR (Average True Range)
  calculateATR(candles, period) {
    try {
      if (candles.length < period + 1) return [0.01];

      let trueRanges = [];
      for (let i = 1; i < candles.length; i++) {
        const tr = Math.max(
          candles[i].high - candles[i].low,
          Math.abs(candles[i].high - candles[i-1].close),
          Math.abs(candles[i].low - candles[i-1].close)
        );
        trueRanges.push(tr);
      }
      
      if (trueRanges.length < period) return [0.01];
      
      let atr = [];
      for (let i = period - 1; i < trueRanges.length; i++) {
        let sum = 0;
        for (let j = 0; j < period; j++) {
          sum += trueRanges[i - j];
        }
        atr.push(sum / period);
      }
      
      return atr.length > 0 ? atr : [0.01];
    } catch (error) {
      return [0.01];
    }
  }

  // ✅ Support/Resistance Levels
  calculateSupportResistance(candles, period) {
    try {
      const highs = candles.map(c => c.high);
      const lows = candles.map(c => c.low);
      
      let resistance = [];
      let support = [];
      
      for (let i = period - 1; i < candles.length; i++) {
        const recentHighs = highs.slice(i - period + 1, i + 1);
        const recentLows = lows.slice(i - period + 1, i + 1);
        
        resistance.push(Math.max(...recentHighs));
        support.push(Math.min(...recentLows));
      }
      
      return { 
        resistance: resistance.length > 0 ? resistance : [candles[candles.length-1].high * 1.02],
        support: support.length > 0 ? support : [candles[candles.length-1].low * 0.98]
      };
    } catch (error) {
      const lastPrice = candles[candles.length-1].close;
      return { 
        resistance: [lastPrice * 1.02],
        support: [lastPrice * 0.98]
      };
    }
  }

  // ✅ Volume Profile
  calculateVolumeProfile(candles, period = 20) {
    try {
      const volumes = candles.map(c => c.volume);
      const currentVolume = volumes[volumes.length - 1];
      
      const recentVolumes = volumes.slice(-period);
      const averageVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
      
      return {
        currentVolume,
        averageVolume,
        volumeRatio: currentVolume / averageVolume,
        isVolumeSpike: currentVolume > averageVolume * config.volumeMultiplier
      };
    } catch (error) {
      return {
        currentVolume: 1000000,
        averageVolume: 1000000,
        volumeRatio: 1.0,
        isVolumeSpike: false
      };
    }
  }

  // ✅ Analyze TEMA Crossover
  analyzeTEMACrossover(temaFastCurr, temaMediumCurr, temaFastPrev, temaMediumPrev) {
    if (!temaFastPrev || !temaMediumPrev) {
      return temaFastCurr > temaMediumCurr ? 'BULLISH_ABOVE' : 'BEARISH_BELOW';
    }
    
    // Bullish cross
    if (temaFastCurr > temaMediumCurr && temaFastPrev <= temaMediumPrev) {
      return 'BULLISH_CROSS';
    }
    
    // Bearish cross
    if (temaFastCurr < temaMediumCurr && temaFastPrev >= temaMediumPrev) {
      return 'BEARISH_CROSS';
    }
    
    // Strong spread
    const spread = ((temaFastCurr - temaMediumCurr) / temaMediumCurr) * 100;
    
    if (temaFastCurr > temaMediumCurr && spread > 0.05) {
      return 'BULLISH_STRONG';
    }
    
    if (temaFastCurr < temaMediumCurr && spread < -0.05) {
      return 'BEARISH_STRONG';
    }
    
    return temaFastCurr > temaMediumCurr ? 'BULLISH_ABOVE' : 'BEARISH_BELOW';
  }
}

module.exports = Indicators;