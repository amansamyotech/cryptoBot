function calculateTEMA(prices, length) {
  if (prices.length < length * 3) return null;

  // Calculate first EMA
  let ema1 = [];
  let k1 = 2 / (length + 1);
  ema1[0] = prices[0];

  for (let i = 1; i < prices.length; i++) {
    ema1[i] = prices[i] * k1 + ema1[i - 1] * (1 - k1);
  }

  // Calculate second EMA (EMA of EMA1)
  let ema2 = [];
  ema2[0] = ema1[0];

  for (let i = 1; i < ema1.length; i++) {
    ema2[i] = ema1[i] * k1 + ema2[i - 1] * (1 - k1);
  }

  // Calculate third EMA (EMA of EMA2)
  let ema3 = [];
  ema3[0] = ema2[0];

  for (let i = 1; i < ema2.length; i++) {
    ema3[i] = ema2[i] * k1 + ema3[i - 1] * (1 - k1);
  }

  // TEMA formula: 3*EMA1 - 3*EMA2 + EMA3
  const tema = [];
  for (let i = 0; i < prices.length; i++) {
    tema[i] = 3 * ema1[i] - 3 * ema2[i] + ema3[i];
  }

  return tema[tema.length - 1]; // Return latest TEMA value
}

function getTEMApercentage(tema15, tema21) {
  const total = tema15 + tema21;

  const percent15 = (tema15 / total) * 100;
  const percent21 = (tema21 / total) * 100;

  return {
    percent15,
    percent21,
  };
}

module.exports = { calculateTEMA, getTEMApercentage };
