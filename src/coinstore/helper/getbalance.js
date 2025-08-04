const axios = require("axios");
const crypto = require("crypto");

const apiKey = "6a5f74af1896d386871045899d82ea1a"; // Replace with your API Key
const secretKey = "54eefc696aeb13bb807a44e32b349b2a"; // Replace with your Secret Key

// Add delay function to avoid rate limiting
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getUsdtBalance() {
  const url = "https://api.coinstore.com/api/spot/accountList";
  
  const expires = Date.now(); // Current time in milliseconds
  const expiresKey = Math.floor(expires / 30000).toString();
  
  try {
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
    
    // Enhanced headers to mimic a real browser and avoid blocking
    const headers = {
      "X-CS-APIKEY": apiKey,
      "X-CS-SIGN": signature,
      "X-CS-EXPIRES": expires.toString(),
      "exch-language": "en_US",
      "Content-Type": "application/json",
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Origin": "https://coinstore.com",
      "Referer": "https://coinstore.com/",
      "Connection": "keep-alive",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-site",
      "sec-ch-ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"'
    };
    
    // Add a small delay before making the request
    await delay(1000);
    
    console.log("🔄 Fetching balance from Coinstore...");
    
    const response = await axios.post(url, payload, { 
      headers,
      timeout: 30000, // 30 second timeout
      validateStatus: function (status) {
        return status < 500; // Resolve only if status is less than 500
      }
    });
    
    console.log(`📊 Response status: ${response.status}`);
    
    // Handle different response scenarios
    if (response.status === 403 || response.status === 503) {
      console.log("🚫 Access blocked by Cloudflare. Possible solutions:");
      console.log("   1. Try using a VPN with residential IP");
      console.log("   2. Contact Coinstore support to whitelist your IP");
      console.log("   3. Use a different server/hosting provider");
      return 0;
    }
    
    const data = response.data;
    
    if (data && data.code === "0") {
      const balances = data.data || [];
      console.log(`📋 Found ${balances.length} currency balances`);
      
      // Calculate USDT balance
      const usdtEntries = balances.filter((entry) => entry.currency === "USDT");
      const usdtBalance = usdtEntries.reduce((total, entry) => {
        const balance = parseFloat(entry.balance || 0);
        const frozen = parseFloat(entry.frozen || 0);
        return total + balance + frozen; // Include both available and frozen
      }, 0);
      
      console.log(`✅ USDT Balance: ${usdtBalance.toFixed(6)} USDT`);
      
      // Show breakdown if there are multiple USDT entries
      if (usdtEntries.length > 1) {
        console.log("📊 USDT Balance Breakdown:");
        usdtEntries.forEach((entry, index) => {
          console.log(`   ${index + 1}. Available: ${entry.balance || 0}, Frozen: ${entry.frozen || 0}`);
        });
      }
      
      return usdtBalance;
    } else {
      console.log(`❌ API Error: ${data?.message || "Unknown error"}`);
      console.log(`📝 Response code: ${data?.code || "N/A"}`);
      return 0;
    }
    
  } catch (error) {
    console.error("❌ Error fetching Coinstore balance:");
    
    if (error.response) {
      // Server responded with error status
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Status Text: ${error.response.statusText}`);
      
      if (error.response.status === 403 || error.response.status === 503) {
        console.log("🔧 This appears to be a Cloudflare block. Try:");
        console.log("   1. Using a different IP address");
        console.log("   2. Adding delays between requests");
        console.log("   3. Contacting Coinstore support");
      }
      
      // Log response data if available (might contain HTML from Cloudflare)
      if (error.response.data && typeof error.response.data === 'string') {
        if (error.response.data.includes('cloudflare')) {
          console.log("🌐 Confirmed: Blocked by Cloudflare");
        }
      }
    } else if (error.request) {
      // Request was made but no response received
      console.error("   No response received from server");
      console.error("   Check your internet connection and API endpoint");
    } else {
      // Something else happened
      console.error(`   Error: ${error.message}`);
    }
    
    return 0;
  }
}

// Enhanced function to get all balances (not just USDT)
async function getAllBalances() {
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
    
    const headers = {
      "X-CS-APIKEY": apiKey,
      "X-CS-SIGN": signature,
      "X-CS-EXPIRES": expires.toString(),
      "exch-language": "en_US",
      "Content-Type": "application/json",
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Origin": "https://coinstore.com",
      "Referer": "https://coinstore.com/"
    };
    
    await delay(1000);
    
    const response = await axios.post(url, payload, { headers, timeout: 30000 });
    const data = response.data;
    
    if (data && data.code === "0") {
      const balances = data.data || [];
      console.log("\n💰 All Account Balances:");
      console.log("=" .repeat(50));
      
      balances.forEach((entry) => {
        const balance = parseFloat(entry.balance || 0);
        const frozen = parseFloat(entry.frozen || 0);
        const total = balance + frozen;
        
        if (total > 0) {
          console.log(`${entry.currency.padEnd(8)} | Available: ${balance.toFixed(8)} | Frozen: ${frozen.toFixed(8)} | Total: ${total.toFixed(8)}`);
        }
      });
      
      return balances;
    }
    
  } catch (error) {
    console.error("❌ Error fetching all balances:", error.message);
    return [];
  }
}

// Main execution
async function main() {
  console.log("🚀 Starting Coinstore Balance Check...");
  console.log("=" .repeat(50));
  
  // Get USDT balance
  const usdtBalance = await getUsdtBalance();
  
  // Optional: Get all balances
  console.log("\n📊 Fetching all balances...");
  await getAllBalances();
  
  console.log("\n✨ Balance check completed!");
}

// Export functions if used as module
module.exports = {
  getUsdtBalance,
  getAllBalances
};

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}