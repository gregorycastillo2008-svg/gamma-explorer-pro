import {
  generateIVSurface, generateIVSkew, generateHistoricalHVData,
  calculateSkewMetrics, type IvPoint, type SkewPoint, type HVRow, type SkewMetrics,
} from "./volatilityCalculations";
import type { OptionContract } from "./gex";

export interface VolatilityDataset {
  symbol: string;
  spot: number;
  atmIV: number;          // %
  hv15: number; hv20: number; hv30: number;
  volPremium: number;     // pp (atmIV - hv30)
  diRisk: number;         // 0..100 IV-rank style
  vix: { v9d: number; vix: number; m3: number; structure: "Contango" | "Backwardation" };
  surface: IvPoint[];
  skew: SkewPoint[];
  putSkew:  { strike: number; iv: number }[];  // per-strike put IV (real data)
  callSkew: { strike: number; iv: number }[];  // per-strike call IV (real data)
  skewLabel: string;                           // "STRONG PUT SKEW" | "MILD PUT SKEW" | "FLAT" | etc.
  metrics: SkewMetrics;
  putIvBars: { dte: string; putIv: number; callIv: number; rr: number }[];
  hvSeries: HVRow[];
  table: { strike: number; iv: number; oiSk: number; flag: string }[];
}

// ERF approx (Abramowitz & Stegun) — used for delta proxy
function erfApprox(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * t * Math.exp(-ax * ax);
  return sign * y;
}

function approxDelta(spot: number, strike: number, dte: number, iv: number): number {
  const T = Math.max(1, dte) / 365;
  const sT = iv * Math.sqrt(T);
  if (sT < 1e-6) return 0.5;
  const d1 = (Math.log(spot / strike) + 0.5 * iv * iv * T) / sT;
  return 0.5 * (1 + erfApprox(d1 / Math.SQRT2));
}

function skewLabelFromRR(rr: number): string {
  if (rr > 5)  return "STRONG PUT SKEW";
  if (rr > 1.5) return "MILD PUT SKEW";
  if (rr < -5)  return "STRONG CALL SKEW";
  if (rr < -1.5) return "MILD CALL SKEW";
  return "FLAT SKEW";
}

export function buildVolatilityDataset(
  symbol: string,
  spot: number,
  baseIV = 0.16,
  seed = 7,
  realContracts?: OptionContract[],
): VolatilityDataset {
  // ── Surface ─────────────────────────────────────────────────────────────────
  let surface: IvPoint[];
  if (realContracts && realContracts.length > 0) {
    const map = new Map<string, { sum: number; n: number; strike: number; expiry: number }>();
    for (const c of realContracts) {
      if (c.iv <= 0) continue;
      const key = `${c.strike}|${c.expiry}`;
      const cur = map.get(key) ?? { sum: 0, n: 0, strike: c.strike, expiry: c.expiry };
      cur.sum += c.iv; cur.n++;
      map.set(key, cur);
    }
    surface = Array.from(map.values()).map((v) => ({
      strike: v.strike,
      expiry: v.expiry,
      moneyness: +(v.strike / spot).toFixed(4),
      iv: +(v.sum / v.n).toFixed(4),
    }));
  } else {
    surface = generateIVSurface(spot, [1, 2, 3, 4, 5, 6, 7], baseIV);
  }

  // ── IV Skew from real contracts ──────────────────────────────────────────────
  let skew: SkewPoint[];
  let putSkew:  { strike: number; iv: number }[] = [];
  let callSkew: { strike: number; iv: number }[] = [];

  if (realContracts && realContracts.length > 0) {
    // Pick expiry closest to 30 DTE (allow ±12 days)
    const uniqExp = Array.from(new Set(realContracts.map(c => c.expiry))).sort((a, b) => a - b);
    const tgt = uniqExp.reduce((b, e) => Math.abs(e - 30) < Math.abs(b - 30) ? e : b, uniqExp[0]);
    const allowed = uniqExp.filter(e => Math.abs(e - tgt) <= 12);
    const slice = realContracts.filter(c => allowed.includes(c.expiry) && c.iv > 0 && c.iv < 5);

    const putMap  = new Map<number, { sum: number; n: number }>();
    const callMap = new Map<number, { sum: number; n: number }>();
    for (const c of slice) {
      const m = c.type === "put" ? putMap : callMap;
      const acc = m.get(c.strike) ?? { sum: 0, n: 0 };
      acc.sum += c.iv; acc.n++; m.set(c.strike, acc);
    }

    const allK = Array.from(new Set([...putMap.keys(), ...callMap.keys()]))
      .sort((a, b) => a - b)
      .filter(k => k >= spot * 0.88 && k <= spot * 1.12);

    putSkew  = allK.filter(k => putMap.has(k))
      .map(k => ({ strike: k, iv: putMap.get(k)!.sum / putMap.get(k)!.n }));
    callSkew = allK.filter(k => callMap.has(k))
      .map(k => ({ strike: k, iv: callMap.get(k)!.sum / callMap.get(k)!.n }));

    // Merged skew for backward-compat (SkewPoint[])
    const mergeMap = new Map<number, { sum: number; n: number }>();
    for (const [k, v] of putMap)  { const a = mergeMap.get(k) ?? {sum:0,n:0}; a.sum+=v.sum; a.n+=v.n; mergeMap.set(k,a); }
    for (const [k, v] of callMap) { const a = mergeMap.get(k) ?? {sum:0,n:0}; a.sum+=v.sum; a.n+=v.n; mergeMap.set(k,a); }

    skew = allK.filter(k => mergeMap.has(k)).map(k => {
      const iv = mergeMap.get(k)!.sum / mergeMap.get(k)!.n;
      const delta = approxDelta(spot, k, tgt, iv);
      return { strike: k, iv: +iv.toFixed(4), delta: +delta.toFixed(3) };
    });
  } else {
    skew = generateIVSkew(spot, 30, baseIV);
    // Derive put/call from mock with small divergence (realistic)
    putSkew  = skew.map(p => ({ strike: p.strike, iv: p.strike < spot ? p.iv * 1.025 : p.iv }));
    callSkew = skew.map(p => ({ strike: p.strike, iv: p.strike > spot ? p.iv * 0.975 : p.iv }));
  }

  // ── Metrics ─────────────────────────────────────────────────────────────────
  let metrics: SkewMetrics;
  if (realContracts && realContracts.length > 0) {
    const puts  = realContracts.filter((c) => c.type === "put"  && c.iv > 0);
    const calls = realContracts.filter((c) => c.type === "call" && c.iv > 0);

    const atmSlice = realContracts.filter(c => c.iv > 0 && Math.abs(c.strike / spot - 1) <= 0.01);
    const realAtmIV = atmSlice.length
      ? (atmSlice.reduce((s, c) => s + c.iv, 0) / atmSlice.length) * 100
      : baseIV * 100;

    const closest = <T extends { strike: number }>(arr: T[], target: number): T | undefined =>
      arr.length ? arr.reduce((b, c) => Math.abs(c.strike - target) < Math.abs(b.strike - target) ? c : b) : undefined;

    const put5   = closest(puts,  spot * 0.95);
    const call5  = closest(calls, spot * 1.05);
    const putIv5  = put5  ? put5.iv  * 100 : realAtmIV * 1.08;
    const callIv5 = call5 ? call5.iv * 100 : realAtmIV;
    const pcRatio = +(putIv5 / Math.max(0.001, callIv5)).toFixed(3);

    const put25  = closest(puts,  spot * 0.975);
    const call25 = closest(calls, spot * 1.025);
    const rr = (put25 && call25)
      ? +(put25.iv * 100 - call25.iv * 100).toFixed(2)
      : 0;
    const skewAngle = +(Math.atan(rr / 10) * 180 / Math.PI).toFixed(1);
    metrics = { atmIV: +realAtmIV.toFixed(2), riskReversal: rr, skewAngle, pcRatio };
  } else {
    metrics = calculateSkewMetrics(skew, spot);
  }

  const skewLabel = skewLabelFromRR(metrics.riskReversal);

  // ── Table from real skew ─────────────────────────────────────────────────────
  const table = skew
    .filter((_, i) => i % 2 === 0)
    .map((p) => ({
      strike: p.strike,
      iv: +(p.iv * 100).toFixed(2),
      oiSk: +((p.iv - baseIV) * 100).toFixed(2),
      flag: p.iv > baseIV * 1.15 ? "PUT" : p.iv < baseIV * 1.02 ? "CALL" : "MILD",
    }));

  const hvSeries = generateHistoricalHVData(180, spot, baseIV, seed);
  const last = hvSeries[hvSeries.length - 1];
  const atmIV = metrics.atmIV;
  const volPremium = +(atmIV - last.hv30).toFixed(2);
  const diRisk = Math.max(0, Math.min(100, +((atmIV - 8) * 4.7).toFixed(1)));

  // IV Term Structure — real ATM IV at short / medium / long expiry from real contracts
  // Labels repurposed: v9d=short (≤10d), vix=medium (25-35d), m3=long (85-95d)
  let vix: { v9d: number; vix: number; m3: number; structure: "Contango" | "Backwardation" };
  if (realContracts && realContracts.length > 0) {
    const atmBand = (c: OptionContract) => Math.abs(c.strike / spot - 1) <= 0.025 && c.iv > 0;
    const ivAtBucket = (minDte: number, maxDte: number) => {
      const slice = realContracts.filter((c) => atmBand(c) && c.expiry >= minDte && c.expiry <= maxDte);
      return slice.length ? (slice.reduce((s, c) => s + c.iv, 0) / slice.length) * 100 : 0;
    };
    const short = ivAtBucket(1, 12) || ivAtBucket(1, 20);
    const med   = ivAtBucket(22, 38) || ivAtBucket(15, 45);
    const lng   = ivAtBucket(80, 100) || ivAtBucket(60, 120);
    const s = short || atmIV;
    const m = med   || atmIV * 1.02;
    const l = lng   || atmIV * 1.05;
    vix = {
      v9d: +s.toFixed(2),
      vix:  +m.toFixed(2),
      m3:   +l.toFixed(2),
      structure: s > m ? "Backwardation" : "Contango",
    };
  } else {
    vix = {
      v9d: +(atmIV * 1.05).toFixed(2),
      vix: +(atmIV * 1.18).toFixed(2),
      m3:  +(atmIV * 1.34).toFixed(2),
      structure: "Contango" as const,
    };
  }

  // Put/Call IV per DTE bucket — real when contracts available, mock fallback
  let putIvBars: { dte: string; putIv: number; callIv: number; rr: number }[];
  if (realContracts && realContracts.length > 0) {
    // Target expiry buckets; match closest available expiries from real chain
    const uniqExp = Array.from(new Set(realContracts.map((c) => c.expiry))).sort((a, b) => a - b);
    const targets = [7, 14, 30, 60, 90];
    const avgIv = (arr: OptionContract[]) =>
      arr.length ? arr.reduce((s, c) => s + c.iv, 0) / arr.length : 0;

    putIvBars = targets.map((tgt) => {
      const nearest = uniqExp.reduce((b, e) => Math.abs(e - tgt) < Math.abs(b - tgt) ? e : b, uniqExp[0]);
      if (Math.abs(nearest - tgt) > tgt * 0.6) return null; // no nearby expiry
      const slice = realContracts.filter((c) => c.expiry === nearest && c.iv > 0);
      // 5% OTM puts and calls (±3-8% from spot)
      const puts5  = slice.filter((c) => c.type === "put"  && (spot - c.strike) / spot >= 0.03 && (spot - c.strike) / spot <= 0.09);
      const calls5 = slice.filter((c) => c.type === "call" && (c.strike - spot) / spot >= 0.03 && (c.strike - spot) / spot <= 0.09);
      const putIv  = +(avgIv(puts5)  * 100).toFixed(2);
      const callIv = +(avgIv(calls5) * 100).toFixed(2);
      if (putIv === 0 && callIv === 0) return null;
      return { dte: `${nearest}d`, putIv, callIv, rr: +(putIv - callIv).toFixed(2) };
    }).filter((b): b is NonNullable<typeof b> => b !== null);

    if (putIvBars.length === 0) {
      // Fallback: use ATM IV per expiry bucket
      putIvBars = uniqExp.slice(0, 6).map((exp) => {
        const atm = realContracts.filter((c) => c.expiry === exp && Math.abs(c.strike - spot) <= spot * 0.04 && c.iv > 0);
        const puts  = atm.filter((c) => c.type === "put");
        const calls = atm.filter((c) => c.type === "call");
        const putIv  = +(avgIv(puts)  * 100).toFixed(2);
        const callIv = +(avgIv(calls) * 100).toFixed(2);
        return { dte: `${exp}d`, putIv, callIv, rr: +(putIv - callIv).toFixed(2) };
      }).filter((b) => b.putIv > 0 || b.callIv > 0);
    }
  } else {
    putIvBars = [1, 3, 5, 7, 9].map((d) => {
      const sk = generateIVSkew(spot, d, baseIV);
      const p5 = sk.reduce((b, p) => Math.abs(p.strike - spot * 0.95) < Math.abs(b.strike - spot * 0.95) ? p : b, sk[0]);
      const c5 = sk.reduce((b, p) => Math.abs(p.strike - spot * 1.05) < Math.abs(b.strike - spot * 1.05) ? p : b, sk[0]);
      return { dte: `${d}d`, putIv: +(p5.iv * 100).toFixed(2), callIv: +(c5.iv * 100).toFixed(2), rr: +(p5.iv * 100 - c5.iv * 100).toFixed(2) };
    });
  }

  return {
    symbol, spot,
    atmIV, hv15: last.hv10 * 1.05, hv20: last.hv20, hv30: last.hv30,
    volPremium, diRisk, vix,
    surface, skew, putSkew, callSkew, skewLabel, metrics, putIvBars, hvSeries, table,
  };
}
