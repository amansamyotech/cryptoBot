const axios = require("axios");
const crypto = require("crypto");
const { HttpsProxyAgent } = require('https-proxy-agent');

const apiKey = "6a5f74af1896d386871045899d82ea1a"; // Replace with your API Key
const secretKey = "54eefc696aeb13bb807a44e32b349b2a"; // Replace with your Secret Key

// Proxy configuration - add your proxy details here
const PROXY_CONFIG = {
  enabled: false, // Set to true when you have a proxy
  url: 'http://username:password@proxy-server:port' // Replace with your proxy
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getUsdtBalance() {
  const url = "https://api.coinstore.com/api/spot/accountList";
  
  const expires = Date.now();
  const expiresKey = Math.floor(expires / 30000).toString();
  
  try {
    const hashedKey = crypto
      .createHmac("sha256", secretKey)
      .update(expiresKey)
      .digest("hex");
    
    const payload = JSON.stringify({});
    const signature = crypto
      .createHmac("sha256", Buffer.from(hashedKey, "hex"))
      .update(payload)
      .digest("hex");
    
    // Enhanced headers with even more realistic browser simulation
    const headers = {
      "X-CS-APIKEY": apiKey,
      "X-CS-SIGN": signature,
      "X-CS-EXPIRES": expires.toString(),
      "exch-language": "en_US",
      "Content-Type": "application/json",
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9,hi;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      "Origin": "https://coinstore.com",
      "Referer": "https://coinstore.com/spot/trade/BTCUSDT",
      "Connection": "keep-alive",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-site",
      "sec-ch-ua": '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "DNT": "1",
      "Sec-GPC": "1"
    };
    
    // Axios configuration
    const axiosConfig = {
      headers,
      timeout: 30000,
      validateStatus: function (status) {
        return status < 500;
      }
    };
    
    // Add proxy if enabled
    if (PROXY_CONFIG.enabled) {
      axiosConfig.httpsAgent = new HttpsProxyAgent(PROXY_CONFIG.url);
      console.log("🌐 Using proxy connection...");
    }
    
    // Random delay to simulate human behavior
    const randomDelay = Math.floor(Math.random() * 3000) + 1000; // 1-4 seconds
    await delay(randomDelay);
    
    console.log("🔄 Attempting to fetch balance from Coinstore...");
    
    const response = await axios.post(url, payload, axiosConfig);
    
    console.log(`📊 Response status: ${response.status}`);
    
    if (response.status === 403) {
      console.log("🚫 Still blocked by Cloudflare. Try these alternatives:");
      console.log("   1. Set up a residential proxy (see instructions below)");
      console.log("   2. Use curl command directly");
      console.log("   3. Deploy on different cloud provider (AWS, GCP, Azure)");
      return 0;
    }
    
    const data = response.data;
    
    if (data && data.code === "0") {
      const balances = data.data || [];
      const usdtEntries = balances.filter((entry) => entry.currency === "USDT");
      const usdtBalance = usdtEntries.reduce((total, entry) => {
        const balance = parseFloat(entry.balance || 0);
        const frozen = parseFloat(entry.frozen || 0);
        return total + balance + frozen;
      }, 0);
      
      console.log(`✅ USDT Balance: ${usdtBalance.toFixed(6)} USDT`);
      return usdtBalance;
    } else {
      console.log(`❌ API Error: ${data?.message || "Unknown error"}`);
      return 0;
    }
    
  } catch (error) {
    console.error("❌ Error fetching balance:", error.message);
    return 0;
  }
}

// Alternative: Try with curl command
function generateCurlCommand() {
  const expires = Date.now();
  const expiresKey = Math.floor(expires / 30000).toString();
  
  const hashedKey = crypto
    .createHmac("sha256", secretKey)
    .update(expiresKey)
    .digest("hex");
  
  const payload = JSON.stringify({});
  const signature = crypto
    .createHmac("sha256", Buffer.from(hashedKey, "hex"))
    .update(payload)
    .digest("hex");
  
  const curlCommand = `curl -X POST "https://api.coinstore.com/api/spot/accountList" \\
  -H "X-CS-APIKEY: ${apiKey}" \\
  -H "X-CS-SIGN: ${signature}" \\
  -H "X-CS-EXPIRES: ${expires}" \\
  -H "exch-language: en_US" \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json" \\
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \\
  -H "Origin: https://coinstore.com" \\
  -H "Referer: https://coinstore.com/" \\
  -d '{}'`;
  
  console.log("\n🔧 Try this curl command manually:");
  console.log("=" .repeat(60));
  console.log(curlCommand);
  console.log("=" .repeat(60));
}

async function main() {
  console.log("🚀 Starting Coinstore Balance Check...");
  console.log("=" .repeat(50));
  
  const balance = await getUsdtBalance();
  
  if (balance === 0) {
    console.log("\n🔧 Alternative methods to try:");
    generateCurlCommand();
    
    console.log("\n📋 Proxy Setup Instructions:");
    console.log("1. Get a residential proxy from providers like:");
    console.log("   - BrightData (luminati.io)");
    console.log("   - Smartproxy.com");
    console.log("   - ProxyMesh.com");
    console.log("\n2. Install https-proxy-agent:");
    console.log("   npm install https-proxy-agent");
    console.log("\n3. Update PROXY_CONFIG in the code with your proxy details");
    
    console.log("\n🌐 Cloud Provider Alternatives:");
    console.log("   - Try AWS EC2 (different IP ranges)");
    console.log("   - Try Google Cloud Platform");
    console.log("   - Try Microsoft Azure");
    console.log("   - Try Vultr or Linode");
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { getUsdtBalance };