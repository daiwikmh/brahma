import { NextResponse } from "next/server";
import { scanYields } from "@/lib/yield/yieldScanner";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const pools = await scanYields();
    return NextResponse.json({ pools });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scan failed";
    console.error("[/api/yields]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
