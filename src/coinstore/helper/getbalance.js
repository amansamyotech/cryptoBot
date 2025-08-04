const axios = require("axios");
const crypto = require("crypto");

const apiKey = "460e56f22bedb4cbb9908603dcd6f7b1"; // Replace with your API Key
const secretKey = "31e4c0d4d894de2250c4e0c152cb8158"; // Replace with your Secret Key

async function getUsdtBalance() {
  const url = "https://api.coinstore.com/api/spot/accountList";

  const expires = Date.now(); // Current time in milliseconds
  const expiresKey = Math.floor(expires / 30000).toString();

  // Step 1: Generate the first hash using secretKey and expiresKey
  const hashedKey = crypto
    .createHmac("sha256", secretKey)
    .update(expiresKey)
    .digest("hex");

  // Step 2: Generate the signature using the hashedKey and payload
  const payload = JSON.stringify({}); // Empty payload
  const signature = crypto
    .createHmac("sha256", Buffer.from(hashedKey, "hex"))
    .update(payload)
    .digest("hex");

  const headers = {
    "X-CS-APIKEY": apiKey,
    "X-CS-SIGN": signature,
    "X-CS-EXPIRES": expires.toString(),
    "exch-language": "en_US",
    "Content-Type": "application/json",
    "Accept": "application/json",
  };

  try {
    const response = await axios.post(url, payload, { headers });
    const data = response.data;

    if (data.code === "0") {
      const balances = data.data || [];
      const usdtBalance = balances
        .filter((entry) => entry.currency === "USDT")
        .reduce((total, entry) => total + parseFloat(entry.balance || 0), 0);
      console.log(`✅ USDT Balance: ${usdtBalance}`);
      return usdtBalance;
    } else {
      console.log(`❌ Error: ${data.message || "Unknown error"}`);
      return 0;
    }
  } catch (error) {
    console.error(
      "❌ Error fetching Coinstore balance:",
      error.response?.data || error.message
    );
    return 0;
  }
}

getUsdtBalance();