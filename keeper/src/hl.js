import { ExchangeClient, HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import { mnemonicToAccount } from "viem/accounts";
import { topUpOrder } from "./hl-math.js";

const transport = new HttpTransport();
export const info = new InfoClient({ transport });

/** One Hyperliquid account per launch, derived from HL_MNEMONIC at the launch index. */
export function hlAccountFor(mnemonic, index) {
  return mnemonicToAccount(mnemonic, { addressIndex: index });
}

export async function loadMarkets() {
  const [meta, ctxs] = await info.metaAndAssetCtxs();
  const byName = new Map();
  meta.universe.forEach((u, i) => {
    byName.set(u.name, {
      asset: i,
      name: u.name,
      szDecimals: u.szDecimals,
      maxLeverage: u.maxLeverage,
      delisted: Boolean(u.isDelisted),
      markPx: Number(ctxs[i].markPx),
    });
  });
  return byName;
}

export async function ethUsd() {
  const mids = await info.allMids();
  return Number(mids.ETH);
}

export async function accountSummary(user) {
  const s = await info.clearinghouseState({ user });
  return {
    accountValue: Number(s.marginSummary.accountValue),
    withdrawable: Number(s.withdrawable),
    positions: s.assetPositions.map((p) => p.position),
  };
}

/**
 * Puts the account's free margin to work: sets leverage once, then sends an
 * IOC order sized at freeMargin × leverage in the token's chosen direction.
 */
export async function topUpPosition({ account, launch, market, cfg, ts, log }) {
  const leverage = Math.min(launch.leverage, market.maxLeverage);
  const summary = await accountSummary(account.address);
  const order = topUpOrder({
    freeMarginUsd: summary.withdrawable,
    leverage,
    markPx: market.markPx,
    isLong: launch.isLong,
    szDecimals: market.szDecimals,
    marginUse: cfg.marginUse,
    slippage: cfg.slippage,
    minOrderUsd: cfg.minOrderUsd,
  });
  if (!order) return null;

  log(
    `  ${launch.symbol ?? launch.token}: ${order.isBuy ? "LONG" : "SHORT"} ${order.size} ${market.name} ` +
      `@≤${order.price} (${leverage}x, ~$${order.notional.toFixed(2)}, free margin $${summary.withdrawable.toFixed(2)})`,
  );
  if (cfg.dryRun) return { ...order, dryRun: true };

  const exchange = new ExchangeClient({ transport, wallet: account });
  if (!ts.leverageSet) {
    await exchange.updateLeverage({ asset: market.asset, isCross: true, leverage });
    ts.leverageSet = true;
  }
  const res = await exchange.order({
    orders: [
      {
        a: market.asset,
        b: order.isBuy,
        p: order.price,
        s: order.size,
        r: false,
        t: { limit: { tif: "Ioc" } },
      },
    ],
    grouping: "na",
  });
  const st = res.response?.data?.statuses?.[0];
  if (st?.error) throw new Error(`Hyperliquid order rejected: ${st.error}`);
  return { ...order, filled: st?.filled ?? null };
}
