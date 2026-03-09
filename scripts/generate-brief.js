/**
 * 🌰 BridgeWatch — generate-brief.js
 * Uses GitHub Models (GPT-4o mini) to generate a weekly AI security brief
 * from the fetched bridge data. 🌰🌰🌰
 */

import { writeFile, readFile, mkdir } from "fs/promises"

const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const GITHUB_MODELS_URL = "https://models.inference.ai.azure.com/chat/completions"
const GITHUB_MODELS_MODEL = "gpt-4o-mini"

async function generateBrief(bridgeData) {
  if (!GITHUB_TOKEN) {
    console.warn("⚠️  No GITHUB_TOKEN — skipping AI brief generation")
    return null
  }

  const { summary, bridges, exploitHistory } = bridgeData
  const top10 = bridges.slice(0, 10)
  const highRisk = bridges.filter(b => b.riskScore >= 6).slice(0, 5)

  const prompt = `You are BridgeWatch 🌰, an AI analyst specialising in cross-chain bridge security intelligence.

Generate a concise weekly security brief (600-800 words) based on this data snapshot:

## Bridge Ecosystem Overview
- Total bridges tracked: ${summary.totalBridgesTracked}
- Total TVL locked: ${summary.totalTVLFormatted}
- 7-day bridge volume: ${summary.volume7dFormatted}
- High-risk bridges: ${summary.highRiskBridges} bridges (${summary.tvlAtRiskFormatted} at risk)

## Top 10 Bridges by TVL
${top10.map((b, i) => `${i + 1}. ${b.name}: ${b.tvlFormatted} TVL | ${b.chainCount} chains | Risk score: ${b.riskScore}/10${b.exploited ? " ⚠️ PREVIOUSLY EXPLOITED" : ""}`).join("\n")}

## High-Risk Bridges (score ≥ 6/10)
${highRisk.length > 0 ? highRisk.map(b => `- ${b.name}: ${b.tvlFormatted} TVL, risk ${b.riskScore}/10, chains: ${b.chains.join(", ")}`).join("\n") : "None flagged this week."}

## Historical Exploit Reference
Total historical bridge losses: $2.05B+
Largest: Ronin Bridge ($625M, March 2022), BNB Bridge ($586M, October 2022)

Write the brief in this structure:
1. **Executive Summary** (2-3 sentences, number-led)
2. **TVL & Volume Trend** (what the numbers say about bridge activity)
3. **Top Risks This Week** (focus on high-risk bridges; if none, discuss systemic risks)
4. **Exploit Pattern Analysis** (what attack vectors dominate historically; what that means for current bridges)
5. **Analyst Recommendation** (1-3 actionable points for protocols and users)

Tone: Professional, data-driven, security-focused. Use precise numbers. No fluff.
End with a signature: — BridgeWatch AI 🌰`

  console.log("🌰 Generating AI brief via GitHub Models...")

  const res = await fetch(GITHUB_MODELS_URL, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${GITHUB_TOKEN}`,
    },
    body: JSON.stringify({
      model:       GITHUB_MODELS_MODEL,
      messages:    [{ role: "user", content: prompt }],
      max_tokens:  1200,
      temperature: 0.4,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`GitHub Models API error ${res.status}: ${err}`)
  }

  const data = await res.json()
  const brief = data.choices?.[0]?.message?.content
  if (!brief) throw new Error("Empty response from GitHub Models")

  console.log(`🌰 Brief generated (${brief.length} chars)`)
  return brief
}

async function main() {
  // Load fetched data
  let bridgeData
  try {
    const raw = await readFile("data/bridge-data.json", "utf8")
    bridgeData = JSON.parse(raw)
  } catch (e) {
    console.error("❌ No bridge-data.json found — run fetch-bridge-data.js first")
    process.exit(1)
  }

  const brief = await generateBrief(bridgeData)

  const report = {
    generatedAt: new Date().toISOString(),
    weekEnding:  new Date().toISOString().split("T")[0],
    summary:     bridgeData.summary,
    brief:       brief || "AI brief unavailable — GitHub token required. See bridge data for raw analysis.",
    dataSource:  "DeFiLlama Bridges API + curated exploit history",
    modelUsed:   brief ? GITHUB_MODELS_MODEL : null,
  }

  await mkdir("data", { recursive: true })
  await writeFile("data/weekly-report.json", JSON.stringify(report, null, 2))
  console.log("🌰 Weekly report saved to data/weekly-report.json")
}

main().catch(e => { console.error("❌ Brief generation failed:", e.message); process.exit(1) })
