import {
  generateIVSurface, generateIVSkew, generateHistoricalHVData,
  calculateSkewMetrics, type IvPoint, type SkewPoint, type HVRow, type SkewMetrics,
} from "./volatilityCalculations";

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
  metrics: SkewMetrics;
  putIvBars: { dte: string; putIv: number; callIv: number; rr: number }[];
  hvSeries: HVRow[];
  table: { strike: number; iv: number; oiSk: number; flag: string }[];
}

export function buildVolatilityDataset(symbol: string, spot: number, baseIV = 0.16, seed = 7): VolatilityDataset {
  const expiries = [1, 2, 3, 4, 5, 6, 7];
  const surface = generateIVSurface(spot, expiries, baseIV);
  const skew = generateIVSkew(spot, 30, baseIV);
  const metrics = calculateSkewMetrics(skew, spot);
  const hvSeries = generateHistoricalHVData(180, spot, baseIV, seed);

  const last = hvSeries[hvSeries.length - 1];
  const atmIV = metrics.atmIV;
  const volPremium = +(atmIV - last.hv30).toFixed(2);
  const diRisk = Math.max(0, Math.min(100, +((atmIV - 8) * 4.7).toFixed(1)));

  const vix = {
    v9d: +(atmIV * 1.05).toFixed(2),
    vix: +(atmIV * 1.18).toFixed(2),
    m3: +(atmIV * 1.34).toFixed(2),
    structure: "Contango" as const,
  };

  // Put/Call IV per "DTE bucket" (1d..9d) for the bars chart
  const putIvBars = [1, 3, 5, 7, 9].map((d) => {
    const sk = generateIVSkew(spot, d, baseIV);
    const put5 = sk.reduce((b, p) => Math.abs(p.strike - spot * 0.95) < Math.abs(b.strike - spot * 0.95) ? p : b, sk[0]);
    const call5 = sk.reduce((b, p) => Math.abs(p.strike - spot * 1.05) < Math.abs(b.strike - spot * 1.05) ? p : b, sk[0]);
    return {
      dte: `${d}d`,
      putIv: +(put5.iv * 100).toFixed(2),
      callIv: +(call5.iv * 100).toFixed(2),
      rr: +(put5.iv * 100 - call5.iv * 100).toFixed(2),
    };
  });

  // Side table: strike → IV / OI skew flag
  const table = skew
    .filter((_, i) => i % 2 === 0)
    .map((p) => ({
      strike: p.strike,
      iv: +(p.iv * 100).toFixed(2),
      oiSk: +((p.iv - baseIV) * 100).toFixed(2),
      flag: p.iv > baseIV * 1.15 ? "PUT" : p.iv < baseIV * 1.02 ? "CALL" : "MILD",
    }));

  return {
    symbol, spot,
    atmIV, hv15: last.hv10 * 1.05, hv20: last.hv20, hv30: last.hv30,
    volPremium, diRisk, vix,
    surface, skew, metrics, putIvBars, hvSeries, table,
  };
}
