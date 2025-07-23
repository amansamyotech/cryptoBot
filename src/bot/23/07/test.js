
// // 📊 Calculate indicators\async function getIndicators(symbol) {
//   const candles = await getCandles(symbol, interval, 100);
//   const closes = candles.map(c => c.close);
//   const highs = candles.map(c => c.high);
//   const lows = candles.map(c => c.low);
//   const volumes = candles.map(c => c.volume);

//   // EMA
//   const ema20 = technicalIndicators.EMA.calculate({ period:20, values: closes }).pop();
//   const ema50 = technicalIndicators.EMA.calculate({ period:50, values: closes }).pop();

//   // RSI
//   const rsi14 = technicalIndicators.RSI.calculate({ period:14, values: closes }).pop();

//   // MACD
//   const macdData = technicalIndicators.MACD.calculate({
//     values: closes,
//     fastPeriod:12,
//     slowPeriod:26,
//     signalPeriod:9,
//     SimpleMAOscillator: false,
//     SimpleMASignal: false
//   }).pop() || {};
//   const macdLine = macdData.MACD;
//   const macdSignal = macdData.signal;

//   // Bollinger Bands
//   const bb = technicalIndicators.BollingerBands.calculate({
//     period: 20,
//     stdDev: 2,
//     values: closes
//   }).pop() || {};

//   // ADX
//   const adxData = technicalIndicators.ADX.calculate({
//     period: 14,
//     high: highs,
//     low: lows,
//     close: closes
//   }).pop() || {};
//   const adx = adxData.adx;

//   // VWMA
//   const vwma = technicalIndicators.VWMA.calculate({
//     period: 20,
//     values: closes,
//     volume: volumes
//   }).pop();

//   const latestVolume = volumes.pop();
//   const avgVolume = volumes.slice(-20).reduce((sum,v) => sum+v, 0)/20;

//   return {
//     ema20,
//     ema50,
//     rsi14,
//     macdLine,
//     macdSignal,
//     bbUpper: bb.upper,
//     bbLower: bb.lower,
//     adx,
//     vwma,
//     latestVolume,
//     avgVolume
//   };
// }

// // Candlestick pattern detection
// function isBullishEngulf(prev, curr) {
//   return curr.open < prev.close && curr.close > prev.open;
// }
// function isBearishEngulf(prev, curr) {
//   return curr.open > prev.close && curr.close < prev.open;
// }

// // 🧠 Decide Trade Direction using composite scoring
// async function decideTradeDirection(symbol) {
//   const ind = await getIndicators(symbol);
//   const candles = await getCandles(symbol, interval, 2);
//   const [prev, curr] = candles.slice(-2);

//   let score = 0;
//   // EMA trend
//   if (ind.ema20 > ind.ema50) score += 1; else score -= 1;
//   // RSI momentum
//   if (ind.rsi14 > 55) score += 1;
//   if (ind.rsi14 < 45) score -= 1;
//   // MACD momentum
//   if (ind.macdLine > ind.macdSignal) score += 1; else score -= 1;
//   // Volume spike
//   if (ind.latestVolume > ind.avgVolume * 1.5) score += 1;
//   // Bollinger reversal
//   const lastClose = curr.close;
//   if (lastClose < ind.bbLower && ind.rsi14 < 35) score += 2;
//   if (lastClose > ind.bbUpper && ind.rsi14 > 65) score += 2;
//   // ADX filter
//   if (ind.adx > 25) score += 1;
//   // Candlestick patterns
//   if (isBullishEngulf(prev, curr)) score += 2;
//   if (isBearishEngulf(prev, curr)) score += 2;

//   // Determine direction
//   if (score >= 6) return 'LONG';
//   if (score <= -6) return 'SHORT';
//   return 'HOLD';
// }

// // 📈 Buy/Short Logic
// async function processSymbol(symbol, maxSpendPerTrade) {
//   const decision = await decideTradeDirection(symbol);
//   if (decision === 'LONG') {
//     sendTelegram(✨ LONG SIGNAL for ${symbol});
//     await placeBuyOrder(symbol, maxSpendPerTrade);
//   } else if (decision === 'SHORT') {
//     sendTelegram(✨ SHORT SIGNAL for ${symbol});
//     await placeShortOrder(symbol, maxSpendPerTrade);
//   } else {
//     console.log(No trade signal for ${symbol});
//   }
// }

// // (PlaceBuyOrder and PlaceShortOrder remain unchanged)

// // 🔁 Main Loop
// setInterval(async () => {
//   const totalBalance = await getUsdtBalance();
//   const usableBalance = totalBalance - 6; // Reserve
//   if (usableBalance <= 6) return console.log('Not enough balance');
//   const maxSpend = usableBalance / symbols.length;
//   for (const sym of symbols) {
//     const { data } = await axios.post(${API_ENDPOINT}check-symbols, { symbols: sym });
//     if (data.data.status) await processSymbol(sym, maxSpend);
//     else console.log(Trade already open: ${sym});
//   }
// }, 5 * 60 * 1000);

// // 🔄 Order Checker (unchanged)