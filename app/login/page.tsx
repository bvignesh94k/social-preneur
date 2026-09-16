"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const body = (await response.json()) as { message?: string };
        setError(body.message ?? "Sign in failed.");
        setBusy(false);
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 20px",
        background: "#F4F6F5",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "400px",
          background: "#FFFFFF",
          border: "1px solid #D4DCD8",
          borderRadius: "12px",
          padding: "32px",
        }}
      >
        <h1 style={{ margin: "0 0 4px", fontSize: "24px", letterSpacing: "-0.02em" }}>Social Preneur</h1>
        <p style={{ margin: "0 0 24px", color: "#56635E", fontSize: "14px" }}>Sign in to your command center.</p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label htmlFor="email" style={{ display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: 600 }}>
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #D4DCD8",
                borderRadius: "8px",
                fontSize: "14px",
              }}
            />
          </div>

          <div>
            <label htmlFor="password" style={{ display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: 600 }}>
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #D4DCD8",
                borderRadius: "8px",
                fontSize: "14px",
              }}
            />
          </div>

          {error ? (
            <p
              role="alert"
              style={{
                margin: 0,
                padding: "10px 12px",
                background: "#F6E0DC",
                color: "#A8392B",
                borderRadius: "8px",
                fontSize: "13.5px",
              }}
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            style={{
              padding: "11px 16px",
              background: busy ? "#7FA69B" : "#0F6B57",
              color: "#FFFFFF",
              border: "none",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: busy ? "default" : "pointer",
            }}
          >
            {busy ? "Signing in" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
