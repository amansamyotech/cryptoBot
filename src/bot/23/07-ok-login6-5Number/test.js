// 🧠 Decide Trade Direction
async function decideTradeDirection(symbol) {
  const ind = await getIndicators(symbol);
  const candles = await getCandles(symbol, interval, 2);
  const [prev, curr] = candles;

  let score = 0;
  let contributingIndicators = 0;

  if (ind.ema20 !== null && ind.ema50 !== null) {
    score += ind.ema20 > ind.ema50 ? 2 : -2;
    contributingIndicators++;
  }

  if (ind.rsi14 !== null) {
    score += ind.rsi14 > 60 ? 2 : ind.rsi14 < 40 ? -2 : 0;
    contributingIndicators++;
  }

  if (ind.macdLine !== null && ind.macdSignal !== null) {
    score += ind.macdLine > ind.macdSignal ? 2 : -2;
    contributingIndicators++;
  }

  if (
    ind.latestVolume !== null &&
    ind.avgVolume !== null &&
    ind.latestVolume > ind.avgVolume * 1.5
  ) {
    score += 1;
    contributingIndicators++;
  }

  if (curr) {
    const lastClose = curr.close;
    if (ind.bbLower !== null && ind.rsi14 < 35 && lastClose < ind.bbLower) {
      score += 2;
      contributingIndicators++;
    }
    if (ind.bbUpper !== null && ind.rsi14 > 65 && lastClose > ind.bbUpper) {
      score -= 2;
      contributingIndicators++;
    }
  }

  if (ind.adx !== null && ind.adx > 25) {
    score += 1;
    contributingIndicators++;
  }

  if (isBullishEngulf(prev, curr)) {
    score += 2;
    contributingIndicators++;
  }

  if (isBearishEngulf(prev, curr)) {
    score -= 2;
    contributingIndicators++;
  }

  console.log(Trade Decision Score for ${symbol}: ${score}, Contributing Indicators: ${contributingIndicators});

  if (contributingIndicators < 3) {
    return "HOLD";
  }

  if (score >= 5) return "LONG";
  if (score <= -5) return "SHORT";
  return "HOLD";
}