import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPrice, formatSize, topUpOrder } from "../src/hl-math.js";

test("formatPrice keeps 5 sig figs and decimal cap", () => {
  assert.equal(formatPrice(95123.456, 5), "95123");
  assert.equal(formatPrice(3456.789, 4), "3456.8");
  assert.equal(formatPrice(0.123456, 0), "0.12346");
  assert.equal(formatPrice(1.23456789, 2), "1.2346");
  assert.equal(formatPrice(0.00012345, 0), "0.000123"); // capped at 6 decimals
});

test("formatSize rounds down", () => {
  assert.equal(formatSize(0.123456, 5), "0.12345");
  assert.equal(formatSize(1.999, 0), "1");
  assert.equal(formatSize(2.5, 2), "2.5");
});

test("topUpOrder long and short", () => {
  const base = { freeMarginUsd: 100, leverage: 5, markPx: 100000, szDecimals: 5, marginUse: 0.95, slippage: 0.01, minOrderUsd: 10 };
  const long = topUpOrder({ ...base, isLong: true });
  assert.equal(long.isBuy, true);
  assert.equal(long.size, "0.00475");
  assert.equal(long.price, "101000");
  const short = topUpOrder({ ...base, isLong: false });
  assert.equal(short.isBuy, false);
  assert.equal(short.price, "99000");
});

test("topUpOrder skips dust", () => {
  assert.equal(
    topUpOrder({ freeMarginUsd: 1, leverage: 2, markPx: 50, isLong: true, szDecimals: 1, marginUse: 0.95, slippage: 0.01, minOrderUsd: 10 }),
    null,
  );
});
