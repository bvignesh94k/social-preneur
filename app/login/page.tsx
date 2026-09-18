"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function handleLinkedInSignIn() {
    const clientId = process.env.NEXT_PUBLIC_LINKEDIN_CLIENT_ID;
    const redirectUri = encodeURIComponent(
      process.env.NEXT_PUBLIC_LINKEDIN_REDIRECT_URI || "http://localhost:3000/auth/linkedin/callback"
    );
    const scope = encodeURIComponent("openid profile email");
    const state = Math.random().toString(36).substring(7);

    const linkedInUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
    window.location.href = linkedInUrl;
  }

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

          <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "20px 0 16px" }}>
            <div style={{ flex: 1, height: "1px", background: "#D4DCD8" }} />
            <span style={{ fontSize: "12px", color: "#7A8580" }}>or</span>
            <div style={{ flex: 1, height: "1px", background: "#D4DCD8" }} />
          </div>

          <button
            type="button"
            onClick={handleLinkedInSignIn}
            style={{
              padding: "11px 16px",
              background: "#FFFFFF",
              color: "#0A66C2",
              border: "1.5px solid #0A66C2",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" />
            </svg>
            Sign in with LinkedIn
          </button>
        </form>
      </div>
    </main>
  );
}
