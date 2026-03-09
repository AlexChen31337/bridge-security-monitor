/**
 * 🌰 Bridge Security Monitor — AI Report Generator
 * Uses GitHub Models (gpt-4o-mini) to generate weekly intelligence brief.
 * Reads: data/bridges.json + data/exploits.json
 * Writes: data/report.json + data/report.md
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const MODEL = "gpt-4o-mini";

function fmtUSD(n) {
  if (!n || isNaN(n)) return "$0";
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(0) + "M";
  return "$" + Math.round(n).toLocaleString();
}

async function callGitHubModels(messages) {
  const res = await fetch("https://models.inference.ai.azure.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + GITHUB_TOKEN,
    },
    body: JSON.stringify({ model: MODEL, messages, max_tokens: 1200, temperature: 0.7 }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error("API error " + res.status + ": " + err.slice(0, 200));
  }
  const data = await res.json();
  if (data.error) throw new Error(JSON.stringify(data.error));
  return data.choices[0].message.content;
}

function generateFallbackReport(summary, topRisk, topVolume) {
  const topName = topRisk[0] ? topRisk[0].name : "major protocols";
  const topScore = topRisk[0] ? topRisk[0].riskScore : 0;
  const topChains = topRisk[0] ? topRisk[0].chainCount : 0;
  const topVol = topVolume[0] ? topVolume[0].name : "top bridges";
  const topVolAmt = topVolume[0] ? fmtUSD(topVolume[0].tvl) : "$0";

  return `## 🌰 Bridge Security Intelligence Brief — ${new Date().toDateString()}

**Executive Summary:** Cross-chain bridges remain the highest-value attack surface in DeFi, with over $2.85B stolen in recorded exploits. This week's scan of ${summary.totalBridges} active bridges identifies ${summary.byRiskLevel.CRITICAL} protocols at CRITICAL risk and ${summary.byRiskLevel.HIGH} at HIGH risk, collectively securing $${(summary.totalTVL / 1e9).toFixed(1)}B in total value locked.

**Risk Landscape:** ${topName} leads the CRITICAL-risk category with a score of ${topScore}/100, operating across ${topChains} chains. Historical data demonstrates that validator key compromise remains the single most devastating attack vector — the Ronin ($625M) and Multichain ($125M) hacks both resulted from insufficient key management. Bridges with multi-chain architectures face multiplicative risk: each chain integration adds relay trust assumptions, additional smart contract surface, and potential state divergence vulnerabilities.

**Capital Concentration:** ${topVol} holds approximately ${topVolAmt} in bridge TVL, representing an economically compelling target. At historical exploit-to-TVL ratios, a successful attack against any top-5 bridge could net an attacker $100M–$500M. This economics reality justifies sustained adversarial investment in reconnaissance — defenders must assume they are continuously targeted.

**Key Takeaways:**
🌰 Validator key management (HSMs, geographic distribution, ≥7/10 multi-sig) is non-negotiable for bridges holding >$100M TVL
🌰 Previously exploited bridges carry 40%+ recurrence risk — require complete architecture review before redeployment
🌰 Monitor volume anomalies (>3× daily baseline) as early indicators of in-progress drains
🌰 Smart contract upgradeability without 48-72h timelocks is a critical unmitigated risk factor`;
}

async function main() {
  console.log("🌰 Generating AI intelligence brief...");

  const bridgesPath = join(__dirname, "../data/bridges.json");
  const exploitsPath = join(__dirname, "../data/exploits.json");

  const bridgeData = JSON.parse(readFileSync(bridgesPath, "utf8"));
  const exploitData = JSON.parse(readFileSync(exploitsPath, "utf8"));

  const { summary, bridges } = bridgeData;
  const topRisk = bridges.filter((b) => b.riskLevel === "CRITICAL").slice(0, 5);
  const topVolume = [...bridges].sort((a, b) => (b.tvl || 0) - (a.tvl || 0)).slice(0, 5);
  const recentExploits = exploitData.exploits
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 4);

  const context = [
    "BRIDGE SECURITY INTELLIGENCE — Week of " + new Date().toDateString(),
    "",
    "LIVE METRICS (" + summary.totalBridges + " bridges tracked):",
    "- Risk: CRITICAL=" + summary.byRiskLevel.CRITICAL + ", HIGH=" + summary.byRiskLevel.HIGH + ", MEDIUM=" + summary.byRiskLevel.MEDIUM + ", LOW=" + summary.byRiskLevel.LOW,
    "- Total TVL: " + fmtUSD(summary.totalTVL || 0),
    "",
    "TOP CRITICAL/HIGH-RISK BRIDGES:",
    ...topRisk.map((b, i) => (i + 1) + ". " + b.name + " (Score: " + b.riskScore + "/100, " + b.chainCount + " chains, TVL: " + fmtUSD(b.tvl) + (b.exploitHistory.found ? " ⚠️ EXPLOITED" : "") + ")"),
    "",
    "HIGHEST TVL BRIDGES (prime targets):",
    ...topVolume.map((b, i) => (i + 1) + ". " + b.name + ": " + fmtUSD(b.tvl) + " TVL, " + b.chainCount + " chains, Risk: " + b.riskLevel),
    "",
    "RECENT HISTORICAL EXPLOITS:",
    ...recentExploits.map((e) => "- " + e.name + " (" + e.date + "): " + e.amountDisplay + " — " + e.method),
    "",
    "TOTAL HISTORICAL LOSSES: $2.85B across 10 incidents",
  ].join("\n");

  let reportText;

  if (!GITHUB_TOKEN) {
    console.warn("⚠️  No GITHUB_TOKEN — using fallback report");
    reportText = generateFallbackReport(summary, topRisk, topVolume);
  } else {
    try {
      console.log("🌰 Calling GitHub Models (" + MODEL + ")...");
      reportText = await callGitHubModels([
        {
          role: "system",
          content: "You are a senior cybersecurity analyst specializing in cross-chain bridge security. Generate precise, data-driven intelligence briefs.",
        },
        {
          role: "user",
          content: "Generate a weekly bridge security intelligence brief (3-4 paragraphs) based on this data. Cover: current risk landscape, capital concentration and attacker economics, lessons from historical exploits, key takeaways. Be specific with numbers. Professional tone.\n\n" + context,
        },
      ]);
      console.log("✅ AI report generated");
    } catch (err) {
      console.error("❌ GitHub Models error:", err.message);
      reportText = generateFallbackReport(summary, topRisk, topVolume);
    }
  }

  const report = {
    meta: {
      generatedAt: new Date().toISOString(),
      model: GITHUB_TOKEN ? MODEL : "fallback",
      bridgesAnalyzed: summary.totalBridges,
    },
    summary: {
      totalBridges: summary.totalBridges,
      totalTVL: summary.totalTVL || 0,
      riskBreakdown: summary.byRiskLevel,
      totalVolume24h: summary.totalVolume24h || 0,
      totalVolume7d: summary.totalVolume7d || 0,
    },
    report: reportText,
    topRiskBridges: topRisk.map((b) => ({
      name: b.name,
      riskScore: b.riskScore,
      riskLevel: b.riskLevel,
      chainCount: b.chainCount,
      tvl: b.tvl,
      exploitHistory: b.exploitHistory,
    })),
    recentExploits: recentExploits,
  };

  const jsonPath = join(__dirname, "../data/report.json");
  const mdPath = join(__dirname, "../data/report.md");
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(mdPath, "# 🌰 Bridge Security Intelligence Brief\n\n_Generated: " + new Date().toISOString() + " · Model: " + report.meta.model + "_\n\n" + reportText);

  console.log("🌰 Saved → data/report.json + data/report.md");
}

main().catch((err) => { console.error("🚨 Fatal:", err); process.exit(1); });
