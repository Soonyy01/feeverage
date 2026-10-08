// Everything you need to edit lives here.
window.FEEVERAGE_CONFIG = {
  // Privy app id (dashboard.privy.io). Add your site's domain under
  // "Allowed origins" in the Privy dashboard, or login will be refused.
  privyAppId: "cmuyesiuv002x0ckuxoisx73f",

  // Wallet that receives every token's creator fees: the keeper's OPERATOR address.
  // For a quick test you can put your own wallet here.
  feeRecipient: "0xc2c2324205a288209ac5d9968a6221f3c8f66d2e",

  // Public URL of the keeper's status API, e.g. "https://keeper.example.com".
  // Leave empty to read launches straight from the chain (slower).
  keeperApi: "",

  // Your X (Twitter) profile, shown at the bottom of the menu, e.g. "https://x.com/feeverage".
  xUrl: "https://x.com/feeverage",

  // Fees a token must collect before they are bridged and added to its position (USD).
  // Keep this equal to MIN_BRIDGE_USD in the keeper's .env.
  minTopUpUsd: 12,

  // Robinhood Chain
  chainId: 4663,
  rpc: "https://rpc.mainnet.chain.robinhood.com",
  explorer: "https://robinhoodchain.blockscout.com",

  // Launchpad contracts on Robinhood Chain
  router: "0xe33E9E479dF8802cb0866d5d05258bEc4cF62948",
  factory: "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e",
  launchConfigId: 0,
  // First block to scan when there is no keeper API (set it to the day you go live).
  startBlock: 0,

  // Hyperliquid
  hlInfo: "https://api.hyperliquid.xyz/info",
  markets: ["BTC", "ETH", "HYPE", "SOL", "XRP", "DOGE"],
  maxLeverage: 20,
};
