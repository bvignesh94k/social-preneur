import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const clients = await fetch(
      `${process.env.DATABASE_URL?.split("?")[0]}/clients` || ""
    );
    return NextResponse.json({ clients: [] });
  } catch {
    return NextResponse.json({ error: "Failed to fetch clients" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json() as { name: string; email: string; phone?: string; website?: string; industry?: string };

    if (!body.name || !body.email) {
      return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
    }

    return NextResponse.json({
      id: "client_1",
      name: body.name,
      email: body.email,
      phone: body.phone,
      website: body.website,
      industry: body.industry,
      createdAt: new Date(),
    }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create client" }, { status: 500 });
  }
}
