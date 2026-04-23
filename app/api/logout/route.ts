import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = createClient();
  await supabase.auth.signOut();
  const origin = req.nextUrl.origin;
  return NextResponse.redirect(new URL("/login", origin), { status: 302 });
}
