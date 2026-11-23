// Bandit-150: a slow trend-following bot for cbBTC/USDC on agent-fun/bars-replay/v1.
//
// Idea, from the dev window (24h of 1-minute cbBTC bars, $58,957 -> $61,102):
// 1-minute noise is ~8 bps per bar while a full round trip costs ~26 bps, so
// every fast signal (EMA crosses, RSI, momentum on short windows) bleeds fees
// and loses on the dev window. What works is catching the slow trend and
// staying out of flat chop: buy early, then stay long while the close holds
// above a slow moving average and exit when it breaks clearly below it.
//
// Rules (all in exact bigint arithmetic on the raw close ints, so two runs
// produce byte-identical orders; no randomness, no wall clock):
// - Buy with all cash on the first tradable batch.
// - Keep the simple moving average of the last 150 closes (SMA-150).
// - While long, sell everything when the close falls below SMA-150 x 0.998
//   (a 20 bp band under the average), or 1% below the close the position was
//   entered on (an early-crash guard for the first 150 bars, before the
//   average exists).
// - While flat, buy with all cash when the close rises above SMA-150 x 1.002.
// - Every order caps slippage at 100 bps from the latest close, so a fill
//   more than 1% past the close is refused rather than chased.

import { runBars, type BarsState, type Batch, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const WINDOW = 150;
const BAND_BPS = 20n; // 0.2% band around the SMA, in basis points
const STOP_BPS = 100n; // 1% below the entry close
const MAX_SLIPPAGE_BPS = 100;
const BPS = 10000n;

const closes: bigint[] = [];
let entryClose: bigint | null = null;
let boughtOnce = false;

function smaSum(): bigint {
  let s = 0n;
  for (let i = closes.length - WINDOW; i < closes.length; i++) s += closes[i];
  return s;
}

await runBars({
  onBatch(state: BarsState, batch: Batch): (BuyInput | SellInput)[] {
    for (const bar of batch.bars) {
      if (bar.symbol === SYMBOL) closes.push(BigInt(bar.c));
    }
    if (state.warmingUp) return [];

    const held = state.positions.get(SYMBOL);
    const holding = held !== undefined && held.qty > 0n;

    if (holding) {
      // Exit: close clearly below the slow average, or 1% under entry.
      if (closes.length >= WINDOW) {
        const sum = smaSum();
        // close < sma * (1 - BAND_BPS/10000)  <=>  close*WINDOW*BPS < sum*(BPS-BAND_BPS)
        if (closes[closes.length - 1] * BigInt(WINDOW) * BPS < sum * (BPS - BAND_BPS)) {
          entryClose = null;
          return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
        }
      }
      if (entryClose !== null && closes[closes.length - 1] * BPS < entryClose * (BPS - STOP_BPS)) {
        entryClose = null;
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    // Flat: first tradable batch buys with all cash; later, only on a
    // close clearly above the slow average.
    if (!boughtOnce) {
      if (closes.length === 0) return [];
      boughtOnce = true;
      entryClose = closes[closes.length - 1];
      return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    if (closes.length >= WINDOW) {
      const sum = smaSum();
      // close > sma * (1 + BAND_BPS/10000)
      if (closes[closes.length - 1] * BigInt(WINDOW) * BPS > sum * (BPS + BAND_BPS)) {
        entryClose = closes[closes.length - 1];
        return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
    }
    return [];
  },
});
