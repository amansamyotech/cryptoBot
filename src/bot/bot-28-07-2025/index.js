// const Binance = require("node-binance-api");
// const technicalIndicators = require("technicalindicators");
// const {
//   RSI,
//   MACD,
//   BollingerBands,
//   EMA,
//   ADX,
//   VWMA,
//   Stochastic,
// } = require("technicalindicators");
// const axios = require("axios");
// const API_ENDPOINT = "http://localhost:3000/api/buySell/";
// const binance = new Binance().options({
//   APIKEY: "whfiekZqKdkwa9fEeUupVdLZTNxBqP1OCEuH2pjyImaWt51FdpouPPrCawxbsupK",
//   APISECRET: "E4IcteWOQ6r9qKrBZJoBy4R47nNPBDepVXMnS3Lf2Bz76dlu0QZCNh82beG2rHq4",
//   useServerTime: true,
//   test: false,
// });
// const symbols = [
//   "1000PEPEUSDT",
//   "1000BONKUSDT",
//   "DOGEUSDT",
//   "CKBUSDT",
//   "1000FLOKIUSDT",
// ];

// const interval = "3m";
// const leverage = 3; // Leverage
// const STOP_LOSS_ROI = -2; // -2% ROI for stop loss
// const TAKE_PROFIT_ROI = 4; // +4% ROI for take

// const MINIMUM_PROFIT_ROI = 2;
// const INITIAL_TAKE_PROFIT_ROI = 2;
// const RSI_PERIOD = 14;
// const RSI_OVERBOUGHT = 70; // Tightened for meme coins
// const RSI_OVERSOLD = 30;
// const MACD_FAST = 12;
// const MACD_SLOW = 26;
// const MACD_SIGNAL = 9;
// const BB_PERIOD = 20;
// const BB_STD_DEV = 2.5; // Increased to filter noise
// const EMA_FAST = 12;
// const EMA_SLOW = 26;
// const EMA_TREND_SHORT = 50;
// const EMA_TREND_LONG = 200;
// const ADX_PERIOD = 14;
// const ADX_THRESHOLD = 25; // Stronger trend requirement
// const VWMA_PERIOD = 20;
// const STOCHASTIC_PERIOD = 14; // Stochastic settings
// const STOCHASTIC_K = 3;
// const STOCHASTIC_D = 3;
// const LONG_THRESHOLD = 4; // Higher threshold for stronger signals
// const SHORT_THRESHOLD = -4;
// const VOLATILITY_THRESHOLD = 0.02; // 📊 Scoring Thresholds

// async function getUsdtBalance() {
//   try {
//     const account = await binance.futuresBalance();
//     const usdtBalance = parseFloat(
//       account.find((asset) => asset.asset === "USDT")?.balance || 0
//     );
//     return usdtBalance;
//   } catch (err) {
//     console.error("Error fetching balance:", err);
//     return 0;
//   }
// }
// // Set leverage before trading
// async function setLeverage(symbol) {
//   try {
//     await binance.futuresLeverage(symbol, leverage);
//     console.log(`Leverage set to ${leverage}x for ${symbol}`);
//   } catch (err) {
//     console.error(`Failed to set leverage for ${symbol}:`, err.body);
//   }
// }

// function calculateROIPrices(entryPrice, marginUsed, quantity, side) {
//   const stopLossPnL = (marginUsed * STOP_LOSS_ROI) / 100;
//   const takeProfitPnL = (marginUsed * TAKE_PROFIT_ROI) / 100;

//   let stopLossPrice, takeProfitPrice;

//   if (side === "LONG") {
//     stopLossPrice = entryPrice + stopLossPnL / quantity;
//     takeProfitPrice = entryPrice + takeProfitPnL / quantity;
//   } else {
//     stopLossPrice = entryPrice - stopLossPnL / quantity;
//     takeProfitPrice = entryPrice - takeProfitPnL / quantity;
//   }

//   return { stopLossPrice, takeProfitPrice };
// }

// async function getCandles(symbol, interval, limit = 100) {
//   const candles = await binance.futuresCandles(symbol, interval, { limit });

//   return candles.map((c) => ({
//     open: parseFloat(c.open),
//     high: parseFloat(c.high),
//     low: parseFloat(c.low),
//     close: parseFloat(c.close),
//     volume: parseFloat(c.volume),
//   }));
// }

// function calculateVWMA(prices, volumes, period) {
//   const result = [];

//   for (let i = period - 1; i < prices.length; i++) {
//     let weightedSum = 0;
//     let volumeSum = 0;

//     for (let j = 0; j < period; j++) {
//       const index = i - period + 1 + j;
//       weightedSum += prices[index] * volumes[index];
//       volumeSum += volumes[index];
//     }

//     result.push(volumeSum > 0 ? weightedSum / volumeSum : prices[i]);
//   }

//   return result;
// }

// async function getIndicators(symbol, interval) {
//   try {
//     const data = await getCandles(symbol, interval, 200);

//     if (data.length < 50) {
//       throw new Error(
//         `Insufficient data for ${symbol}: ${data.length} candles (minimum 50 required)`
//       );
//     }

//     const closes = data.map((c) => c.close);
//     const highs = data.map((c) => c.high);
//     const lows = data.map((c) => c.low);
//     const volumes = data.map((c) => c.volume);

//     // Additional validation
//     if (
//       closes.some(isNaN) ||
//       highs.some(isNaN) ||
//       lows.some(isNaN) ||
//       volumes.some(isNaN)
//     ) {
//       throw new Error(`Invalid price data detected for ${symbol}`);
//     }

//     const indicators = {};

//     // RSI
//     try {
//       if (closes.length >= RSI_PERIOD) {
//         indicators.rsi = RSI.calculate({
//           period: RSI_PERIOD,
//           values: closes,
//         });
//         if (!indicators.rsi || indicators.rsi.length === 0) {
//           throw new Error("RSI calculation returned empty result");
//         }
//       } else {
//         throw new Error(
//           `Not enough data for RSI: need ${RSI_PERIOD}, have ${closes.length}`
//         );
//       }
//     } catch (e) {
//       console.error(`RSI calculation failed for ${symbol}:`, e.message);
//       throw new Error(`RSI calculation failed: ${e.message}`);
//     }

//     // MACD
//     try {
//       if (closes.length >= MACD_SLOW) {
//         indicators.macd = MACD.calculate({
//           values: closes,
//           fastPeriod: MACD_FAST,
//           slowPeriod: MACD_SLOW,
//           signalPeriod: MACD_SIGNAL,
//           SimpleMAOscillator: false,
//           SimpleMASignal: false,
//         });
//         if (!indicators.macd || indicators.macd.length === 0) {
//           throw new Error("MACD calculation returned empty result");
//         }
//       } else {
//         throw new Error(
//           `Not enough data for MACD: need ${MACD_SLOW}, have ${closes.length}`
//         );
//       }
//     } catch (e) {
//       console.error(`MACD calculation failed for ${symbol}:`, e.message);
//       throw new Error(`MACD calculation failed: ${e.message}`);
//     }

//     // Bollinger Bands
//     try {
//       if (closes.length >= BB_PERIOD) {
//         indicators.bb = BollingerBands.calculate({
//           period: BB_PERIOD,
//           stdDev: BB_STD_DEV,
//           values: closes,
//         });
//         if (!indicators.bb || indicators.bb.length === 0) {
//           throw new Error("Bollinger Bands calculation returned empty result");
//         }
//       } else {
//         throw new Error(
//           `Not enough data for BB: need ${BB_PERIOD}, have ${closes.length}`
//         );
//       }
//     } catch (e) {
//       console.error(
//         `Bollinger Bands calculation failed for ${symbol}:`,
//         e.message
//       );
//       throw new Error(`BB calculation failed: ${e.message}`);
//     }

//     // EMA Fast
//     try {
//       if (closes.length >= EMA_FAST) {
//         indicators.emaFast = EMA.calculate({
//           period: EMA_FAST,
//           values: closes,
//         });
//         if (!indicators.emaFast || indicators.emaFast.length === 0) {
//           throw new Error("EMA Fast calculation returned empty result");
//         }
//       } else {
//         throw new Error(
//           `Not enough data for EMA Fast: need ${EMA_FAST}, have ${closes.length}`
//         );
//       }
//     } catch (e) {
//       console.error(`EMA Fast calculation failed for ${symbol}:`, e.message);
//       throw new Error(`EMA Fast calculation failed: ${e.message}`);
//     }

//     // EMA Slow
//     try {
//       if (closes.length >= EMA_SLOW) {
//         indicators.emaSlow = EMA.calculate({
//           period: EMA_SLOW,
//           values: closes,
//         });
//         if (!indicators.emaSlow || indicators.emaSlow.length === 0) {
//           throw new Error("EMA Slow calculation returned empty result");
//         }
//       } else {
//         throw new Error(
//           `Not enough data for EMA Slow: need ${EMA_SLOW}, have ${closes.length}`
//         );
//       }
//     } catch (e) {
//       console.error(`EMA Slow calculation failed for ${symbol}:`, e.message);
//       throw new Error(`EMA Slow calculation failed: ${e.message}`);
//     }

//     // EMA Trend Short
//     try {
//       if (closes.length >= EMA_TREND_SHORT) {
//         indicators.emaTrendShort = EMA.calculate({
//           period: EMA_TREND_SHORT,
//           values: closes,
//         });
//         if (
//           !indicators.emaTrendShort ||
//           indicators.emaTrendShort.length === 0
//         ) {
//           throw new Error("EMA Trend Short calculation returned empty result");
//         }
//       } else {
//         throw new Error(
//           `Not enough data for EMA Trend Short: need ${EMA_TREND_SHORT}, have ${closes.length}`
//         );
//       }
//     } catch (e) {
//       console.error(
//         `EMA Trend Short calculation failed for ${symbol}:`,
//         e.message
//       );
//       throw new Error(`EMA Trend Short calculation failed: ${e.message}`);
//     }

//     // EMA Trend Long
//     try {
//       if (closes.length >= EMA_TREND_LONG) {
//         indicators.emaTrendLong = EMA.calculate({
//           period: EMA_TREND_LONG,
//           values: closes,
//         });
//         if (!indicators.emaTrendLong || indicators.emaTrendLong.length === 0) {
//           throw new Error("EMA Trend Long calculation returned empty result");
//         }
//       } else {
//         throw new Error(
//           `Not enough data for EMA Trend Long: need ${EMA_TREND_LONG}, have ${closes.length}`
//         );
//       }
//     } catch (e) {
//       console.error(
//         `EMA Trend Long calculation failed for ${symbol}:`,
//         e.message
//       );
//       throw new Error(`EMA Trend Long calculation failed: ${e.message}`);
//     }

//     // ADX
//     try {
//       if (
//         closes.length >= ADX_PERIOD &&
//         highs.length >= ADX_PERIOD &&
//         lows.length >= ADX_PERIOD
//       ) {
//         indicators.adx = ADX.calculate({
//           close: closes,
//           high: highs,
//           low: lows,
//           period: ADX_PERIOD,
//         });
//         if (!indicators.adx || indicators.adx.length === 0) {
//           throw new Error("ADX calculation returned empty result");
//         }
//       } else {
//         throw new Error(
//           `Not enough data for ADX: need ${ADX_PERIOD}, have ${closes.length}`
//         );
//       }
//     } catch (e) {
//       console.error(`ADX calculation failed for ${symbol}:`, e.message);
//       throw new Error(`ADX calculation failed: ${e.message}`);
//     }

//     // VWMA
//     try {
//       if (closes.length >= VWMA_PERIOD && volumes.length >= VWMA_PERIOD) {
//         indicators.vwma = calculateVWMA(closes, volumes, VWMA_PERIOD);
//         if (!indicators.vwma || indicators.vwma.length === 0) {
//           throw new Error("VWMA calculation returned empty result");
//         }
//       } else {
//         throw new Error(
//           `Not enough data for VWMA: need ${VWMA_PERIOD}, have ${closes.length}`
//         );
//       }
//     } catch (e) {
//       console.error(`VWMA calculation failed for ${symbol}:`, e.message);
//       throw new Error(`VWMA calculation failed: ${e.message}`);
//     }

//     // Stochastic Oscillator
//     try {
//       if (
//         closes.length >= STOCHASTIC_PERIOD &&
//         highs.length >= STOCHASTIC_PERIOD &&
//         lows.length >= STOCHASTIC_PERIOD
//       ) {
//         indicators.stochastic = Stochastic.calculate({
//           high: highs,
//           low: lows,
//           close: closes,
//           period: STOCHASTIC_PERIOD,
//           signalPeriod: STOCHASTIC_D,
//         });
//         if (!indicators.stochastic || indicators.stochastic.length === 0) {
//           throw new Error("Stochastic calculation returned empty result");
//         }
//       } else {
//         throw new Error(
//           `Not enough data for Stochastic: need ${STOCHASTIC_PERIOD}, have ${closes.length}`
//         );
//       }
//     } catch (e) {
//       console.error(`Stochastic calculation failed for ${symbol}:`, e.message);
//       throw new Error(`Stochastic calculation failed: ${e.message}`);
//     }

//     indicators.latestClose = closes[closes.length - 1];

//     // Calculate volatility (ATR approximation)
//     const priceRange = highs.slice(-20).map((h, i) => h - lows[i]);
//     indicators.volatility =
//       priceRange.reduce((sum, val) => sum + val, 0) /
//       priceRange.length /
//       indicators.latestClose;

//     return indicators;
//   } catch (error) {
//     console.error(`Error calculating indicators for ${symbol}:`, error.message);
//     throw error;
//   }
// }

// function getMarketCondition(indicators) {
//   const latestRSI = indicators.rsi[indicators.rsi.length - 1];
//   const latestADX = indicators.adx[indicators.adx.length - 1]?.adx;
//   const volatility = indicators.volatility;

//   if (!latestRSI || !latestADX) return "unknown";
//   if (latestADX < ADX_THRESHOLD || volatility < VOLATILITY_THRESHOLD)
//     return "sideways";
//   return "trending";
// }

// function decideTradeDirection(indicators) {
//   let score = 0;
//   const latestRSI = indicators.rsi[indicators.rsi.length - 1];
//   const latestMACD = indicators.macd[indicators.macd.length - 1];
//   const latestBB = indicators.bb[indicators.bb.length - 1];
//   const latestClose = indicators.latestClose;
//   const emaFast = indicators.emaFast[indicators.emaFast.length - 1];
//   const emaSlow = indicators.emaSlow[indicators.emaSlow.length - 1];
//   const emaShort =
//     indicators.emaTrendShort[indicators.emaTrendShort.length - 1];
//   const emaLong = indicators.emaTrendLong[indicators.emaTrendLong.length - 1];
//   const vwma = indicators.vwma[indicators.vwma.length - 1];
//   const stochastic = indicators.stochastic[indicators.stochastic.length - 1];
//   const latestADX = indicators.adx[indicators.adx.length - 1]?.adx;

//   // Weights for indicators
//   const weights = {
//     rsi: 1.5, // Higher weight for momentum
//     macd: 1.5,
//     bb: 1.0,
//     ema: 1.2,
//     trend: 1.2,
//     vwma: 1.0,
//     stochastic: 1.3, // Moderate weight for confirmation
//     adx: 1.5, // Strong trend weight
//   };

//   // RSI: Adjusted thresholds for meme coins
//   if (latestRSI > RSI_OVERBOUGHT) score -= weights.rsi; // Overbought
//   else if (latestRSI < RSI_OVERSOLD) score += weights.rsi; // Oversold
//   else if (latestRSI > 55) score += weights.rsi * 0.5; // Mild bullish
//   else if (latestRSI < 45) score -= weights.rsi * 0.5; // Mild bearish

//   // MACD: Confirm crossover and histogram strength
//   if (latestMACD.MACD > latestMACD.signal && latestMACD.histogram > 0) {
//     score += weights.macd;
//   } else if (latestMACD.MACD < latestMACD.signal && latestMACD.histogram < 0) {
//     score -= weights.macd;
//   }

//   // Bollinger Bands: Price relative to bands
//   if (latestClose < latestBB.lower) score += weights.bb;
//   else if (latestClose > latestBB.upper) score -= weights.bb;
//   else if (latestClose > latestBB.middle) score += weights.bb * 0.5;
//   else if (latestClose < latestBB.middle) score -= weights.bb * 0.5;

//   // EMA Crossover
//   if (emaFast > emaSlow) score += weights.ema;
//   else if (emaFast < emaSlow) score -= weights.ema;

//   // Trend Confirmation
//   if (emaShort > emaLong && latestADX > ADX_THRESHOLD) score += weights.trend;
//   else if (emaShort < emaLong && latestADX > ADX_THRESHOLD)
//     score -= weights.trend;

//   // VWMA
//   if (latestClose > vwma) score += weights.vwma;
//   else if (latestClose < vwma) score -= weights.vwma;

//   // Stochastic Oscillator
//   if (stochastic.k > stochastic.d && stochastic.k < 80)
//     score += weights.stochastic;
//   else if (stochastic.k < stochastic.d && stochastic.k > 20)
//     score -= weights.stochastic;

//   // ADX: Strong trend bonus
//   if (latestADX > ADX_THRESHOLD) {
//     score *= weights.adx; // Amplify score if strong trend
//   }

//   console.log(`Trade Score for ${symbol}: ${score}`);

//   if (score >= LONG_THRESHOLD) return "LONG";
//   else if (score <= SHORT_THRESHOLD) return "SHORT";
//   else return "HOLD";
// }

// async function processSymbol(symbol, maxSpendPerTrade) {
//   const indicators = await getIndicators(symbol, "3m");
//   const marketCondition = getMarketCondition(indicators);

//   if (marketCondition === "sideways") {
//     console.log(`Sideways market for ${symbol}, skipping trade.`);
//     return;
//   }

//   if (marketCondition === "trending") {
//     const decision = decideTradeDirection(indicators);

//     if (decision === "LONG") {
//       await placeBuyOrder(symbol, maxSpendPerTrade);
//     } else if (decision === "SHORT") {
//       await placeShortOrder(symbol, maxSpendPerTrade);
//     } else {
//       console.log(`No trade signal for ${symbol}`);
//     }
//   }
// }

// // 💰 Place Buy Order + Stop Loss (LONG Position)
// async function placeBuyOrder(symbol, marginAmount) {
//   try {
//     await setLeverage(symbol);

//     const price = (await binance.futuresPrices())[symbol];
//     const entryPrice = parseFloat(price);

//     // Calculate position size with leverage
//     const positionValue = marginAmount * leverage;
//     const quantity = parseFloat((positionValue / entryPrice).toFixed(6));

//     const exchangeInfo = await binance.futuresExchangeInfo();
//     const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
//     const pricePrecision = symbolInfo.pricePrecision;
//     const quantityPrecision = symbolInfo.quantityPrecision;

//     const qtyFixed = quantity.toFixed(quantityPrecision);

//     // Calculate ROI-based stop loss and take profit prices
//     const { stopLossPrice, takeProfitPrice } = calculateROIPrices(
//       entryPrice,
//       marginAmount,
//       quantity,
//       "LONG"
//     );

//     const stopLossFixed = stopLossPrice.toFixed(pricePrecision);
//     const takeProfitFixed = takeProfitPrice.toFixed(pricePrecision);

//     console.log(`LONG Order Details for ${symbol}:`);
//     console.log(`Entry Price: ${entryPrice}`);
//     console.log(`Quantity: ${qtyFixed}`);
//     console.log(`Margin Used: ${marginAmount}`);
//     console.log(`Position Value: ${positionValue} (${leverage}x leverage)`);
//     console.log(`Stop Loss Price: ${stopLossFixed} (${STOP_LOSS_ROI}% ROI)`);
//     console.log(
//       `Take Profit Price: ${takeProfitFixed} (${TAKE_PROFIT_ROI}% ROI)`
//     );

//     // Place market buy order
//     const buyOrder = await binance.futuresMarketBuy(symbol, qtyFixed);
//     console.log(`Bought ${symbol} at ${entryPrice}`);

//     const buyOrderDetails = {
//       side: "LONG",
//       symbol,
//       quantity: qtyFixed,
//       LongTimeCoinPrice: entryPrice,
//       placeOrderId: buyOrder.orderId,
//       marginUsed: marginAmount,
//       leverage: leverage,
//       positionValue: positionValue,
//     };

//     const tradeResponse = await axios.post(API_ENDPOINT, {
//       data: buyOrderDetails,
//     });
//     console.log(`Trade Response:`, tradeResponse?.data);

//     const tradeId = tradeResponse.data._id;

//     // Place stop loss order
//     const stopLossOrder = await binance.futuresOrder(
//       "STOP_MARKET",
//       "SELL",
//       symbol,
//       qtyFixed,
//       null,
//       {
//         stopPrice: stopLossFixed,
//         reduceOnly: true,
//         timeInForce: "GTC",
//       }
//     );
//     console.log(
//       `Stop Loss set at ${stopLossFixed} for ${symbol} (${STOP_LOSS_ROI}% ROI)`
//     );

//     // Place take profit order
//     const takeProfitOrder = await binance.futuresOrder(
//       "TAKE_PROFIT_MARKET",
//       "SELL",
//       symbol,
//       qtyFixed,
//       null,
//       {
//         stopPrice: takeProfitFixed,
//         reduceOnly: true,
//         timeInForce: "GTC",
//       }
//     );
//     console.log(
//       `Take Profit set at ${takeProfitFixed} for ${symbol} (${TAKE_PROFIT_ROI}% ROI)`
//     );

//     const details = {
//       takeProfitPrice: takeProfitFixed,
//       profitOrderId: takeProfitOrder.orderId,
//       stopLossPrice: stopLossFixed,
//       stopLossOrderId: stopLossOrder.orderId,
//     };

//     await axios.put(`${API_ENDPOINT}${tradeId}`, {
//       data: details,
//     });
//   } catch (error) {
//     console.error(`Error placing LONG order for ${symbol}:`, error);
//   }
// }

// // 📉 Place Short Order + Stop Loss (SHORT Position)
// async function placeShortOrder(symbol, marginAmount) {
//   try {
//     await setLeverage(symbol);

//     const price = (await binance.futuresPrices())[symbol];
//     const entryPrice = parseFloat(price);

//     // Calculate position size with leverage
//     const positionValue = marginAmount * leverage;
//     console.log(`leverage`, leverage);
//     console.log(`marginAmount`, marginAmount);

//     console.log(`positionValue`, positionValue);

//     const quantity = parseFloat((positionValue / entryPrice).toFixed(6));
//     console.log(`quantity`, quantity);

//     const exchangeInfo = await binance.futuresExchangeInfo();
//     const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
//     const pricePrecision = symbolInfo.pricePrecision;
//     const quantityPrecision = symbolInfo.quantityPrecision;

//     const qtyFixed = quantity.toFixed(quantityPrecision);

//     // Calculate ROI-based stop loss and take profit prices
//     const { stopLossPrice, takeProfitPrice } = calculateROIPrices(
//       entryPrice,
//       marginAmount,
//       quantity,
//       "SHORT"
//     );

//     const stopLossFixed = stopLossPrice.toFixed(pricePrecision);
//     const takeProfitFixed = takeProfitPrice.toFixed(pricePrecision);

//     console.log(`SHORT Order Details for ${symbol}:`);
//     console.log(`Entry Price: ${entryPrice}`);
//     console.log(`Quantity: ${qtyFixed}`);
//     console.log(`Margin Used: ${marginAmount}`);
//     console.log(`Position Value: ${positionValue} (${leverage}x leverage)`);
//     console.log(`Stop Loss Price: ${stopLossFixed} (${STOP_LOSS_ROI}% ROI)`);
//     console.log(
//       `Take Profit Price: ${takeProfitFixed} (${TAKE_PROFIT_ROI}% ROI)`
//     );

//     // Place market sell order
//     const shortOrder = await binance.futuresMarketSell(symbol, qtyFixed);
//     console.log(`Shorted ${symbol} at ${entryPrice}`);

//     const shortOrderDetails = {
//       side: "SHORT",
//       symbol,
//       quantity: qtyFixed,
//       ShortTimeCurrentPrice: entryPrice,
//       placeOrderId: shortOrder.orderId,
//       marginUsed: marginAmount,
//       leverage: leverage,
//       positionValue: positionValue,
//     };

//     const tradeResponse = await axios.post(API_ENDPOINT, {
//       data: shortOrderDetails,
//     });
//     console.log(`Trade Response:`, tradeResponse?.data);

//     const tradeId = tradeResponse.data._id;

//     // Place stop loss order
//     const stopLossOrder = await binance.futuresOrder(
//       "STOP_MARKET",
//       "BUY",
//       symbol,
//       qtyFixed,
//       null,
//       {
//         stopPrice: stopLossFixed,
//         reduceOnly: true,
//         timeInForce: "GTC",
//       }
//     );
//     console.log(
//       `Stop Loss set at ${stopLossFixed} for ${symbol} (${STOP_LOSS_ROI}% ROI)`
//     );

//     // Place take profit order
//     const takeProfitOrder = await binance.futuresOrder(
//       "TAKE_PROFIT_MARKET",
//       "BUY",
//       symbol,
//       qtyFixed,
//       null,
//       {
//         stopPrice: takeProfitFixed,
//         reduceOnly: true,
//         timeInForce: "GTC",
//       }
//     );
//     console.log(
//       `Take Profit set at ${takeProfitFixed} for ${symbol} (${TAKE_PROFIT_ROI}% ROI)`
//     );

//     const details = {
//       takeProfitPrice: takeProfitFixed,
//       profitOrderId: takeProfitOrder.orderId,
//       stopLossPrice: stopLossFixed,
//       stopLossOrderId: stopLossOrder.orderId,
//     };

//     await axios.put(`${API_ENDPOINT}${tradeId}`, {
//       data: details,
//     });
//   } catch (error) {
//     console.error(`Error placing SHORT order for ${symbol}:`, error);
//   }
// }

// // 🔁 Main Loop
// setInterval(async () => {
//   const totalBalance = await getUsdtBalance();
//   const usableBalance = totalBalance - 5.1; // Keep $5.1 reserve
//   console.log(`usableBalance usableBalance usableBalance`, usableBalance);

//   const maxSpendPerTrade = usableBalance / symbols.length;
//   console.log(`maxSpendPerTrade`, maxSpendPerTrade);

//   if (usableBalance <= 6) {
//     console.log("Not enough balance to trade.");
//     return;
//   }

//   console.log(`Total Balance: ${totalBalance} USDT`);
//   console.log(`Usable Balance: ${usableBalance} USDT`);
//   console.log(`Max Spend Per Trade: ${maxSpendPerTrade} USDT`);

//   for (const sym of symbols) {
//     try {
//       const response = await axios.post(`${API_ENDPOINT}check-symbols`, {
//         symbols: sym,
//       });

//       let status = response?.data?.data.status;

//       if (status == true) {
//         await processSymbol(sym, maxSpendPerTrade);
//       } else {
//         console.log(`TRADE ALREADY OPEN FOR SYMBOL: ${sym}`);
//       }
//     } catch (err) {
//       console.error(`Error with ${sym}:`, err.message);
//     }
//   }
// }, 60 * 1000); // Run every 1 minute

// async function checkOrders(symbol) {
//   try {
//     const response = await axios.get(`${API_ENDPOINT}find-treads/${symbol}`);
//     console.log(`response.data?.data`, response.data?.data);

//     const { found } = response.data?.data;

//     if (!found) return;

//     const { tradeDetails } = response.data?.data;
//     const { stopLossOrderId, takeProfitOrderId, objectId } = tradeDetails;
//     console.log(
//       ` stopLossOrderId, takeProfitOrderId,`,
//       stopLossOrderId,
//       takeProfitOrderId
//     );

//     console.log(`objectId:`, objectId);

//     if (!stopLossOrderId || !takeProfitOrderId) {
//       console.log(`No order IDs found for ${symbol}`);
//       return;
//     }

//     // Get initial order statuses
//     const stopLossStatus = await binance.futuresOrderStatus(symbol, {
//       orderId: stopLossOrderId,
//     });

//     const takeProfitStatus = await binance.futuresOrderStatus(symbol, {
//       orderId: takeProfitOrderId,
//     });

//     const stopLossOrderStatus = stopLossStatus?.status;
//     const takeProfitOrderStatus = takeProfitStatus?.status;

//     console.log(`Stop Loss Status for ${symbol}:`, stopLossOrderStatus);
//     console.log(`Take Profit Status for ${symbol}:`, takeProfitOrderStatus);

//     const isStopLossFilled = stopLossOrderStatus === "FILLED";
//     const isTakeProfitFilled = takeProfitOrderStatus === "FILLED";

//     if (isStopLossFilled || isTakeProfitFilled) {
//       console.log(`One of the orders is filled for ${symbol}`);

//       // If Stop Loss is NOT filled, check again before canceling
//       if (!isStopLossFilled) {
//         const recheckStopLoss = await binance.futuresOrderStatus(symbol, {
//           orderId: stopLossOrderId,
//         });
//         if (
//           recheckStopLoss?.status !== "CANCELED" &&
//           recheckStopLoss?.status !== "FILLED"
//         ) {
//           await binance.futuresCancel(symbol, stopLossOrderId);
//           console.log(`Stop Loss order canceled`);
//         } else {
//           console.log(`Stop Loss already canceled or filled`);
//         }
//       }

//       // If Take Profit is NOT filled, check again before canceling
//       if (!isTakeProfitFilled) {
//         const recheckTakeProfit = await binance.futuresOrderStatus(symbol, {
//           orderId: takeProfitOrderId,
//         });
//         if (
//           recheckTakeProfit?.status !== "CANCELED" &&
//           recheckTakeProfit?.status !== "FILLED"
//         ) {
//           await binance.futuresCancel(symbol, takeProfitOrderId);
//           console.log(`Take Profit order canceled`);
//         } else {
//           console.log(`Take Profit already canceled or filled`);
//         }
//       }

//       // Mark trade as closed
//       const data = await axios.put(`${API_ENDPOINT}${objectId}`, {
//         data: { status: "1" },
//       });
//       console.log(`Trade marked as closed in DB for ${symbol}`, data?.data);
//     } else {
//       console.log(
//         `Neither order is filled yet for ${symbol}. No action taken.`
//       );
//     }
//   } catch (error) {
//     console.error("Error checking or canceling orders:", error);
//   }
// }

// setInterval(async () => {
//   for (const sym of symbols) {
//     await checkOrders(sym);
//   }
// }, 30000);


const tf = require("@tensorflow/tfjs");
require("@tensorflow/tfjs-node");
const Binance = require("node-binance-api");
const technicalIndicators = require("technicalindicators");
const {
  RSI,
  MACD,
  BollingerBands,
  EMA,
  ADX,
  VWMA,
} = require("technicalindicators");

const axios = require("axios");
const API_ENDPOINT = "http://localhost:3000/api/buySell/";
const binance = new Binance().options({
  APIKEY: "whfiekZqKdkwa9fEeUupVdLZTNxBqP1OCEuH2pjyImaWt51FdpouPPrCawxbsupK",
  APISECRET: "E4IcteWOQ6r9qKrBZJoBy4R47nNPBDepVXMnS3Lf2Bz76dlu0QZCNh82beG2rHq4",
  useServerTime: true,
  test: false,
});
const symbols = [
  "1000PEPEUSDT",
  "1000BONKUSDT",
  "DOGEUSDT",
  "CKBUSDT",
  "1000FLOKIUSDT",
];

const fs = require("fs");
const path = require("path");

const modelsDir = path.join(__dirname, "models");
if (!fs.existsSync(modelsDir)) {
  fs.mkdirSync(modelsDir);
  console.log("Created models directory:", modelsDir);
}
const interval = "3m";
const leverage = 3; // Leverage
const STOP_LOSS_ROI = -1; // -2% ROI for stop loss
const TAKE_PROFIT_ROI = 2; // +4% ROI for take

const MINIMUM_PROFIT_ROI = 2;
const INITIAL_TAKE_PROFIT_ROI = 2;
// 📈 Indicator Settings
const RSI_PERIOD = 14;
const MACD_FAST = 12;
const MACD_SLOW = 26;
const MACD_SIGNAL = 9;
const BB_PERIOD = 20;
const BB_STD_DEV = 2;
const EMA_FAST = 12;
const EMA_SLOW = 26;
const EMA_TREND_SHORT = 50;
const EMA_TREND_LONG = 200;
const ADX_PERIOD = 14;
const VWMA_PERIOD = 20;
const LONG_THRESHOLD = 3;
const SHORT_THRESHOLD = -3;
// 📊 Scoring Thresholds

async function getUsdtBalance() {
  try {
    const account = await binance.futuresBalance();
    const usdtBalance = parseFloat(
      account.find((asset) => asset.asset === "USDT")?.balance || 0
    );
    return usdtBalance;
  } catch (err) {
    console.error("Error fetching balance:", err);
    return 0;
  }
}
// Set leverage before trading
async function setLeverage(symbol) {
  try {
    await binance.futuresLeverage(symbol, leverage);
    console.log(`Leverage set to ${leverage}x for ${symbol}`);
  } catch (err) {
    console.error(`Failed to set leverage for ${symbol}:`, err.body);
  }
}

function calculateROIPrices(entryPrice, marginUsed, quantity, side) {
  const stopLossPnL = (marginUsed * STOP_LOSS_ROI) / 100;
  const takeProfitPnL = (marginUsed * TAKE_PROFIT_ROI) / 100;

  let stopLossPrice, takeProfitPrice;

  if (side === "LONG") {
    stopLossPrice = entryPrice + stopLossPnL / quantity;
    takeProfitPrice = entryPrice + takeProfitPnL / quantity;
  } else {
    stopLossPrice = entryPrice - stopLossPnL / quantity;
    takeProfitPrice = entryPrice - takeProfitPnL / quantity;
  }

  return { stopLossPrice, takeProfitPrice };
}

async function getCandles(symbol, interval, limit = 100) {
  const candles = await binance.futuresCandles(symbol, interval, { limit });

  return candles.map((c) => ({
    open: parseFloat(c.open),
    high: parseFloat(c.high),
    low: parseFloat(c.low),
    close: parseFloat(c.close),
    volume: parseFloat(c.volume),
  }));
}

function calculateVWMA(prices, volumes, period) {
  const result = [];

  for (let i = period - 1; i < prices.length; i++) {
    let weightedSum = 0;
    let volumeSum = 0;

    for (let j = 0; j < period; j++) {
      const index = i - period + 1 + j;
      weightedSum += prices[index] * volumes[index];
      volumeSum += volumes[index];
    }

    result.push(volumeSum > 0 ? weightedSum / volumeSum : prices[i]);
  }

  return result;
}


async function modelExists(symbol) {
  const modelPath = path.join(modelsDir, symbol);
  return fs.existsSync(modelPath);
}

async function verifySymbol(symbol) {
  try {
    const exchangeInfo = await binance.futuresExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
    return !!symbolInfo;
  } catch (error) {
    console.error(`Error verifying symbol ${symbol}:`, error.message);
    return false;
  }
}

async function withRetry(fn, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      console.warn(`Retry ${i + 1}/${retries} after error:`, error.message);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
async function getIndicators(symbol, interval, limit = 500) {
  try {
    const data = await getCandles(symbol, interval, limit);
    if (data.length < 50) {
      throw new Error(
        `Insufficient data for ${symbol}: ${data.length} candles (minimum 50 required)`
      );
    }

    const closes = data.map((c) => c.close);
    const highs = data.map((c) => c.high);
    const lows = data.map((c) => c.low);
    const volumes = data.map((c) => c.volume);

    if (
      closes.some(isNaN) ||
      highs.some(isNaN) ||
      lows.some(isNaN) ||
      volumes.some(isNaN)
    ) {
      throw new Error(`Invalid price data detected for ${symbol}`);
    }

    const indicators = {};

    // RSI
    try {
      if (closes.length >= RSI_PERIOD) {
        indicators.rsi = RSI.calculate({ period: RSI_PERIOD, values: closes });
        if (!indicators.rsi || indicators.rsi.length === 0) {
          throw new Error("RSI calculation returned empty result");
        }
      } else {
        throw new Error(
          `Not enough data for RSI: need ${RSI_PERIOD}, have ${closes.length}`
        );
      }
    } catch (e) {
      console.error(`RSI calculation failed for ${symbol}:`, e.message);
      throw new Error(`RSI calculation failed: ${e.message}`);
    }

    // MACD
    try {
      if (closes.length >= MACD_SLOW) {
        indicators.macd = MACD.calculate({
          values: closes,
          fastPeriod: MACD_FAST,
          slowPeriod: MACD_SLOW,
          signalPeriod: MACD_SIGNAL,
          SimpleMAOscillator: false,
          SimpleMASignal: false,
        });
        if (!indicators.macd || indicators.macd.length === 0) {
          throw new Error("MACD calculation returned empty result");
        }
      } else {
        throw new Error(
          `Not enough data for MACD: need ${MACD_SLOW}, have ${closes.length}`
        );
      }
    } catch (e) {
      console.error(`MACD calculation failed for ${symbol}:`, e.message);
      throw new Error(`MACD calculation failed: ${e.message}`);
    }

    // Bollinger Bands
    try {
      if (closes.length >= BB_PERIOD) {
        indicators.bb = BollingerBands.calculate({
          period: BB_PERIOD,
          stdDev: BB_STD_DEV,
          values: closes,
        });
        if (!indicators.bb || indicators.bb.length === 0) {
          throw new Error("Bollinger Bands calculation returned empty result");
        }
      } else {
        throw new Error(
          `Not enough data for BB: need ${BB_PERIOD}, have ${closes.length}`
        );
      }
    } catch (e) {
      console.error(
        `Bollinger Bands calculation failed for ${symbol}:`,
        e.message
      );
      throw new Error(`BB calculation failed: ${e.message}`);
    }

    // EMA Fast
    try {
      if (closes.length >= EMA_FAST) {
        indicators.emaFast = EMA.calculate({
          period: EMA_FAST,
          values: closes,
        });
        if (!indicators.emaFast || indicators.emaFast.length === 0) {
          throw new Error("EMA Fast calculation returned empty result");
        }
      } else {
        throw new Error(
          `Not enough data for EMA Fast: need ${EMA_FAST}, have ${closes.length}`
        );
      }
    } catch (e) {
      console.error(`EMA Fast calculation failed for ${symbol}:`, e.message);
      throw new Error(`EMA Fast calculation failed: ${e.message}`);
    }

    // EMA Slow
    try {
      if (closes.length >= EMA_SLOW) {
        indicators.emaSlow = EMA.calculate({
          period: EMA_SLOW,
          values: closes,
        });
        if (!indicators.emaSlow || indicators.emaSlow.length === 0) {
          throw new Error("EMA Slow calculation returned empty result");
        }
      } else {
        throw new Error(
          `Not enough data for EMA Slow: need ${EMA_SLOW}, have ${closes.length}`
        );
      }
    } catch (e) {
      console.error(`EMA Slow calculation failed for ${symbol}:`, e.message);
      throw new Error(`EMA Slow calculation failed: ${e.message}`);
    }

    // EMA Trend Short
    try {
      if (closes.length >= EMA_TREND_SHORT) {
        indicators.emaTrendShort = EMA.calculate({
          period: EMA_TREND_SHORT,
          values: closes,
        });
        if (
          !indicators.emaTrendShort ||
          indicators.emaTrendShort.length === 0
        ) {
          throw new Error("EMA Trend Short calculation returned empty result");
        }
      } else {
        throw new Error(
          `Not enough data for EMA Trend Short: need ${EMA_TREND_SHORT}, have ${closes.length}`
        );
      }
    } catch (e) {
      console.error(
        `EMA Trend Short calculation failed for ${symbol}:`,
        e.message
      );
      throw new Error(`EMA Trend Short calculation failed: ${e.message}`);
    }

    // EMA Trend Long
    try {
      if (closes.length >= EMA_TREND_LONG) {
        indicators.emaTrendLong = EMA.calculate({
          period: EMA_TREND_LONG,
          values: closes,
        });
        if (!indicators.emaTrendLong || indicators.emaTrendLong.length === 0) {
          throw new Error("EMA Trend Long calculation returned empty result");
        }
      } else {
        throw new Error(
          `Not enough data for EMA Trend Long: need ${EMA_TREND_LONG}, have ${closes.length}`
        );
      }
    } catch (e) {
      console.error(
        `EMA Trend Long calculation failed for ${symbol}:`,
        e.message
      );
      throw new Error(`EMA Trend Long calculation failed: ${e.message}`);
    }

    // ADX
    try {
      if (
        closes.length >= ADX_PERIOD &&
        highs.length >= ADX_PERIOD &&
        lows.length >= ADX_PERIOD
      ) {
        indicators.adx = ADX.calculate({
          close: closes,
          high: highs,
          low: lows,
          period: ADX_PERIOD,
        });
        if (!indicators.adx || indicators.adx.length === 0) {
          throw new Error("ADX calculation returned empty result");
        }
      } else {
        throw new Error(
          `Not enough data for ADX: need ${ADX_PERIOD}, have ${closes.length}`
        );
      }
    } catch (e) {
      console.error(`ADX calculation failed for ${symbol}:`, e.message);
      throw new Error(`ADX calculation failed: ${e.message}`);
    }

    // VWMA
    try {
      if (closes.length >= VWMA_PERIOD && volumes.length >= VWMA_PERIOD) {
        indicators.vwma = calculateVWMA(closes, volumes, VWMA_PERIOD);
        if (!indicators.vwma || indicators.vwma.length === 0) {
          throw new Error("VWMA calculation returned empty result");
        }
      } else {
        throw new Error(
          `Not enough data for VWMA: need ${VWMA_PERIOD}, have ${closes.length}`
        );
      }
    } catch (e) {
      console.error(`VWMA calculation failed for ${symbol}:`, e.message);
      throw new Error(`VWMA calculation failed: ${e.message}`);
    }

    indicators.latestClose = closes[closes.length - 1];
    indicators.candles = data; // Store candles for feature calculations

    return indicators;
  } catch (error) {
    console.error(`Error calculating indicators for ${symbol}:`, error.message);
    throw error;
  }
}

function getMarketCondition(indicators) {
  const latestRSI = indicators.rsi[indicators.rsi.length - 1];
  const latestADX = indicators.adx[indicators.adx.length - 1]?.adx;
  if (!latestRSI || !latestADX) return "unknown";
  if (latestADX < 20 || latestRSI > 70 || latestRSI < 30) return "sideways";
  return "trending";
}

async function trainLSTM(symbol, interval) {
  try {
    console.log(`Starting training for ${symbol}`);
    const candles = await getCandles(symbol, interval, 100);
    if (candles.length < 50) {
      console.warn(`Insufficient candles for ${symbol}: ${candles.length}`);
      return null;
    }
    const indicators = await getIndicators(symbol, interval, 100);
    if (!indicators || !indicators.candles) {
      console.warn(`Invalid indicators for ${symbol}`);
      return null;
    }

    const sequenceLength = 10;
    const features = [];
    const labels = [];

    for (let i = sequenceLength; i < candles.length - 1; i++) {
      const sequence = [];
      for (let j = i - sequenceLength; j < i; j++) {
        if (!indicators.rsi[j] || !indicators.macd[j] || !indicators.bb[j]) {
          console.warn(`Missing indicator data at index ${j} for ${symbol}`);
          continue;
        }
        sequence.push([
          parseFloat(indicators.rsi[j] / 100),
          parseFloat(indicators.macd[j]?.MACD / 100),
          parseFloat(indicators.macd[j]?.signal / 100),
          parseFloat((indicators.bb[j].upper - indicators.bb[j].lower) / indicators.bb[j].middle),
          parseFloat(indicators.emaFast[j] / candles[j].close),
          parseFloat(indicators.emaSlow[j] / candles[j].close),
          parseFloat(indicators.emaTrendShort[j] / candles[j].close),
          parseFloat(indicators.emaTrendLong[j] / candles[j].close),
          parseFloat(indicators.adx[j]?.adx / 100),
          parseFloat(indicators.vwma[j] / candles[j].close),
          j > 0 ? parseFloat((candles[j].close - candles[j - 1].close) / candles[j - 1].close) : 0,
          j > 0 ? parseFloat((candles[j].volume - candles[j - 1].volume) / candles[j - 1].volume) : 0,
        ]);
      }
      if (sequence.length === sequenceLength) {
        features.push(sequence);
        const nextClose = candles[i + 1].close;
        labels.push(
          nextClose > candles[i].close ? 1 : nextClose < candles[i].close ? -1 : 0
        );
      }
    }

    if (features.length === 0 || labels.length === 0) {
      console.warn(`No valid features or labels for ${symbol}`);
      return null;
    }

    const xs = tf.tensor3d(features, [features.length, sequenceLength, 12], "float32");
    const ys = tf.tensor1d(labels, "float32");

    const model = tf.sequential();
    model.add(
  tf.layers.lstm({
    units: 32, // Reduced from 50
    inputShape: [sequenceLength, 12],
    returnSequences: false,
  })
);
    model.add(tf.layers.dense({ units: 3, activation: "softmax" }));

    model.compile({
      optimizer: "adam",
      loss: "sparseCategoricalCrossentropy",
      metrics: ["accuracy"],
    });

    await model.fit(xs, ys, {
      epochs: 50,
      batchSize: 32,
      validationSplit: 0.2,
      callbacks: {
        onEpochEnd: (epoch, logs) =>
          console.log(`Epoch ${epoch}: Accuracy = ${logs.acc.toFixed(4)}`),
      },
    });

    await model.save(`file://${modelsDir}/${symbol}`);
    console.log(`Model successfully saved for ${symbol}`);
    xs.dispose();
    ys.dispose();
    return model;
  } catch (error) {
    console.error(`Failed to train/save model for ${symbol}:`, error.message);
    return null;
  }
}

async function predictMarketDirection(symbol, interval, model) {
  const indicators = await getIndicators(symbol, interval, 11); // 10 candles + 1 for latest
  const candles = indicators.candles;
  const sequence = [];

  for (let i = candles.length - 10; i < candles.length; i++) {
    sequence.push([
      indicators.rsi[i] / 100,
      indicators.macd[i]?.MACD / 100,
      indicators.macd[i]?.signal / 100,
      (indicators.bb[i].upper - indicators.bb[i].lower) /
        indicators.bb[i].middle,
      indicators.emaFast[i] / candles[i].close,
      indicators.emaSlow[i] / candles[i].close,
      indicators.emaTrendShort[i] / candles[i].close,
      indicators.emaTrendLong[i] / candles[i].close,
      indicators.adx[i]?.adx / 100,
      indicators.vwma[i] / candles[i].close,
      i > 0
        ? (candles[i].close - candles[i - 1].close) / candles[i - 1].close
        : 0,
      i > 0
        ? (candles[i].volume - candles[i - 1].volume) / candles[i - 1].volume
        : 0,
    ]);
  }

  const input = tf.tensor3d([sequence], [1, 10, 12]);
  const prediction = model.predict(input);
  const result = await prediction.argMax(-1).data();
  const probabilities = await prediction.data();
  console.log(`Prediction probabilities for ${symbol}:`, probabilities);
  input.dispose();
  prediction.dispose();

  // Only trade if confidence > 0.7
  if (probabilities[result[0]] < 0.7) return "HOLD";
  return result[0] === 1 ? "LONG" : result[0] === -1 ? "SHORT" : "HOLD";
}

function decideTradeDirection(indicators) {
  let score = 0;
  const latestRSI = indicators.rsi[indicators.rsi.length - 1];
  const latestMACD = indicators.macd[indicators.macd.length - 1];
  const latestBB = indicators.bb[indicators.bb.length - 1];
  const latestClose = indicators.latestClose;
  const emaFast = indicators.emaFast[indicators.emaFast.length - 1];
  const emaSlow = indicators.emaSlow[indicators.emaSlow.length - 1];
  const emaShort =
    indicators.emaTrendShort[indicators.emaTrendShort.length - 1];
  const emaLong = indicators.emaTrendLong[indicators.emaTrendLong.length - 1];
  const vwma = indicators.vwma[indicators.vwma.length - 1];

  if (latestRSI > 50) score++;
  else if (latestRSI < 50) score--;

  if (latestMACD.MACD > latestMACD.signal) score++;
  else score--;

  if (latestClose < latestBB.lower) score++;
  else if (latestClose > latestBB.upper) score--;

  if (emaFast > emaSlow) score++;
  else score--;

  if (emaShort > emaLong) score++;
  else score--;

  if (latestClose > vwma) score++;
  else score--;

  if (score >= LONG_THRESHOLD) return "LONG";
  else if (score <= SHORT_THRESHOLD) return "SHORT";
  else return "HOLD";
}

async function processSymbol(symbol, maxSpendPerTrade) {
  try {
    const indicators = await getIndicators(symbol, "3m");
    const marketCondition = getMarketCondition(indicators);

    if (marketCondition === "sideways") {
      console.log(`Sideways market for ${symbol}, skipping trade.`);
      return;
    }

    let model;
    if (await modelExists(symbol)) {
      model = await tf.loadLayersModel(`file://${modelsDir}/${symbol}`);
      console.log(`Model loaded for ${symbol}`);
    } else {
      console.log(`Training new model for ${symbol}`);
      model = await trainLSTM(symbol, "3m");
      if (!model) {
        console.error(`Failed to train model for ${symbol}, skipping trade.`);
        return;
      }
    }

    const decision = await predictMarketDirection(symbol, "3m", model);
    if (decision === "LONG") {
      await placeBuyOrder(symbol, maxSpendPerTrade);
    } else if (decision === "SHORT") {
      await placeShortOrder(symbol, maxSpendPerTrade);
    } else {
      console.log(`No trade signal for ${symbol}`);
    }
  } catch (error) {
    console.error(`Error processing ${symbol}:`, error.message);
  }
}

// 💰 Place Buy Order + Stop Loss (LONG Position)
async function placeBuyOrder(symbol, marginAmount) {
  try {
    await setLeverage(symbol);

    const price = (await binance.futuresPrices())[symbol];
    const entryPrice = parseFloat(price);

    // Calculate position size with leverage
    const positionValue = marginAmount * leverage;
    const quantity = parseFloat((positionValue / entryPrice).toFixed(6));

    const exchangeInfo = await binance.futuresExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
    const pricePrecision = symbolInfo.pricePrecision;
    const quantityPrecision = symbolInfo.quantityPrecision;

    const qtyFixed = quantity.toFixed(quantityPrecision);

    // Calculate ROI-based stop loss and take profit prices
    const { stopLossPrice, takeProfitPrice } = calculateROIPrices(
      entryPrice,
      marginAmount,
      quantity,
      "LONG"
    );

    const stopLossFixed = stopLossPrice.toFixed(pricePrecision);
    const takeProfitFixed = takeProfitPrice.toFixed(pricePrecision);

    console.log(`LONG Order Details for ${symbol}:`);
    console.log(`Entry Price: ${entryPrice}`);
    console.log(`Quantity: ${qtyFixed}`);
    console.log(`Margin Used: ${marginAmount}`);
    console.log(`Position Value: ${positionValue} (${leverage}x leverage)`);
    console.log(`Stop Loss Price: ${stopLossFixed} (${STOP_LOSS_ROI}% ROI)`);
    console.log(
      `Take Profit Price: ${takeProfitFixed} (${TAKE_PROFIT_ROI}% ROI)`
    );

    // Place market buy order
    const buyOrder = await binance.futuresMarketBuy(symbol, qtyFixed);
    console.log(`Bought ${symbol} at ${entryPrice}`);

    const buyOrderDetails = {
      side: "LONG",
      symbol,
      quantity: qtyFixed,
      LongTimeCoinPrice: entryPrice,
      placeOrderId: buyOrder.orderId,
      marginUsed: marginAmount,
      leverage: leverage,
      positionValue: positionValue,
    };

    const tradeResponse = await axios.post(API_ENDPOINT, {
      data: buyOrderDetails,
    });
    console.log(`Trade Response:`, tradeResponse?.data);

    const tradeId = tradeResponse.data._id;

    // Place stop loss order
    const stopLossOrder = await binance.futuresOrder(
      "STOP_MARKET",
      "SELL",
      symbol,
      qtyFixed,
      null,
      {
        stopPrice: stopLossFixed,
        reduceOnly: true,
        timeInForce: "GTC",
      }
    );
    console.log(
      `Stop Loss set at ${stopLossFixed} for ${symbol} (${STOP_LOSS_ROI}% ROI)`
    );

    // Place take profit order
    const takeProfitOrder = await binance.futuresOrder(
      "TAKE_PROFIT_MARKET",
      "SELL",
      symbol,
      qtyFixed,
      null,
      {
        stopPrice: takeProfitFixed,
        reduceOnly: true,
        timeInForce: "GTC",
      }
    );
    console.log(
      `Take Profit set at ${takeProfitFixed} for ${symbol} (${TAKE_PROFIT_ROI}% ROI)`
    );

    const details = {
      takeProfitPrice: takeProfitFixed,
      profitOrderId: takeProfitOrder.orderId,
      stopLossPrice: stopLossFixed,
      stopLossOrderId: stopLossOrder.orderId,
    };

    await axios.put(`${API_ENDPOINT}${tradeId}`, {
      data: details,
    });
  } catch (error) {
    console.error(`Error placing LONG order for ${symbol}:`, error);
  }
}

// 📉 Place Short Order + Stop Loss (SHORT Position)
async function placeShortOrder(symbol, marginAmount) {
  try {
    await setLeverage(symbol);

    const price = (await binance.futuresPrices())[symbol];
    const entryPrice = parseFloat(price);

    // Calculate position size with leverage
    const positionValue = marginAmount * leverage;
    console.log(`leverage`, leverage);
    console.log(`marginAmount`, marginAmount);

    console.log(`positionValue`, positionValue);

    const quantity = parseFloat((positionValue / entryPrice).toFixed(6));
    console.log(`quantity`, quantity);

    const exchangeInfo = await binance.futuresExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
    const pricePrecision = symbolInfo.pricePrecision;
    const quantityPrecision = symbolInfo.quantityPrecision;

    const qtyFixed = quantity.toFixed(quantityPrecision);

    // Calculate ROI-based stop loss and take profit prices
    const { stopLossPrice, takeProfitPrice } = calculateROIPrices(
      entryPrice,
      marginAmount,
      quantity,
      "SHORT"
    );

    const stopLossFixed = stopLossPrice.toFixed(pricePrecision);
    const takeProfitFixed = takeProfitPrice.toFixed(pricePrecision);

    console.log(`SHORT Order Details for ${symbol}:`);
    console.log(`Entry Price: ${entryPrice}`);
    console.log(`Quantity: ${qtyFixed}`);
    console.log(`Margin Used: ${marginAmount}`);
    console.log(`Position Value: ${positionValue} (${leverage}x leverage)`);
    console.log(`Stop Loss Price: ${stopLossFixed} (${STOP_LOSS_ROI}% ROI)`);
    console.log(
      `Take Profit Price: ${takeProfitFixed} (${TAKE_PROFIT_ROI}% ROI)`
    );

    // Place market sell order
    const shortOrder = await binance.futuresMarketSell(symbol, qtyFixed);
    console.log(`Shorted ${symbol} at ${entryPrice}`);

    const shortOrderDetails = {
      side: "SHORT",
      symbol,
      quantity: qtyFixed,
      ShortTimeCurrentPrice: entryPrice,
      placeOrderId: shortOrder.orderId,
      marginUsed: marginAmount,
      leverage: leverage,
      positionValue: positionValue,
    };

    const tradeResponse = await axios.post(API_ENDPOINT, {
      data: shortOrderDetails,
    });
    console.log(`Trade Response:`, tradeResponse?.data);

    const tradeId = tradeResponse.data._id;

    // Place stop loss order
    const stopLossOrder = await binance.futuresOrder(
      "STOP_MARKET",
      "BUY",
      symbol,
      qtyFixed,
      null,
      {
        stopPrice: stopLossFixed,
        reduceOnly: true,
        timeInForce: "GTC",
      }
    );
    console.log(
      `Stop Loss set at ${stopLossFixed} for ${symbol} (${STOP_LOSS_ROI}% ROI)`
    );

    // Place take profit order
    const takeProfitOrder = await binance.futuresOrder(
      "TAKE_PROFIT_MARKET",
      "BUY",
      symbol,
      qtyFixed,
      null,
      {
        stopPrice: takeProfitFixed,
        reduceOnly: true,
        timeInForce: "GTC",
      }
    );
    console.log(
      `Take Profit set at ${takeProfitFixed} for ${symbol} (${TAKE_PROFIT_ROI}% ROI)`
    );

    const details = {
      takeProfitPrice: takeProfitFixed,
      profitOrderId: takeProfitOrder.orderId,
      stopLossPrice: stopLossFixed,
      stopLossOrderId: stopLossOrder.orderId,
    };

    await axios.put(`${API_ENDPOINT}${tradeId}`, {
      data: details,
    });
  } catch (error) {
    console.error(`Error placing SHORT order for ${symbol}:`, error);
  }
}


async function initializeModels() {
  for (const sym of symbols) {
    const isValid = await verifySymbol(sym);
    if (!isValid) {
      console.warn(`Symbol ${sym} is not valid on Binance Futures, skipping.`);
      continue;
    }
    console.log(`Training LSTM model for ${sym}`);
    const model = await trainLSTM(sym, "3m");
    if (model) {
      console.log(`Model training completed for ${sym}`);
    } else {
      console.warn(`Model training failed for ${sym}`);
    }
  }
  console.log("All models initialized.");
}
// 🔁 Main Loop
setInterval(async () => {
  await initializeModels(); 
  console.log("Starting main trading loop...");
  const totalBalance = await getUsdtBalance();
  const usableBalance = totalBalance - 5.1; // Keep $5.1 reserve
  console.log(`usableBalance usableBalance usableBalance`, usableBalance);

  const maxSpendPerTrade = usableBalance / symbols.length;
  console.log(`maxSpendPerTrade`, maxSpendPerTrade);

  if (usableBalance <= 6) {
    console.log("Not enough balance to trade.");
    return;
  }

  console.log(`Total Balance: ${totalBalance} USDT`);
  console.log(`Usable Balance: ${usableBalance} USDT`);
  console.log(`Max Spend Per Trade: ${maxSpendPerTrade} USDT`);

  for (const sym of symbols) {
    try {
      const response = await axios.post(`${API_ENDPOINT}check-symbols`, {
        symbols: sym,
      });

      let status = response?.data?.data.status;

      if (status == true) {
        await processSymbol(sym, maxSpendPerTrade);
      } else {
        console.log(`TRADE ALREADY OPEN FOR SYMBOL: ${sym}`);
      }
    } catch (err) {
      console.error(`Error with ${sym}:`, err.message);
    }
  }
}, 60 * 1000); // Run every 1 minute

async function checkOrders(symbol) {
  try {
    const response = await axios.get(`${API_ENDPOINT}find-treads/${symbol}`);
    console.log(`response.data?.data`, response.data?.data);

    const { found } = response.data?.data;

    if (!found) return;

    const { tradeDetails } = response.data?.data;
    const { stopLossOrderId, takeProfitOrderId, objectId } = tradeDetails;
    console.log(
      ` stopLossOrderId, takeProfitOrderId,`,
      stopLossOrderId,
      takeProfitOrderId
    );

    console.log(`objectId:`, objectId);

    if (!stopLossOrderId || !takeProfitOrderId) {
      console.log(`No order IDs found for ${symbol}`);
      return;
    }

    // Get initial order statuses
    const stopLossStatus = await binance.futuresOrderStatus(symbol, {
      orderId: stopLossOrderId,
    });

    const takeProfitStatus = await binance.futuresOrderStatus(symbol, {
      orderId: takeProfitOrderId,
    });

    const stopLossOrderStatus = stopLossStatus?.status;
    const takeProfitOrderStatus = takeProfitStatus?.status;

    console.log(`Stop Loss Status for ${symbol}:`, stopLossOrderStatus);
    console.log(`Take Profit Status for ${symbol}:`, takeProfitOrderStatus);

    const isStopLossFilled = stopLossOrderStatus === "FILLED";
    const isTakeProfitFilled = takeProfitOrderStatus === "FILLED";

    if (isStopLossFilled || isTakeProfitFilled) {
      console.log(`One of the orders is filled for ${symbol}`);

      // If Stop Loss is NOT filled, check again before canceling
      if (!isStopLossFilled) {
        const recheckStopLoss = await binance.futuresOrderStatus(symbol, {
          orderId: stopLossOrderId,
        });
        if (
          recheckStopLoss?.status !== "CANCELED" &&
          recheckStopLoss?.status !== "FILLED"
        ) {
          await binance.futuresCancel(symbol, stopLossOrderId);
          console.log(`Stop Loss order canceled`);
        } else {
          console.log(`Stop Loss already canceled or filled`);
        }
      }

      // If Take Profit is NOT filled, check again before canceling
      if (!isTakeProfitFilled) {
        const recheckTakeProfit = await binance.futuresOrderStatus(symbol, {
          orderId: takeProfitOrderId,
        });
        if (
          recheckTakeProfit?.status !== "CANCELED" &&
          recheckTakeProfit?.status !== "FILLED"
        ) {
          await binance.futuresCancel(symbol, takeProfitOrderId);
          console.log(`Take Profit order canceled`);
        } else {
          console.log(`Take Profit already canceled or filled`);
        }
      }

      // Mark trade as closed
      const data = await axios.put(`${API_ENDPOINT}${objectId}`, {
        data: { status: "1" },
      });
      console.log(`Trade marked as closed in DB for ${symbol}`, data?.data);
    } else {
      console.log(
        `Neither order is filled yet for ${symbol}. No action taken.`
      );
    }
  } catch (error) {
    console.error("Error checking or canceling orders:", error);
  }
}

setInterval(async () => {
  for (const sym of symbols) {
    await checkOrders(sym);
  }
}, 30000);

