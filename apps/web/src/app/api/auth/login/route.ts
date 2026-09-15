import { NextRequest, NextResponse } from "next/server";

const DEMO_USER = {
  id: "user_1",
  email: "email@example.com",
  name: "Demo User",
  password: "password123",
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { message: "Email and password required" },
        { status: 400 }
      );
    }

    if (email === DEMO_USER.email && password === DEMO_USER.password) {
      const response = NextResponse.json(
        { message: "Login successful", user: DEMO_USER },
        { status: 200 }
      );

      response.cookies.set("auth-token", DEMO_USER.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
      });

      return response;
    }

    return NextResponse.json(
      { message: "Invalid email or password" },
      { status: 401 }
    );
  } catch (error) {
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
