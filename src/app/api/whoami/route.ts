import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Temporary MOO-302 diagnostic: shows the session claims the server actually sees.
export async function GET() {
  const { userId, sessionClaims } = await auth();
  return NextResponse.json({ userId, sessionClaims });
}
