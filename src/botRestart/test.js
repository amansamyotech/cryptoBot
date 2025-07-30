// equire('dotenv').config();
// const axios = require('axios');
// const crypto = require('crypto');

// const API_KEY = process.env.BINANCE_API_KEY;
// const API_SECRET = process.env.BINANCE_API_SECRET;
// const BASE_URL = 'https://fapi.binance.com';

// const args = process.argv.slice(2);
// const positionSide = args[0]; // 'long' or 'short'
// if (!['long', 'short'].includes(positionSide)) {
//   console.error('Please pass "long" or "short" as argument');
//   process.exit();
// }

// const symbol = 'DOGEUSDT';
// const quantity = 500;
// const slStep = 0.01; // 1%
// const leverage = 3;

// let entryPrice = null;
// let trailingSL = null;
// let nextStepPrice = null;

// // Sign Request
// function sign(queryString) {
//   return crypto.createHmac('sha256', API_SECRET).update(queryString).digest('hex');
// }

// // Authenticated Request
// async function request(method, path, data = {}) {
//   const timestamp = Date.now();
//   const query = new URLSearchParams({ ...data, timestamp }).toString();
//   const signature = sign(query);
//   const fullUrl = ${BASE_URL}${path}?${query}&signature=${signature};
//   const headers = { 'X-MBX-API-KEY': API_KEY };
//   return axios({ method, url: fullUrl, headers });
// }

// // Set Leverage
// async function setLeverage() {
//   await request('POST', '/fapi/v1/leverage', {
//     symbol,
//     leverage
//   });
//   console.log(Leverage set to ${leverage}x);
// }

// // Place Order (LONG or SHORT)
// async function openPosition() {
//   const side = positionSide === 'long' ? 'BUY' : 'SELL';
//   const res = await request('POST', '/fapi/v1/order', {
//     symbol,
//     side,
//     type: 'MARKET',
//     quantity
//   });

//   const fill = res.data.avgFillPrice || res.data.avgPrice || res.data.fills?.[0]?.price;
//   entryPrice = parseFloat(fill);
//   const riskFactor = positionSide === 'long' ? -0.02 : 0.02;
//   trailingSL = entryPrice * (1 + riskFactor);
//   nextStepPrice = entryPrice * (1 + (positionSide === 'long' ? slStep : -slStep));

//   console.log(🔵 ${positionSide.toUpperCase()} Position Opened at $${entryPrice.toFixed(4)});
//   console.log(Initial SL: $${trailingSL.toFixed(4)}, First Target: $${nextStepPrice.toFixed(4)});
// }

// // Get Market Price
// async function getPrice() {
//   const res = await axios.get(${BASE_URL}/fapi/v1/ticker/price?symbol=${symbol});
//   return parseFloat(res.data.price);
// }

// // Close Position
// async function closePosition() {
//   const exitSide = positionSide === 'long' ? 'SELL' : 'BUY';
//   await request('POST', '/fapi/v1/order', {
//     symbol,
//     side: exitSide,
//     type: 'MARKET',
//     quantity
//   });
//   console.log('🔴 Position closed due to SL hit.');
//   process.exit();
// }

// // Monitor Logic
// async function monitor() {
//   const price = await getPrice();
//   console.log(Price: $${price.toFixed(4)} | SL: $${trailingSL.toFixed(4)});

//   if (
//     (positionSide === 'long' && price >= nextStepPrice) ||
//     (positionSide === 'short' && price <= nextStepPrice)
//   ) {
//     // Move SL by 1%
//     trailingSL = trailingSL * (1 + (positionSide === 'long' ? slStep : -slStep));
//     nextStepPrice = nextStepPrice * (1 + (positionSide === 'long' ? slStep : -slStep));
//     console.log(🟢 SL updated to $${trailingSL.toFixed(4)}, next target: $${nextStepPrice.toFixed(4)});
//   }

//   // Exit condition
//   if (
//     (positionSide === 'long' && price <= trailingSL) ||
//     (positionSide === 'short' && price >= trailingSL)
//   ) {
//     await closePosition();
//   }
// }

// // Start Bot
// (async () => {
//   try {
//     await setLeverage();
//     await openPosition();
//     setInterval(monitor, 5000); // monitor every 5s
//   } catch (e) {
//     console.error('❌ Error:', e.response?.data || e.message);
//   }
// })();