// const Binance = require("node-binance-api");
// const technicalIndicators = require("technicalindicators");
// const {
//   RSI,
//   MACD,
//   BollingerBands,
//   EMA,
//   ADX,
//   VWMA,
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
// // 📈 Indicator Settings
// const RSI_PERIOD = 14;
// const MACD_FAST = 12;
// const MACD_SLOW = 26;
// const MACD_SIGNAL = 9;
// const BB_PERIOD = 20;
// const BB_STD_DEV = 2;
// const EMA_FAST = 12;
// const EMA_SLOW = 26;
// const EMA_TREND_SHORT = 50;
// const EMA_TREND_LONG = 200;
// const ADX_PERIOD = 14;
// const VWMA_PERIOD = 20;
// const LONG_THRESHOLD = 3;
// const SHORT_THRESHOLD = -3;
// // 📊 Scoring Thresholds

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

//     // Calculate RSI with error handling
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

//     // Calculate MACD with error handling
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

//     // Calculate Bollinger Bands with error handling
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

//     // Calculate EMA Fast with error handling
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

//     // Calculate EMA Slow with error handling
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

//     // Calculate EMA Trend Short with error handling
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

//     // Calculate EMA Trend Long with error handling
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

//     // Calculate ADX with error handling
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

//     // Calculate VWMA with error handling (using custom function)
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

//     indicators.latestClose = closes[closes.length - 1];

//     return indicators;
//   } catch (error) {
//     console.error(`Error calculating indicators for ${symbol}:`, error.message);
//     throw error;
//   }
// }

// function getMarketCondition(indicators) {
//   const latestRSI = indicators.rsi[indicators.rsi.length - 1];
//   const latestADX = indicators.adx[indicators.adx.length - 1]?.adx;
//   if (!latestRSI || !latestADX) return "unknown";
//   if (latestADX < 20 || latestRSI > 70 || latestRSI < 30) return "sideways";
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

//   if (latestRSI > 50) score++;
//   else if (latestRSI < 50) score--;

//   if (latestMACD.MACD > latestMACD.signal) score++;
//   else score--;

//   if (latestClose < latestBB.lower) score++;
//   else if (latestClose > latestBB.upper) score--;

//   if (emaFast > emaSlow) score++;
//   else score--;

//   if (emaShort > emaLong) score++;
//   else score--;

//   if (latestClose > vwma) score++;
//   else score--;

//   if (score >= LONG_THRESHOLD) return "LONG";
//   else if (score <= SHORT_THRESHOLD) return "SHORT";
//   else return "HOLD";
// }

// async function processSymbol(symbol, maxSpendPerTrade) {
//   const indicators = await getIndicators(symbol, "3m");
//   const marketCondition = getMarketCondition(indicators);

//   if (marketCondition === "sideways") {
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



const Binance = require('binance-api-node').default;
const { EMA, RSI, Stochastic } = require('technicalindicators');

// Initialize Binance client (no keys needed for historical data)
const client = Binance();

// Strategy Configuration
const config = {
  symbol: 'BTCUSDT',
  interval: '1m',          // 1-minute candles
  startTime: '2024-07-01', // Backtest start date (YYYY-MM-DD)
  endTime: '2024-07-28',   // Backtest end date
  emaFast: 9,              // Fast EMA period
  emaSlow: 21,             // Slow EMA period
  rsiPeriod: 14,           // RSI period
  stochPeriod: 14,         // Stochastic period
  stopLossPercent: 0.8,    // 0.8% Stop Loss
  takeProfitPercent: 1.2   // 1.2% Take Profit
};

// Performance Tracking
const results = {
  trades: [],
  totalTrades: 0,
  profitableTrades: 0,
  totalProfit: 0,
  maxProfit: 0,
  maxLoss: 0
};

async function backtestStrategy() {
  try {
    console.log('🚀 Fetching historical data...');
    
    // Get historical candles
    const candles = await client.candles({
      symbol: config.symbol,
      interval: config.interval,
      startTime: new Date(config.startTime).getTime(),
      endTime: new Date(config.endTime).getTime(),
      limit: 1000
    });

    console.log(📊 Analyzing ${candles.length} candles...);
    
    // Prepare data arrays
    const closes = candles.map(c => parseFloat(c.close));
    const highs = candles.map(c => parseFloat(c.high));
    const lows = candles.map(c => parseFloat(c.low));
    const timestamps = candles.map(c => new Date(c.openTime));

    // Track trading position
    let position = null;
    
    // Process each candle
    for (let i = Math.max(config.emaSlow, config.stochPeriod); i < candles.length; i++) {
      // Slice data up to current index
      const closesSlice = closes.slice(0, i + 1);
      const highsSlice = highs.slice(0, i + 1);
      const lowsSlice = lows.slice(0, i + 1);
      
      // Calculate indicators
      const emaFast = EMA.calculate({
        period: config.emaFast,
        values: closesSlice
      }).pop();
      
      const emaSlow = EMA.calculate({
        period: config.emaSlow,
        values: closesSlice
      }).pop();
      
      const rsi = RSI.calculate({
        period: config.rsiPeriod,
        values: closesSlice
      }).pop();
      
      const stoch = Stochastic.calculate({
        high: highsSlice,
        low: lowsSlice,
        close: closesSlice,
        period: config.stochPeriod,
        signalPeriod: 3
      }).pop();
      
      const price = closes[i];
      const timestamp = timestamps[i];
      
      // Generate signal
      const bullish = emaFast > emaSlow && rsi < 35 && stoch.k < 20 && stoch.k > stoch.d;
      const bearish = emaFast < emaSlow && rsi > 65 && stoch.k > 80 && stoch.k < stoch.d;
      
      // Check for entry signal
      if (!position && (bullish || bearish)) {
        position = {
          type: bullish ? 'LONG' : 'SHORT',
          entryPrice: price,
          entryTime: timestamp,
          stopLoss: bullish 
            ? price * (1 - config.stopLossPercent/100)
            : price * (1 + config.stopLossPercent/100),
          takeProfit: bullish 
            ? price * (1 + config.takeProfitPercent/100)
            : price * (1 - config.takeProfitPercent/100)
        };
      }
      
      // Check for exit conditions
      if (position) {
        let exitReason = '';
        let exitPrice = price;
        let profit = 0;
        
        // LONG position exit checks
        if (position.type === 'LONG') {
          // Take Profit hit
          if (price >= position.takeProfit) {
            exitReason = 'TP';
          } 
          // Stop Loss hit
          else if (price <= position.stopLoss) {
            exitReason = 'SL';
          }
        }
        // SHORT position exit checks
        else if (position.type === 'SHORT') {
          // Take Profit hit
          if (price <= position.takeProfit) {
            exitReason = 'TP';
          } 
          // Stop Loss hit
          else if (price >= position.stopLoss) {
            exitReason = 'SL';
          }
        }
        
        // Close position if exit triggered
        if (exitReason) {
          // Calculate profit percentage
          if (position.type === 'LONG') {
            profit = ((exitPrice - position.entryPrice) / position.entryPrice) * 100;
          } else {
            profit = ((position.entryPrice - exitPrice) / position.entryPrice) * 100;
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
            profit: profit.toFixed(2) + '%',
            type: position.type,
            reason: exitReason,
            duration: Math.round((timestamp - position.entryTime)/(1000*60)) + ' mins'
          });
          
          // Reset position
          position = null;
        }
      }
    }
    
    // Generate report
    const winRate = (results.profitableTrades / results.totalTrades * 100) || 0;
    const avgProfit = results.totalTrades > 0 
      ? (results.totalProfit / results.totalTrades).toFixed(2) 
      : 0;
      
    console.log('\n=============== BACKTEST REPORT ===============');
    console.log(📅 Period: ${config.startTime} to ${config.endTime});
    console.log(💹 Symbol: ${config.symbol} | Timeframe: ${config.interval});
    console.log(🔢 Total Trades: ${results.totalTrades});
    console.log(✅ Win Rate: ${winRate.toFixed(2)}%);
    console.log(📈 Avg Profit Per Trade: ${avgProfit}%);
    console.log(🚀 Total Profit: ${results.totalProfit.toFixed(2)}%);
    console.log(🏆 Max Profit: ${results.maxProfit.toFixed(2)}%);
    console.log(🔥 Max Loss: ${results.maxLoss.toFixed(2)}%);
    console.log('-----------------------------------------------');
    
    // Show recent trades
    console.log('🔁 Last 5 Trades:');
    results.trades.slice(-5).forEach((trade, i) => {
      console.log(#${i+1}: ${trade.type} | Entry: ${trade.entry} | Exit: ${trade.exit} | Profit: ${trade.profit} (${trade.reason}) | Duration: ${trade.duration});
    });
    
    // Calculate risk-reward ratio
    const avgWin = results.trades.filter(t => parseFloat(t.profit) > 0)
                          .reduce((sum, t) => sum + parseFloat(t.profit), 0) / results.profitableTrades || 0;
    const avgLoss = results.trades.filter(t => parseFloat(t.profit) < 0)
                          .reduce((sum, t) => sum + parseFloat(t.profit), 0) / (results.totalTrades - results.profitableTrades) || 0;
    const riskReward = Math.abs(avgWin / avgLoss);
    
    console.log('-----------------------------------------------');
    console.log(⚖️ Risk-Reward Ratio: ${riskReward.toFixed(2)}:1);
    console.log(💰 Expectancy: ${(winRate/100 * avgWin + (100-winRate)/100 * avgLoss).toFixed(2)}%);
    console.log('===============================================');
    
  } catch (error) {
    console.error('Backtest failed:', error);
  }
}

// Run backtest
backtestStrategy();