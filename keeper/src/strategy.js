// The position a token's fees fund is written into the token's own on-chain
// description at launch, so it is public, permanent and readable by anyone:
//
//   "...\n\nFees → 5x LONG BTC on Hyperliquid · feeverage:BTC:L:5"
//
// The website writes this tag; the keeper and the website both read it back.
export const TAG_RE = /feeverage:([A-Z0-9]{1,12}):([LS]):(\d{1,2})\b/;

export function parseStrategy(description) {
  const m = TAG_RE.exec(description ?? "");
  if (!m) return null;
  const leverage = Number(m[3]);
  if (leverage < 1 || leverage > 50) return null;
  return { market: m[1], isLong: m[2] === "L", leverage };
}

export function strategyLine({ market, isLong, leverage }) {
  return `Fees → ${leverage}x ${isLong ? "LONG" : "SHORT"} ${market} on Hyperliquid · feeverage:${market}:${isLong ? "L" : "S"}:${leverage}`;
}
