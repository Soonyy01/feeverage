// ETH on Robinhood Chain -> USDC (perps margin) on Hyperliquid, via Relay.
// The deposit is credited straight to the token's Hyperliquid account, so that
// account never needs gas or an Arbitrum hop.

const ROBINHOOD_CHAIN_ID = 4663;
const NATIVE = "0x0000000000000000000000000000000000000000";

export async function relayRouteSupported(cfg) {
  const res = await fetch(`${cfg.relayApi}/chains`);
  if (!res.ok) throw new Error(`Relay /chains ${res.status}`);
  const { chains } = await res.json();
  const ids = new Set(chains.filter((c) => !c.disabled).map((c) => Number(c.id)));
  return { origin: ids.has(ROBINHOOD_CHAIN_ID), destination: ids.has(cfg.hlRelayChainId) };
}

export async function quoteDeposit(cfg, { user, recipient, amountWei }) {
  const body = {
    user,
    recipient,
    originChainId: ROBINHOOD_CHAIN_ID,
    destinationChainId: cfg.hlRelayChainId,
    originCurrency: NATIVE,
    destinationCurrency: cfg.hlRelayUsdc,
    amount: amountWei.toString(),
    tradeType: "EXACT_INPUT",
  };
  const res = await fetch(`${cfg.relayApi}/quote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Relay quote failed: ${json.message ?? res.status}`);
  return json;
}

/**
 * Executes every transaction step of a Relay quote from the operator wallet and
 * waits for Relay to report the fill. Returns the request id.
 */
export async function executeDeposit(cfg, { quote, walletClient, publicClient, log }) {
  let requestId = null;
  for (const step of quote.steps ?? []) {
    if (step.kind !== "transaction") {
      throw new Error(`Unsupported Relay step kind "${step.kind}" (${step.id})`);
    }
    requestId = step.requestId ?? requestId;
    for (const item of step.items ?? []) {
      if (item.status === "complete") continue;
      const d = item.data;
      if (Number(d.chainId) !== ROBINHOOD_CHAIN_ID) throw new Error(`Relay step on chain ${d.chainId}`);
      const hash = await walletClient.sendTransaction({
        to: d.to,
        data: d.data,
        value: BigInt(d.value ?? 0),
      });
      log(`  relay tx ${hash}`);
      const rc = await publicClient.waitForTransactionReceipt({ hash });
      if (rc.status !== "success") throw new Error(`Relay tx reverted ${hash}`);
      if (item.check?.endpoint) await waitForFill(cfg, item.check.endpoint, log);
    }
  }
  return requestId;
}

async function waitForFill(cfg, endpoint, log, timeoutMs = 10 * 60_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const res = await fetch(`${cfg.relayApi}${endpoint}`);
    if (res.ok) {
      const { status } = await res.json();
      if (status === "success") return;
      if (status === "failure" || status === "refund") throw new Error(`Relay fill ${status}`);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  log("  relay fill still pending after 10 min; will show up on Hyperliquid when done");
}
