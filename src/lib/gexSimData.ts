// Synthetic but realistic OHLCV + GEX-by-strike generator with live updates.

export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };

export type GexStrike = {
  strike: number;
  callGEX: number;
  putGEX: number;
  netGEX: number;
  /** Dealer delta exposure aggregated for this strike (optional; available in real chain mode). */
  dex?: number;
  callOI: number;
  putOI: number;
  oiPct: number; // 0..100
};

export type GexSnapshot = {
  timestamp: number;
  spot: number;
  gexByStrike: GexStrike[];
  keyLevels: { zeroGamma: number; majorPositive: number; majorNegative: number };
  aggregates: {
    netGEX: number;
    totalCallGEX: number;
    totalPutGEX: number;
    totalCallOI: number;
    totalPutOI: number;
  };
  maxChange: { window: number; strike: number; delta: number }[];
};

// Deterministic-ish random
function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateCandles(symbol: string, timeframe: string, basePrice: number): Candle[] {
  const seed = Array.from(symbol).reduce((s, c) => s + c.charCodeAt(0), 0) +
    Array.from(timeframe).reduce((s, c) => s + c.charCodeAt(0), 0);
  const rnd = mulberry32(seed);

  // count + step seconds based on timeframe
  const cfg: Record<string, { count: number; step: number; vol: number }> = {
    "1D": { count: 78, step: 5 * 60, vol: 0.0015 },
    "5D": { count: 130, step: 30 * 60, vol: 0.003 },
    "1M": { count: 22, step: 24 * 3600, vol: 0.008 },
    "3M": { count: 65, step: 24 * 3600, vol: 0.012 },
    "6M": { count: 130, step: 24 * 3600, vol: 0.014 },
    "1Y": { count: 252, step: 24 * 3600, vol: 0.016 },
  };
  const { count, step, vol } = cfg[timeframe] ?? cfg["1D"];

  const nowSec = Math.floor(Date.now() / 1000);
  const startTime = nowSec - count * step;

  const candles: Candle[] = [];
  let price = basePrice * (1 - vol * 4);
  for (let i = 0; i < count; i++) {
    const drift = (rnd() - 0.48) * vol * price;
    const open = price;
    const close = open + drift + Math.sin(i / 7) * vol * price * 0.5;
    const high = Math.max(open, close) + rnd() * vol * price * 0.6;
    const low = Math.min(open, close) - rnd() * vol * price * 0.6;
    const volume = Math.round(500_000 + rnd() * 3_000_000);
    candles.push({ time: startTime + i * step, open, high, low, close, volume });
    price = close;
  }
  return candles;
}

export function generateGexSnapshot(symbol: string, spot: number, jitter = 0): GexSnapshot {
  const seed = Array.from(symbol).reduce((s, c) => s + c.charCodeAt(0), 0) + Math.floor(jitter);
  const rnd = mulberry32(seed);

  const step = spot >= 1000 ? 5 : spot >= 200 ? 1 : 0.5;
  const range = 30; // strikes each side
  const gexByStrike: GexStrike[] = [];

  let totalCallGEX = 0, totalPutGEX = 0, totalCallOI = 0, totalPutOI = 0;
  let maxOI = 0;

  for (let i = -range; i <= range; i++) {
    const strike = Math.round((spot + i * step) / step) * step;
    const dist = (strike - spot) / spot;
    // OI peaks near ATM and at round numbers
    const peak = Math.exp(-dist * dist * 80);
    const callOI = Math.round((20_000 + rnd() * 40_000) * peak * (i > 0 ? 1.3 : 0.8));
    const putOI = Math.round((20_000 + rnd() * 40_000) * peak * (i < 0 ? 1.3 : 0.8));
    // Gamma per contract approx
    const gamma = 0.04 * Math.exp(-dist * dist * 60);
    const callGEX = -gamma * callOI * spot * spot * 100; // dealers short calls
    const putGEX = gamma * putOI * spot * spot * 100;    // dealers long puts
    const netGEX = callGEX + putGEX;
    totalCallGEX += callGEX;
    totalPutGEX += putGEX;
    totalCallOI += callOI;
    totalPutOI += putOI;
    if (callOI + putOI > maxOI) maxOI = callOI + putOI;
    gexByStrike.push({ strike, callGEX, putGEX, netGEX, callOI, putOI, oiPct: 0 });
  }
  gexByStrike.forEach((s) => { s.oiPct = ((s.callOI + s.putOI) / Math.max(1, maxOI)) * 100; });

  // Key levels
  let zeroGamma = spot;
  for (let i = 0; i < gexByStrike.length - 1; i++) {
    if (gexByStrike[i].netGEX * gexByStrike[i + 1].netGEX < 0) {
      zeroGamma = (gexByStrike[i].strike + gexByStrike[i + 1].strike) / 2;
      break;
    }
  }
  const sortedByNet = [...gexByStrike].sort((a, b) => b.netGEX - a.netGEX);
  const majorPositive = sortedByNet[0].strike;
  const majorNegative = sortedByNet[sortedByNet.length - 1].strike;

  // Max change windows
  const maxChange = [1, 5, 10, 15, 30].map((w) => {
    const idx = Math.floor(rnd() * gexByStrike.length);
    return { window: w, strike: gexByStrike[idx].strike, delta: (rnd() * 8 + 0.5) * 1e9 * (w / 5) };
  });

  return {
    timestamp: Date.now(),
    spot,
    gexByStrike,
    keyLevels: { zeroGamma, majorPositive, majorNegative },
    aggregates: {
      netGEX: totalCallGEX + totalPutGEX,
      totalCallGEX,
      totalPutGEX,
      totalCallOI,
      totalPutOI,
    },
    maxChange,
  };
}
