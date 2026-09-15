import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, password } = body;

    if (!name || !email || !password) {
      return NextResponse.json(
        { message: "Name, email, and password required" },
        { status: 400 }
      );
    }

    const newUser = {
      id: `user_${Date.now()}`,
      name,
      email,
    };

    const response = NextResponse.json(
      { message: "Account created successfully", user: newUser },
      { status: 201 }
    );

    response.cookies.set("auth-token", newUser.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
