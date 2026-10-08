// Pure helpers for Hyperliquid order formatting (unit-tested, no network).

/**
 * Perp prices: at most 5 significant figures and at most (6 - szDecimals)
 * decimals. Integer prices are always valid.
 */
export function formatPrice(px, szDecimals) {
  if (!(px > 0)) throw new Error(`bad price ${px}`);
  const maxDecimals = Math.max(0, 6 - szDecimals);
  let p = Number(px.toPrecision(5));
  p = Number(p.toFixed(maxDecimals));
  return trimZeros(p.toFixed(maxDecimals));
}

/** Sizes are rounded DOWN to szDecimals so we never exceed available margin. */
export function formatSize(sz, szDecimals) {
  const f = 10 ** szDecimals;
  const s = Math.floor(sz * f + 1e-9) / f;
  return trimZeros(s.toFixed(szDecimals));
}

/**
 * Size of a top-up order: free margin × leverage, priced at mark.
 * Returns null when the notional is below the exchange minimum.
 */
export function topUpOrder({ freeMarginUsd, leverage, markPx, isLong, szDecimals, marginUse, slippage, minOrderUsd }) {
  const notional = freeMarginUsd * marginUse * leverage;
  if (notional < minOrderUsd) return null;
  const size = formatSize(notional / markPx, szDecimals);
  if (Number(size) * markPx < minOrderUsd) return null;
  const limit = isLong ? markPx * (1 + slippage) : markPx * (1 - slippage);
  return { isBuy: isLong, size, price: formatPrice(limit, szDecimals), notional: Number(size) * markPx };
}

function trimZeros(s) {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}
