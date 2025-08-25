function calculateTEMA(prices, period) {
  if (!prices || prices.length < period) {
    console.warn(
      `Not enough data points for TEMA calculation. Need: ${period}, Have: ${prices.length}`
    );
    return [];
  }

  const k = 2 / (period + 1);
  const ema1 = [];
  const ema2 = [];
  const ema3 = [];

  
  ema1[0] = prices[0];
  for (let i = 1; i < prices.length; i++) {
    ema1[i] = prices[i] * k + ema1[i - 1] * (1 - k);
  }

  
  ema2[0] = ema1[0];
  for (let i = 1; i < ema1.length; i++) {
    ema2[i] = ema1[i] * k + ema2[i - 1] * (1 - k);
  }

  
  ema3[0] = ema2[0];
  for (let i = 1; i < ema2.length; i++) {
    ema3[i] = ema2[i] * k + ema3[i - 1] * (1 - k);
  }

  
  const tema = [];
  for (let i = 0; i < prices.length; i++) {
    tema[i] = 3 * ema1[i] - 3 * ema2[i] + ema3[i];
  }

  return tema;
}


module.exports = { calculateTEMA };