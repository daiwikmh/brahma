import { NextResponse } from "next/server";
import {
  getYieldAgentState,
  startYieldAgent,
  stopYieldAgent,
  resetYieldAgent,
  setYieldMode,
} from "@/lib/yieldAgent";
import { DEFAULT_YIELD_POLL_INTERVAL } from "@/lib/config";

export async function GET() {
  return NextResponse.json(getYieldAgentState());
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "start": {
        const privateKey = process.env.PRIVATE_KEY;
        if (!privateKey) {
          return NextResponse.json(
            { error: "No PRIVATE_KEY configured" },
            { status: 400 }
          );
        }
        startYieldAgent({
          privateKey,
          pollIntervalMs:
            body.pollIntervalMs ??
            Number(process.env.POLL_INTERVAL_MS ?? DEFAULT_YIELD_POLL_INTERVAL),
          mode: body.mode ?? "DRY_RUN",
        });
        return NextResponse.json({ ok: true, status: "started" });
      }

      case "stop":
        stopYieldAgent();
        return NextResponse.json({ ok: true, status: "stopped" });

      case "reset":
        resetYieldAgent();
        return NextResponse.json({ ok: true, status: "reset" });

      case "set-mode":
        setYieldMode(body.mode ?? "DRY_RUN");
        return NextResponse.json({ ok: true, mode: body.mode });

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
