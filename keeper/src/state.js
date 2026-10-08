// Tiny JSON ledger. All creator fees land in one escrow balance (the operator's),
// so this file is what says how much of that ETH belongs to which token.
// Back it up together with HL_MNEMONIC.
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";

const FILE = new URL("../state.json", import.meta.url);

export function loadState() {
  const s = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {};
  s.registry ??= []; // tokens launched from the site, in launch order (index = Hyperliquid account index)
  s.tokens ??= {}; // per-token ledger
  return s;
}

export function saveState(state) {
  const tmp = new URL("../state.json.tmp", import.meta.url);
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, FILE);
}

export function tokenState(state, token) {
  const key = token.toLowerCase();
  state.tokens[key] ??= {
    creditedWei: "0", // creator fees credited to the operator for this token (from FeesSwept events)
    bridgedWei: "0", // sent to Hyperliquid
    failedWei: "0", // bridge attempts that need manual review
    bridgedUsd: 0,
    bridges: [],
    leverageSet: false,
    orders: [],
  };
  return state.tokens[key];
}

/** ETH credited to the token that has not been bridged yet. */
export function pendingWei(ts) {
  return BigInt(ts.creditedWei) - BigInt(ts.bridgedWei) - BigInt(ts.failedWei);
}

export const add = (a, b) => (BigInt(a) + BigInt(b)).toString();
