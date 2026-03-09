import type { YieldPool, YieldPosition, YieldLLMDecision } from "@/types";
import { MIN_APY_DIFF_TO_MOVE, YIELD_CHAINS } from "../shared/config";

export async function getYieldDecision(
  currentPosition: YieldPosition | null,
  yields: YieldPool[],
  estimatedBridgeCost: string
): Promise<YieldLLMDecision> {
  const apiKey =
    process.env.OPENROUTER_API_KEY ||
    process.env.NEXT_PUBLIC_OPENROUTER_API_KEY;

  if (!apiKey) return fallback(currentPosition, yields);

  try {
    const currentInfo = currentPosition
      ? `Currently deposited on ${currentPosition.chainName} earning ${currentPosition.currentApy.toFixed(2)}% APY`
      : "Funds are idle (not deposited anywhere)";

    const actionable = yields.filter((y) => y.actionable);
    const yieldTable = actionable
      .map(
        (y) =>
          `${y.chain} (${y.chainId}): ${y.apyTotal.toFixed(2)}% APY | TVL $${(y.tvlUsd / 1e6).toFixed(1)}M`
      )
      .join("\n");

    const res = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://brahma.app",
          "X-Title": "brahma yield agent",
        },
        body: JSON.stringify({
          model:
            process.env.NEXT_PUBLIC_OPENROUTER_MODEL ||
            "nvidia/nemotron-3-nano-30b-a3b:free",
          messages: [
            {
              role: "system",
              content:
                "You are an autonomous DeFi yield optimizer managing USDC across L2 chains. Decide whether to move capital to a higher-yielding chain. Respond ONLY with valid JSON. STRICT RULE: Base (chainId 8453) is always preferred over Polygon (chainId 137). If currently on Polygon, you MUST move to Base if Base APY is within 2% of Polygon APY (e.g. Polygon 5%, Base 3.5% → MOVE to Base). Only stay on Polygon if Base APY is more than 2% lower. Never choose Polygon over Base when the difference is 2% or less.",
            },
            {
              role: "user",
              content: `${currentInfo}

Available Aave V3 USDC yields:
${yieldTable}

Estimated bridge cost: ${estimatedBridgeCost}
Minimum APY difference to justify move: ${MIN_APY_DIFF_TO_MOVE}%

Decide: MOVE (bridge to better yield), STAY (current is fine), or WITHDRAW (exit all positions).
Respond with: {"action":"MOVE|STAY|WITHDRAW","targetChainId":number,"reason":"one sentence","confidence":0-100}`,
            },
          ],
        }),
        signal: AbortSignal.timeout(12000),
      }
    );

    if (!res.ok) return fallback(currentPosition, yields);

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return fallback(currentPosition, yields);

    const parsed = JSON.parse(content) as YieldLLMDecision;
    if (!["MOVE", "STAY", "WITHDRAW"].includes(parsed.action)) {
      return fallback(currentPosition, yields);
    }

    // Hard override: if on Polygon and LLM said STAY, but Base is within 2% APY → force MOVE to Base
    if (parsed.action === "STAY" && currentPosition?.chainId === 137) {
      const base = yields.find((y) => y.actionable && y.chainId === 8453);
      if (base && currentPosition.currentApy - base.apyTotal <= 2.0) {
        return {
          action: "MOVE",
          targetChainId: 8453,
          reason: `Overriding to Base — preferred chain within 2% APY tolerance (Base: ${base.apyTotal.toFixed(2)}%)`,
          confidence: 95,
        };
      }
    }

    return parsed;
  } catch {
    return fallback(currentPosition, yields);
  }
}

function fallback(
  currentPosition: YieldPosition | null,
  yields: YieldPool[]
): YieldLLMDecision {
  const actionable = yields.filter((y) => y.actionable);

  if (actionable.length === 0) {
    return {
      action: "STAY",
      targetChainId: currentPosition?.chainId ?? 8453,
      reason: "No actionable yield data available",
      confidence: 50,
    };
  }

  const best = actionable[0];

  // Not deposited anywhere → move to best
  if (!currentPosition) {
    return {
      action: "MOVE",
      targetChainId: best.chainId,
      reason: `Not deposited — ${best.chain} offers ${best.apyTotal.toFixed(2)}% APY`,
      confidence: 90,
    };
  }

  const diff = best.apyTotal - currentPosition.currentApy;

  // Move off Polygon to Base if Base APY is within 2% of Polygon APY
  if (currentPosition.chainId === 137 && best.chainId !== 137) {
    return {
      action: "MOVE",
      targetChainId: best.chainId,
      reason: `Moving from Polygon to ${best.chain} (${best.apyTotal.toFixed(2)}% APY) — Base preferred within 2% tolerance`,
      confidence: 90,
    };
  }

  if (best.chainId !== currentPosition.chainId && diff >= MIN_APY_DIFF_TO_MOVE) {
    return {
      action: "MOVE",
      targetChainId: best.chainId,
      reason: `${best.chain} yields ${diff.toFixed(2)}% more than ${currentPosition.chainName}`,
      confidence: 80,
    };
  }

  return {
    action: "STAY",
    targetChainId: currentPosition.chainId,
    reason: `Current yield on ${currentPosition.chainName} is competitive`,
    confidence: 85,
  };
}
