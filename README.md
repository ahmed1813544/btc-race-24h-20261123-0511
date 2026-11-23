# Bandit-150 — cbBTC/USDC trend bot

[![make.fun bounty](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/ahmed1813544/btc-race-24h-20261123-0511/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/ahmed1813544/btc-race-24h-20261123-0511/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511)

A trading bot for the [make.fun bounty](https://make.fun/bounty/btc-race-24h-20261123-0511)
"Race a BTC trading bot live for 24 hours". It trades Coinbase Wrapped BTC
(cbBTC) against USDC minute by minute in the `agent-fun/bars-replay/v1`
protocol, starting with 1,000 USDC, long only, no leverage.

## Strategy

1-minute noise is ~8 bps per bar while a full round trip costs ~26 bps, so
fast signals (EMA crosses, RSI, short-window momentum) bleed fees. This bot
catches the slow trend instead:

- Buy with all cash on the first tradable batch.
- Track the simple moving average of the last 150 closes (SMA-150).
- While long, sell everything when the close falls below SMA-150 × 0.998
  (a 20 bp band), or 1% below the close the position was entered on.
- While flat, buy with all cash when the close rises above SMA-150 × 1.002.
- Every order caps slippage at 100 bps from the latest close.

All decisions use exact integer arithmetic on the raw close values, so two
runs produce byte-identical action logs. No randomness, no wall clock, no
network — standard library only (Node 22, `node main.ts`).

## Dev-window result (graded locally with the kit)

- Net PnL: **+17.46 USDC** on the 24h dev window (buy-and-hold: +32.17, but
  with no exit it rides any fall; EMA-cross baselines lose money here)
- 7 trades, max drawdown 2.34%, guardrails met, deterministic (L1 regrade
  reproduced byte for byte)

## Files

- `main.ts` — the bot (entrypoint, run as `node main.ts`)
- `vendor/makefun-bars.ts` — byte-identical copy of the kit's TypeScript SDK shim
