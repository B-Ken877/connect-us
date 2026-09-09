import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/** Public health endpoint (uptime monitors / Vercel checks). */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ etat: "ok", base: "ok", horodatage: new Date().toISOString() });
  } catch {
    return NextResponse.json({ etat: "degrade", base: "inaccessible" }, { status: 503 });
  }
}
