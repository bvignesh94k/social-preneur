import Link from "next/link";

export default function Home() {
  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "40px 20px" }}>
      <header style={{ marginBottom: "60px", textAlign: "center" }}>
        <h1 style={{ fontSize: "48px", margin: "0 0 20px 0" }}>
          Social Preneur
        </h1>
        <p style={{ fontSize: "18px", color: "#666", margin: "0 0 30px 0" }}>
          AI-assisted social media management for agencies
        </p>
        <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
          <Link href="/login" style={{
            padding: "12px 24px",
            backgroundColor: "#0F6B57",
            color: "white",
            textDecoration: "none",
            borderRadius: "6px",
            fontWeight: "500"
          }}>
            Login
          </Link>
          <Link href="/signup" style={{
            padding: "12px 24px",
            border: "2px solid #0F6B57",
            color: "#0F6B57",
            textDecoration: "none",
            borderRadius: "6px",
            fontWeight: "500",
            backgroundColor: "white"
          }}>
            Sign Up
          </Link>
        </div>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "30px", marginTop: "60px" }}>
        <div style={{ padding: "30px", border: "1px solid #ddd", borderRadius: "8px" }}>
          <h3 style={{ marginTop: 0 }}>📅 Plan & Schedule</h3>
          <p style={{ color: "#666" }}>
            Create content calendars and schedule posts across all platforms.
          </p>
        </div>
        <div style={{ padding: "30px", border: "1px solid #ddd", borderRadius: "8px" }}>
          <h3 style={{ marginTop: 0 }}>✅ Client Approvals</h3>
          <p style={{ color: "#666" }}>
            Get client sign-off with simple approval links.
          </p>
        </div>
        <div style={{ padding: "30px", border: "1px solid #ddd", borderRadius: "8px" }}>
          <h3 style={{ marginTop: 0 }}>🚀 Auto-Publish</h3>
          <p style={{ color: "#666" }}>
            Posts go live automatically at scheduled times.
          </p>
        </div>
      </section>
    </div>
  );
}
