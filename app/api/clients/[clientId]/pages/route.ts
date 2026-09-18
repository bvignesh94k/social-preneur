import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: { clientId: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = params.clientId;

  try {
    return NextResponse.json({
      clientId,
      pages: []
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch pages" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { clientId: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json() as {
      platform: string;
      name: string;
      pageId: string;
      accessToken?: string;
    };

    if (!body.platform || !body.name || !body.pageId) {
      return NextResponse.json(
        { error: "Platform, name, and pageId are required" },
        { status: 400 }
      );
    }

    const clientId = params.clientId;

    return NextResponse.json({
      id: "page_1",
      clientId,
      platform: body.platform,
      name: body.name,
      pageId: body.pageId,
      accessToken: body.accessToken,
      createdAt: new Date(),
    }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create page" }, { status: 500 });
  }
}
