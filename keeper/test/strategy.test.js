import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStrategy, strategyLine } from "../src/strategy.js";

test("round trip", () => {
  const s = { market: "BTC", isLong: true, leverage: 5 };
  assert.deepEqual(parseStrategy("hello\n\n" + strategyLine(s)), s);
  const t = { market: "HYPE", isLong: false, leverage: 20 };
  assert.deepEqual(parseStrategy(strategyLine(t)), t);
});

test("rejects missing or bad tags", () => {
  assert.equal(parseStrategy("just a meme"), null);
  assert.equal(parseStrategy("feeverage:BTC:L:0"), null);
  assert.equal(parseStrategy("feeverage:btc:L:5"), null);
  assert.equal(parseStrategy(undefined), null);
});
