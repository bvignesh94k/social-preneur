"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (email === "demo@example.com" && password === "password123") {
      localStorage.setItem("user", JSON.stringify({ email, name: "Demo User" }));
      router.push("/dashboard");
    } else {
      setError("Invalid credentials. Try demo@example.com / password123");
    }

    setLoading(false);
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#f5f5f5"
    }}>
      <div style={{
        width: "100%",
        maxWidth: "400px",
        backgroundColor: "white",
        padding: "40px",
        borderRadius: "8px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
      }}>
        <h1 style={{ textAlign: "center", margin: "0 0 30px 0" }}>
          Social Preneur
        </h1>

        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={{ display: "block", marginBottom: "8px", fontWeight: "500" }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="demo@example.com"
              style={{
                width: "100%",
                padding: "10px",
                border: "1px solid #ddd",
                borderRadius: "6px",
                fontSize: "14px",
                boxSizing: "border-box"
              }}
              required
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "8px", fontWeight: "500" }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password123"
              style={{
                width: "100%",
                padding: "10px",
                border: "1px solid #ddd",
                borderRadius: "6px",
                fontSize: "14px",
                boxSizing: "border-box"
              }}
              required
            />
          </div>

          {error && (
            <div style={{
              padding: "10px",
              backgroundColor: "#ffe0e0",
              color: "#c00",
              borderRadius: "6px",
              fontSize: "14px"
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "12px",
              backgroundColor: "#0F6B57",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: "600",
              cursor: "pointer",
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div style={{ marginTop: "20px", textAlign: "center" }}>
          <p style={{ color: "#666", fontSize: "14px", margin: "0 0 12px 0" }}>
            Demo credentials:
          </p>
          <p style={{ color: "#999", fontSize: "12px", margin: "0" }}>
            demo@example.com / password123
          </p>
        </div>

        <div style={{ marginTop: "20px", textAlign: "center", borderTop: "1px solid #eee", paddingTop: "20px" }}>
          <p style={{ margin: 0, fontSize: "14px" }}>
            Don't have an account?{" "}
            <Link href="/signup" style={{ color: "#0F6B57", textDecoration: "none", fontWeight: "500" }}>
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
