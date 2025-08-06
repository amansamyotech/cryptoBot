const axios = require("axios");
const crypto = require("crypto");

const apiKey = "6a5f74af1896d386871045899d82ea1a"; // Your API key
const secretKey = "54eefc696aeb13bb807a44e32b349b2a"; // Your secret key
const baseUrl = "https://api.coinstore.com/api/spot/accountList";

// Manually set timestamp (e.g., current time in milliseconds, adjust as needed)
// Current time is approximately 04:22 PM IST on August 06, 2025 = 1722949720000 ms
const manualTimestamp = 1722949720000; // Adjust to match the exact time of your request

async function checkBalance() {
  try {
    const expires = manualTimestamp; // Use manual timestamp instead of Date.now()
    console.log("Manual Timestamp (ms):", expires); // Debug to verify timestamp
    const expiresKey = Math.floor(expires / 30000).toString();
    const key = crypto
      .createHmac("sha256", secretKey)
      .update(expiresKey)
      .digest("hex");

    const payload = JSON.stringify({});
    const signature = crypto
      .createHmac("sha256", key)
      .update(payload)
      .digest("hex");

    const headers = {
      "X-CS-APIKEY": apiKey,
      "X-CS-SIGN": signature,
      "X-CS-EXPIRES": expires.toString(),
      "Content-Type": "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      Accept: "*/*",
    };

    // Dynamically detect network interface
    const interfaces = require("os").networkInterfaces();
    let ipAddress = "Unknown";
    for (let name in interfaces) {
      const iface = interfaces[name];
      for (let config of iface) {
        if (config.family === "IPv4" && !config.internal) {
          ipAddress = config.address;
          break;
        }
      }
      if (ipAddress !== "Unknown") break;
    }
    console.log("Request IP (Local):", ipAddress); // Debug local IP
    console.log("Expires:", expires, "Signature:", signature); // Debug values

    const response = await axios.post(baseUrl, payload, {
      headers,
      timeout: 10000,
    });

    if (response.data.code === "0") {
      console.log("Balance Data:", response.data.data);
      const usdtBalance = response.data.data.find(
        (item) => item.currency === "USDT"
      );
      if (usdtBalance) {
        console.log(`USDT Balance: ${usdtBalance.balance}`);
      } else {
        console.log("USDT balance not found.");
      }
    } else {
      console.error("Error:", response.data.message);
    }
  } catch (error) {
    if (error.response) {
      console.error("API Error:", error.response.data);
      if (error.response.status === 403) {
        console.error(
          "Cloudflare Block Detected. Ray ID:",
          error.response.data?.["Ray-ID"] || "Not provided"
        );
      }
    } else {
      console.error("Request Error:", error.message);
    }
  }
}

checkBalance();
