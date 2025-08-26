require('dotenv').config();
const LEVERAGE = process.env.LEVERAGE || 3;
const STOP_LOSS_ROI = -(process.env.LEVERAGE || 1);
const PROFIT_TRIGGER_ROI = process.env.PROFIT_TRIGGER_ROI || 1.5;
const PROFIT_LOCK_ROI = process.env.PROFIT_LOCK_ROI  || 0.5;

const symbols = ["SOLUSDT", "INJUSDT", "XRPUSDT", "DOGEUSDT"];

module.exports = {
  symbols,
  LEVERAGE,
  STOP_LOSS_ROI,
  PROFIT_TRIGGER_ROI,
  PROFIT_LOCK_ROI,
};
