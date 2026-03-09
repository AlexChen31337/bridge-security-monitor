/**
 * 🌰 BridgeWatch — fetch-bridge-data.js
 * Pulls live bridge TVL from DeFiLlama /v2/protocols (free, no API key needed)
 * and cross-references exploit history from curated records.
 * 🌰🌰🌰
 */

import { writeFile, mkdir } from "fs/promises"

// DeFiLlama protocols endpoint — free tier, no key needed
const DEFILLAMA_PROTOCOLS_URL = "https://api.llama.fi/v2/protocols"

// Curated exploit history (source: public post-mortems and DefiHackLabs)
const KNOWN_EXPLOITS = [
  { name: "Ronin Bridge",         date: "2022-03-23", lossUSD: 625_000_000, chain: "Ethereum/Ronin" },
  { name: "BNB Bridge",           date: "2022-10-07", lossUSD: 586_000_000, chain: "BNB Chain" },
  { name: "Wormhole",             date: "2022-02-02", lossUSD: 326_000_000, chain: "Ethereum/Solana" },
  { name: "Nomad Bridge",         date: "2022-08-01", lossUSD: 190_000_000, chain: "Multi-chain" },
  { name: "Multichain (AnySwap)", date: "2023-07-07", lossUSD: 126_000_000, chain: "Multi-chain" },
  { name: "Harmony Horizon",      date: "2022-06-24", lossUSD: 100_000_000, chain: "Harmony/Ethereum" },
  { name: "Orbit Chain",          date: "2024-01-01", lossUSD:  81_500_000, chain: "Klaytn/Ethereum" },
  { name: "LI.FI Protocol",       date: "2024-07-16", lossUSD:  11_600_000, chain: "Multi-chain" },
  { name: "Socket (Bungee)",      date: "2024-01-16", lossUSD:   3_300_000, chain: "Multi-chain" },
  { name: "Debridge",             date: "2022-09-08", lossUSD:           0, chain: "Multi-chain", note: "Attempted, thwarted" },
]
const EXPLOITED_NAMES = new Set(KNOWN_EXPLOITS.map(e => e.name.split(" ")[0].toLowerCase()))

function fmt(n) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

function computeRiskScore(name, chainCount, tvl) {
  let score = 0
  if (tvl > 500_000_000) score += 3
  else if (tvl > 100_000_000) score += 2
  else if (tvl > 10_000_000) score += 1
  if (chainCount > 5) score += 2
  else if (chainCount > 2) score += 1
  const namePart = (name || "").toLowerCase().split(" ")[0]
  if (EXPLOITED_NAMES.has(namePart) || [...EXPLOITED_NAMES].some(e => namePart.includes(e))) score += 3
  return Math.min(score, 10)
}

async function fetchProtocols() {
  console.log("🌰 Fetching bridge protocols from DeFiLlama...")
  const res = await fetch(DEFILLAMA_PROTOCOLS_URL, {
    headers: { "User-Agent": "BridgeWatch/1.0 (+https://github.com/AlexChen31337/bridge-security-monitor)" }
  })
  if (!res.ok) throw new Error(`DeFiLlama API error: ${res.status}`)
  return await res.json()
}

async function main() {
  const protocols = await fetchProtocols()

  // Filter bridge/cross-chain protocols with meaningful TVL
  const bridgeProtocols = protocols
    .filter(p => ["Bridge", "Cross Chain"].includes(p.category) && p.tvl > 1_000_000)
    .sort((a, b) => (b.tvl || 0) - (a.tvl || 0))
    .slice(0, 60)

  console.log(`🌰 Processing ${bridgeProtocols.length} bridge protocols...`)

  const bridges = bridgeProtocols.map(p => {
    const tvl = p.tvl || 0
    // Filter out internal keys like 'staking', 'pool2'
    const chains = Object.keys(p.chainTvls || {})
      .filter(k => !["staking", "pool2", "borrowed", "offers", "treasury"].includes(k))
    const name = p.name || p.slug || "Unknown"
    const riskScore = computeRiskScore(name, chains.length, tvl)
    const namePart = name.toLowerCase().split(" ")[0]
    const exploited = EXPLOITED_NAMES.has(namePart) || [...EXPLOITED_NAMES].some(e => namePart.includes(e))

    return {
      id:           p.slug || name.toLowerCase().replace(/\s+/g, "-"),
      name,
      tvlUSD:       tvl,
      tvlFormatted: fmt(tvl),
      chains:       chains.slice(0, 8),
      chainCount:   chains.length,
      riskScore,
      exploited,
      url:          p.url || null,
    }
  })

  const totalTVL    = bridges.reduce((s, b) => s + b.tvlUSD, 0)
  const highRisk    = bridges.filter(b => b.riskScore >= 6)
  const totalAtRisk = highRisk.reduce((s, b) => s + b.tvlUSD, 0)

  const output = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalBridgesTracked: bridges.length,
      totalTVL,
      totalTVLFormatted:   fmt(totalTVL),
      highRiskBridges:     highRisk.length,
      tvlAtRisk:           totalAtRisk,
      tvlAtRiskFormatted:  fmt(totalAtRisk),
      volume7dUSD:         0,    // filled by volume endpoint if available
      volume7dFormatted:   "N/A",
    },
    bridges,
    exploitHistory: [...KNOWN_EXPLOITS].sort((a, b) => b.lossUSD - a.lossUSD),
    volumeTrend:   [],
  }

  await mkdir("data", { recursive: true })
  await writeFile("data/bridge-data.json", JSON.stringify(output, null, 2))

  console.log(`🌰 Saved ${bridges.length} bridges`)
  console.log(`   Total TVL: ${fmt(totalTVL)}`)
  console.log(`   High-risk: ${highRisk.length} bridges (${fmt(totalAtRisk)} at risk)`)
}

main().catch(e => { console.error("❌ Fetch failed:", e.message); process.exit(1) })
