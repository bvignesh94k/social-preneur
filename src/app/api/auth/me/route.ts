import { NextRequest, NextResponse } from "next/server";

const DEMO_USER = {
  id: "user_1",
  email: "email@example.com",
  name: "Demo User",
};

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("auth-token");

    if (!token) {
      return NextResponse.json(
        { message: "Not authenticated" },
        { status: 401 }
      );
    }

    return NextResponse.json(DEMO_USER, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
