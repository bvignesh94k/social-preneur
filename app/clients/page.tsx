"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ClientsPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [industry, setIndustry] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleCreateClient(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone, website, industry }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setError(data.error || "Failed to create client");
        setLoading(false);
        return;
      }

      setSuccess("Client created successfully!");
      setName("");
      setEmail("");
      setPhone("");
      setWebsite("");
      setIndustry("");
      setLoading(false);

      setTimeout(() => router.refresh(), 1000);
    } catch {
      setError("An error occurred");
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: "40px 20px", maxWidth: "600px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h1>Manage Clients</h1>
        <a href="/dashboard" style={{ color: "#0F6B57", textDecoration: "none", fontSize: "14px", fontWeight: 600 }}>
          Back to Dashboard
        </a>
      </div>

      <form onSubmit={handleCreateClient} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div>
          <label style={{ display: "block", marginBottom: "4px", fontWeight: 600 }}>
            Client Name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid #ddd",
              borderRadius: "8px",
              fontSize: "14px",
            }}
          />
        </div>

        <div>
          <label style={{ display: "block", marginBottom: "4px", fontWeight: 600 }}>
            Email *
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid #ddd",
              borderRadius: "8px",
              fontSize: "14px",
            }}
          />
        </div>

        <div>
          <label style={{ display: "block", marginBottom: "4px", fontWeight: 600 }}>
            Phone
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid #ddd",
              borderRadius: "8px",
              fontSize: "14px",
            }}
          />
        </div>

        <div>
          <label style={{ display: "block", marginBottom: "4px", fontWeight: 600 }}>
            Website
          </label>
          <input
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid #ddd",
              borderRadius: "8px",
              fontSize: "14px",
            }}
          />
        </div>

        <div>
          <label style={{ display: "block", marginBottom: "4px", fontWeight: 600 }}>
            Industry
          </label>
          <input
            type="text"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid #ddd",
              borderRadius: "8px",
              fontSize: "14px",
            }}
          />
        </div>

        {error && (
          <div style={{ padding: "10px 12px", background: "#fee", color: "#c33", borderRadius: "8px", fontSize: "14px" }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{ padding: "10px 12px", background: "#efe", color: "#3c3", borderRadius: "8px", fontSize: "14px" }}>
            {success}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "11px 16px",
            background: loading ? "#999" : "#0F6B57",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: 600,
            cursor: loading ? "default" : "pointer",
          }}
        >
          {loading ? "Creating..." : "Create Client"}
        </button>
      </form>
    </main>
  );
}
