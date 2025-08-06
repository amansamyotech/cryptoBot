// const Binance = require("node-binance-api");
// const axios = require("axios");
// const { decideTradeDirection } = require("./decideTradeFuntion");
// const { checkOrders } = require("./orderCheckFun");

// const API_ENDPOINT = "http://localhost:3001/api/buySell/";

// const binance = new Binance().options({
//   APIKEY: "whfiekZqKdkwa9fEeUupVdLZTNxBqP1OCEuH2pjyImaWt51FdpouPPrCawxbsupK",
//   APISECRET: "E4IcteWOQ6r9qKrBZJoBy4R47nNPBDepVXMnS3Lf2Bz76dlu0QZCNh82beG2rHq4",
//   useServerTime: true,
//   test: false,
// });

// const symbols = [
//   "XRPUSDT",
//   "SUIUSDT",
//   "BNBUSDT",
//   "ADAUSDT",
//   "DOGEUSDT",
//   "LEVERUSDT",
//   "WIFUSDT",
//   "1000FLOKIUSDT",
//   "CKBUSDT",
// ];

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

// const interval = "1m";
// const LEVERAGE = 3;
// const STOP_LOSS_ROI = -2;
// const TRAILING_START_ROI = 1;
// const INITIAL_TRAILING_ROI = 1;
// const ROI_STEP = 1;

// async function trailStopLossForLong(symbol, tradeDetails, currentPrice) {
//   try {
//     const {
//       stopLossOrderId,
//       objectId,
//       LongTimeCoinPrice: { $numberDecimal: longTimePrice },
//       quantity,
//       stopLossPrice: oldStopLoss,
//       marginUsed,
//       leverage,
//     } = tradeDetails;

//     const entryPrice = parseFloat(longTimePrice);
//     const oldStop = parseFloat(oldStopLoss);
//     const margin = parseFloat(marginUsed);
//     const lev = parseFloat(leverage);
//     const qty = parseFloat(quantity);
//     const pnl = (currentPrice - entryPrice) * qty;
//     const roi = (pnl / margin) * 100;

//     const exchangeInfo = await binance.futuresExchangeInfo();
//     const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
//     const pricePrecision = symbolInfo.pricePrecision;
//     const quantityPrecision = symbolInfo.quantityPrecision;
//     const qtyFixed = qty.toFixed(quantityPrecision);

//     if (roi >= TRAILING_START_ROI) {
//       let newStop;
//       let targetROI;
//       let targetPnL;

//       if (roi <= 1) {
//         newStop = parseFloat(entryPrice.toFixed(pricePrecision));
//       } else {
//         targetROI = roi - 1;
//         targetPnL = (targetROI / 100) * margin;
//         newStop = parseFloat(
//           (entryPrice + targetPnL / qty).toFixed(pricePrecision)
//         );
//       }

//       // if (roi >= TRAILING_START_ROI) {
//       //   const targetROI = roi - 1;
//       //   const targetPnL = (targetROI / 100) * margin;

//       //   const newStop = parseFloat(
//       //     (entryPrice + targetPnL / qty).toFixed(pricePrecision)
//       //   );
//       const roundedCurrent = parseFloat(currentPrice.toFixed(pricePrecision));

//       if (newStop >= roundedCurrent) {
//         console.warn(
//           `[${symbol}] Skipping SL update — newStop (${newStop}) >= currentPrice (${roundedCurrent})`
//         );
//         return;
//       }

//       console.log(`oldStop: ${oldStop}`);
//       console.log(`roundedCurrent: ${roundedCurrent}`);
//       console.log(`newStop: ${newStop}`);
//       console.log(`targetPnL: ${targetPnL}`);
//       console.log(`targetROI: ${targetROI}`);

//       if (newStop > oldStop) {
//         console.log(
//           `[${symbol}] LONG ROI ${roi.toFixed(
//             2
//           )}% → Updating SL from ${oldStop} to ${newStop} (Target ROI: ${targetROI.toFixed(
//             2
//           )}%)`
//         );
//         let orderId = parseInt(stopLossOrderId);
//         let orderExists = false;
//         try {
//           const order = await binance.futuresOrderStatus(symbol, {
//             orderId,
//           });
//           orderExists =
//             order && order.status !== "CANCELED" && order.status !== "FILLED";
//         } catch (err) {
//           console.warn(
//             `[${symbol}] Failed to fetch order ${orderId}:`,
//             err.message
//           );
//         }

//         if (orderExists) {
//           try {
//             await binance.futuresCancel(symbol, orderId);
//           } catch (err) {
//             console.warn(
//               `[${symbol}] Failed to cancel order ${orderId}:`,
//               err.message
//             );
//           }
//         }

//         const tickSize = Math.pow(10, -pricePrecision);
//         const bufferMultiplier = 5;
//         const buffer = tickSize * bufferMultiplier;
//         const adjustedStop = parseFloat(
//           (newStop - buffer).toFixed(pricePrecision)
//         );
//         console.log(`adjustedStop`, adjustedStop);

//         const stopLossOrder = await binance.futuresOrder(
//           "STOP_MARKET",
//           "SELL",
//           symbol,
//           qtyFixed,
//           null,
//           {
//             stopPrice: adjustedStop,
//             reduceOnly: true,
//             timeInForce: "GTC",
//           }
//         );

//         await axios.put(`${API_ENDPOINT}${objectId}`, {
//           data: {
//             stopLossPrice: newStop,
//             stopLossOrderId: stopLossOrder.orderId,
//             isProfit: true,
//           },
//         });

//         console.log(`[${symbol}] LONG Stop Loss updated successfully.`);
//       } else {
//         console.log(
//           `[${symbol}] LONG ROI ${roi.toFixed(2)}% — SL unchanged (${oldStop}).`
//         );
//       }
//     } else {
//       console.log(
//         `[${symbol}] LONG ROI ${roi.toFixed(
//           2
//         )}% — Below ${TRAILING_START_ROI}%, no trailing yet.`
//       );
//     }
//   } catch (err) {
//     console.error(`[${symbol}] Error trailing LONG stop-loss:`, err.message);
//   }
// }

// async function trailStopLossForShort(symbol, tradeDetails, currentPrice) {
//   try {
//     const {
//       stopLossOrderId,
//       objectId,
//       ShortTimeCurrentPrice: { $numberDecimal: shortTimeCurrentPrice },
//       quantity,
//       stopLossPrice: oldStopLoss,
//       marginUsed,
//       leverage,
//     } = tradeDetails;

//     const entryPrice = parseFloat(shortTimeCurrentPrice);
//     const oldStop = parseFloat(oldStopLoss);
//     const margin = parseFloat(marginUsed);
//     const lev = parseFloat(leverage);
//     const qty = parseFloat(quantity);
//     const pnl = (entryPrice - currentPrice) * qty;
//     const roi = (pnl / margin) * 100;

//     const exchangeInfo = await binance.futuresExchangeInfo();
//     const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
//     const pricePrecision = symbolInfo.pricePrecision;
//     const quantityPrecision = symbolInfo.quantityPrecision;
//     const qtyFixed = qty.toFixed(quantityPrecision);

//     if (roi >= TRAILING_START_ROI) {
//       let newStop;
//       let targetROI;
//       let targetPnL;
//       if (roi <= 1) {
//         // When ROI is 1%, set stop-loss to entry price (break-even)
//         newStop = parseFloat(entryPrice.toFixed(pricePrecision));
//       } else {
//         // For ROI > 1%, trail 1% behind as original
//         targetROI = roi - 1;
//         targetPnL = (targetROI / 100) * margin;
//         newStop = parseFloat(
//           (entryPrice - targetPnL / qty).toFixed(pricePrecision)
//         );
//       }
//       // if (roi >= TRAILING_START_ROI) {
//       //   const targetROI = roi - 1;
//       //   const targetPnL = (targetROI / 100) * margin;

//       //   const newStop = parseFloat(
//       //     (entryPrice - targetPnL / qty).toFixed(pricePrecision)
//       //   );
//       const roundedStop = parseFloat(newStop.toFixed(pricePrecision));
//       const roundedCurrent = parseFloat(currentPrice.toFixed(pricePrecision));

//       if (roundedStop <= roundedCurrent) {
//         console.warn(
//           `[${symbol}] Skipping SL update — newStop (${roundedStop}) <= currentPrice (${roundedCurrent})`
//         );
//         return;
//       }

//       console.log(`oldStop: ${oldStop}`);
//       console.log(`roundedStop: ${roundedStop}`);
//       console.log(`roundedCurrent: ${roundedCurrent}`);
//       console.log(`newStop: ${newStop}`);
//       console.log(`targetPnL: ${targetPnL}`);
//       console.log(`targetROI: ${targetROI}`);

//       if (roundedStop < oldStop) {
//         console.log(
//           `[${symbol}] SHORT ROI ${roi.toFixed(
//             2
//           )}% → Updating SL from ${oldStop} to ${roundedStop} (Target ROI: ${targetROI.toFixed(
//             2
//           )}%)`
//         );
//         let orderId = parseInt(stopLossOrderId);
//         let orderExists = false;
//         try {
//           const order = await binance.futuresOrderStatus(symbol, {
//             orderId,
//           });
//           orderExists =
//             order && order.status !== "CANCELED" && order.status !== "FILLED";
//         } catch (err) {
//           console.warn(
//             `[${symbol}] Failed to fetch order ${orderId}:`,
//             err.message
//           );
//         }

//         if (orderExists) {
//           try {
//             await binance.futuresCancel(symbol, orderId);
//           } catch (err) {
//             console.warn(
//               `[${symbol}] Failed to cancel order ${orderId}:`,
//               err.message
//             );
//           }
//         }
//         const tickSize = Math.pow(10, -pricePrecision);
//         const bufferMultiplier = 5;
//         const buffer = tickSize * bufferMultiplier;

//         const adjustedStop = parseFloat(
//           (roundedStop + buffer).toFixed(pricePrecision)
//         );

//         console.log(`adjustedStop`, adjustedStop);

//         const stopLossOrder = await binance.futuresOrder(
//           "STOP_MARKET",
//           "BUY",
//           symbol,
//           qtyFixed,
//           null,
//           {
//             stopPrice: adjustedStop,
//             reduceOnly: true,
//             timeInForce: "GTC",
//           }
//         );

//         await axios.put(`${API_ENDPOINT}${objectId}`, {
//           data: {
//             stopLossPrice: roundedStop,
//             stopLossOrderId: stopLossOrder.orderId,
//             isProfit: true,
//           },
//         });

//         console.log(`[${symbol}] SHORT Stop Loss updated successfully.`);
//       } else {
//         console.log(
//           `[${symbol}] SHORT ROI ${roi.toFixed(
//             2
//           )}% — SL unchanged (${oldStop}). New stop ${roundedStop} is not better than current.`
//         );
//       }
//     } else {
//       console.log(
//         `[${symbol}] SHORT ROI ${roi.toFixed(
//           2
//         )}% — Below ${TRAILING_START_ROI}%, no trailing yet.`
//       );
//     }
//   } catch (err) {
//     console.error(`[${symbol}] Error trailing SHORT stop-loss:`, err.message);
//   }
// }


// module.exports = { trailStopLossForLong , trailStopLossForShort}