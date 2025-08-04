const axios = require("axios");
const crypto = require("crypto");

const apiKey = "460e56f22bedb4cbb9908603dcd6f7b1"; // Replace with your API Key
const secretKey = "31e4c0d4d894de2250c4e0c152cb8158"; // Replace with your Secret Key

async function getUsdtBalance() {
  const url = "https://api.coinstore.com/api/spot/accountList";

  const expires = Date.now(); // milliseconds
  const expiresKey = Math.floor(expires / 30000).toString();

  const hashedKey = crypto
    .createHmac("sha256", secretKey)
    .update(expiresKey)
    .digest("hex");

  const key = Buffer.from(hashedKey);

  const payload = JSON.stringify({}); // empty JSON body
  const signature = crypto
    .createHmac("sha256", key)
    .update(payload)
    .digest("hex");

  const headers = {
    "X-CS-APIKEY": apiKey,
    "X-CS-SIGN": signature,
    "X-CS-EXPIRES": expires.toString(),
    "exch-language": "en_US",
    "Content-Type": "application/json",
    Accept: "*/*",
  };

  try {
    const response = await axios.post(url, {}, { headers });
    const balances = response.data?.data || [];

    const usdtBalance = balances
      .filter((entry) => entry.currency === "USDT")
      .reduce((total, entry) => total + parseFloat(entry.balance), 0);

    console.log(`✅ USDT Balance: ${usdtBalance}`);
    return usdtBalance;
  } catch (error) {
    console.error(
      "❌ Error fetching Coinstore balance:",
      error.response?.data || error.message
    );
    return 0;
  }
}

getUsdtBalance();

module.exports = { getUsdtBalance };
