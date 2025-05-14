import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  const { rows } = await pool.query("SELECT NOW()");
  return NextResponse.json({ now: rows[0].now });
}
