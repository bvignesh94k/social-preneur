"use client";

import { useState } from "react";

const PLATFORMS = ["linkedin", "facebook", "twitter", "instagram", "pinterest"];

export default function ClientDetailsPage({ params }: { params: { id: string } }) {
  const clientId = params.id;
  const [platform, setPlatform] = useState("linkedin");
  const [name, setName] = useState("");
  const [pageId, setPageId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleLinkPage(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/clients/${clientId}/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, name, pageId }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setError(data.error || "Failed to link page");
        setLoading(false);
        return;
      }

      setSuccess(`${name} linked successfully!`);
      setName("");
      setPageId("");
      setLoading(false);
    } catch {
      setError("An error occurred");
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: "40px 20px", maxWidth: "600px", margin: "0 auto" }}>
      <div style={{ marginBottom: "20px" }}>
        <a href="/dashboard" style={{ color: "#0F6B57", textDecoration: "none", fontSize: "14px" }}>
          ← Back to Dashboard
        </a>
      </div>

      <h1>Link Social Media Page</h1>
      <p style={{ color: "#666", marginBottom: "20px" }}>Connect your client's social media pages to manage them here.</p>

      <form onSubmit={handleLinkPage} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div>
          <label style={{ display: "block", marginBottom: "4px", fontWeight: 600 }}>
            Platform *
          </label>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid #ddd",
              borderRadius: "8px",
              fontSize: "14px",
            }}
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: "block", marginBottom: "4px", fontWeight: 600 }}>
            Page Name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Company Page, Brand Name"
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
            Page ID *
          </label>
          <input
            type="text"
            value={pageId}
            onChange={(e) => setPageId(e.target.value)}
            placeholder="e.g., 123456789"
            required
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid #ddd",
              borderRadius: "8px",
              fontSize: "14px",
            }}
          />
          <p style={{ fontSize: "12px", color: "#999", marginTop: "4px" }}>
            You can find this in the page URL or platform settings
          </p>
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
          {loading ? "Linking..." : "Link Page"}
        </button>
      </form>

      <div style={{ marginTop: "40px", padding: "20px", background: "#f5f5f5", borderRadius: "8px" }}>
        <h3>Linked Pages</h3>
        <p style={{ color: "#999", fontSize: "14px" }}>No pages linked yet. Add one above to get started!</p>
      </div>
    </main>
  );
}
