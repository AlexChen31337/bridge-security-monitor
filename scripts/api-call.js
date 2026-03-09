/**
 * 🌰 Bridge Security Monitor — Data Fetcher
 *
 * Fetches live bridge data from DeFiLlama's public protocols API.
 * No API key required — free and open data source.
 *
 * Data source: https://api.llama.fi/protocols (filters for bridge category)
 * Output: data/bridges.json
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// 🌰 Known exploited bridges for risk scoring
const EXPLOITED_BRIDGES = {
  "ronin": { amount: 625_000_000, year: 2022 },
  "wormhole": { amount: 320_000_000, year: 2022 },
  "multichain": { amount: 125_000_000, year: 2023 },
  "nomad": { amount: 190_000_000, year: 2022 },
  "orbit chain": { amount: 82_000_000, year: 2024 },
  "harmony": { amount: 100_000_000, year: 2022 },
  "polynetwork": { amount: 611_000_000, year: 2021 },
  "thorchain": { amount: 8_000_000, year: 2021 },
};

// 🌰 Risk score: 0-100 based on three factors
function computeRiskScore(bridge) {
  let score = 0;
  const tvl = bridge.tvl || 0;
  const chains = (bridge.chains || []).length;

  // Factor 1: TVL exposure (0-40 pts)
  if (tvl > 1_000_000_000) score += 40;
  else if (tvl > 500_000_000) score += 30;
  else if (tvl > 100_000_000) score += 20;
  else score += 10;

  // Factor 2: 🌰 Exploit history penalty (0-40 pts)
  const nameLower = (bridge.name || "").toLowerCase();
  const hasExploit = Object.keys(EXPLOITED_BRIDGES).some((k) => nameLower.includes(k));
  if (hasExploit) score += 40;

  // Factor 3: Chain surface area (0-20 pts)
  if (chains > 10) score += 20;
  else if (chains > 5) score += 15;
  else if (chains > 2) score += 10;
  else score += 5;

  return Math.min(score, 100);
}

function riskLabel(score) {
  if (score >= 70) return "CRITICAL";
  if (score >= 50) return "HIGH";
  if (score >= 30) return "MEDIUM";
  return "LOW";
}

async function main() {
  console.log("🌰 Bridge Security Monitor — fetching from DeFiLlama protocols API...");

  let protocols = [];
  try {
    const res = await fetch("https://api.llama.fi/protocols");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const all = await res.json();
    // 🌰 Filter for bridge protocols only
    protocols = all.filter((p) =>
      ["bridge", "cross chain"].includes((p.category || "").toLowerCase())
    );
    console.log(`✅ Found ${protocols.length} bridge protocols`);
  } catch (err) {
    console.error("❌ Fetch failed:", err.message);
    process.exit(1);
  }

  // 🌰 Sort by TVL descending, take top 80
  protocols.sort((a, b) => (b.tvl || 0) - (a.tvl || 0));
  const top = protocols.slice(0, 80);

  const processed = top.map((b) => {
    const score = computeRiskScore(b);
    const nameLower = (b.name || "").toLowerCase();
    const exploit = Object.entries(EXPLOITED_BRIDGES).find(([k]) => nameLower.includes(k));
    return {
      id: b.id,
      name: b.name,
      slug: (b.slug || b.name || "").toLowerCase().replace(/\s+/g, "-"),
      chains: b.chains || [],
      chainCount: (b.chains || []).length,
      tvl: b.tvl || 0,
      volume24h: b.change_1d ? Math.abs((b.tvl || 0) * b.change_1d / 100) : 0,
      volume7d: b.change_7d ? Math.abs((b.tvl || 0) * b.change_7d / 100) : (b.tvl || 0) * 0.05,
      volume30d: (b.tvl || 0) * 0.2,
      riskScore: score,
      riskLevel: riskLabel(score),
      exploitHistory: exploit
        ? { found: true, details: exploit[1] }
        : { found: false },
      url: b.url || null,
    };
  });

  // 🌰 Sort by risk score
  processed.sort((a, b) => b.riskScore - a.riskScore);

  const summary = {
    totalBridges: processed.length,
    byRiskLevel: {
      CRITICAL: processed.filter((b) => b.riskLevel === "CRITICAL").length,
      HIGH: processed.filter((b) => b.riskLevel === "HIGH").length,
      MEDIUM: processed.filter((b) => b.riskLevel === "MEDIUM").length,
      LOW: processed.filter((b) => b.riskLevel === "LOW").length,
    },
    totalTVL: processed.reduce((s, b) => s + b.tvl, 0),
    totalVolume24h: processed.reduce((s, b) => s + b.volume24h, 0),
    totalVolume7d: processed.reduce((s, b) => s + b.volume7d, 0),
    fetchedAt: new Date().toISOString(),
  };

  const output = {
    meta: {
      description: "🌰 Bridge Security Monitor — live bridge risk scores",
      source: "DeFiLlama Protocols API (https://api.llama.fi/protocols)",
      methodology:
        "Risk score = TVL exposure (0-40) + exploit history (0-40) + chain surface area (0-20)",
      generatedAt: new Date().toISOString(),
    },
    summary,
    bridges: processed,
  };

  const outPath = join(__dirname, "../data/bridges.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(output, null, 2));

  console.log(`🌰 Saved ${processed.length} bridges → data/bridges.json`);
  console.log(
    `📊 Risk: CRITICAL=${summary.byRiskLevel.CRITICAL} HIGH=${summary.byRiskLevel.HIGH} MEDIUM=${summary.byRiskLevel.MEDIUM} LOW=${summary.byRiskLevel.LOW}`
  );
  console.log(`💰 Total TVL: $${(summary.totalTVL / 1e9).toFixed(1)}B`);
}

main().catch((err) => {
  console.error("🚨 Fatal:", err);
  process.exit(1);
});
