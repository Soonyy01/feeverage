// Everything you need to edit lives here.
window.FEEVERAGE_CONFIG = {
  // Privy app id (dashboard.privy.io). Add your site's domain under
  // "Allowed origins" in the Privy dashboard, or login will be refused.
  privyAppId: "cmuyesiuv002x0ckuxoisx73f",

  // Wallet that receives every token's trade tax: the keeper's OPERATOR address
  // (account #0 of the keeper's seed phrase).
  feeRecipient: "0xc2c2324205a288209ac5d9968a6221f3c8f66d2e",

  // Public URL of the keeper's status API, e.g. "https://keeper.example.com".
  // Leave empty to read launches straight from the chain.
  keeperApi: "",

  // Your X (Twitter) profile, shown at the bottom of the menu.
  xUrl: "https://x.com/feeverage",

  // Fees a token must collect before they are bridged and added to its position (USD).
  // Keep this equal to MIN_BRIDGE_USD in the keeper's .env.
  minTopUpUsd: 12,

  // BNB Chain
  chainId: 56,
  native: "BNB",
  rpc: "https://bsc-dataseed.bnbchain.org",
  rpcFallbacks: ["https://bsc-rpc.publicnode.com", "https://bsc-dataseed1.binance.org"],
  explorer: "https://bscscan.com",

  // flap.sh contracts on BNB Chain (docs.flap.sh → Deployed Contract Addresses)
  portal: "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0",
  taxTokenImpl: "0x024f18294970B5c76c0691b87f138A0317156422",
  taxHelper: "0x53841c73217735F37BC1775538b03b23feFD8346",
  // Trade tax choices offered at launch (%), all of it funds the position.
  taxOptions: [1, 3, 5, 10],
  // First block to look for launches (set it to the block of the day you go live).
  startBlock: 0,

  // Hyperliquid
  hlInfo: "https://api.hyperliquid.xyz/info",
  markets: ["BTC", "ETH", "BNB", "HYPE", "SOL", "XRP", "DOGE"],
  maxLeverage: 20,
};
