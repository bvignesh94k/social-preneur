import Link from "next/link";

export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#F4F6F5",
        color: "#17201D",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 20px",
      }}
    >
      <div style={{ width: "100%", maxWidth: "440px" }}>
        <h1 style={{ margin: "0 0 10px", fontSize: "32px", letterSpacing: "-0.025em" }}>Social Preneur</h1>
        <p style={{ margin: "0 0 26px", color: "#56635E", fontSize: "16px", lineHeight: 1.6 }}>
          The social media command center for VTurnU Digital Solutions. Private application, staff access only.
        </p>

        <Link
          href="/login"
          style={{
            display: "inline-block",
            padding: "11px 20px",
            background: "#0F6B57",
            color: "#FFFFFF",
            borderRadius: "8px",
            textDecoration: "none",
            fontSize: "14px",
            fontWeight: 600,
          }}
        >
          Sign in
        </Link>

        <p style={{ margin: "34px 0 0", fontSize: "13px", color: "#56635E", display: "flex", flexWrap: "wrap", gap: "14px" }}>
          <Link href="/privacy" style={{ color: "#56635E" }}>
            Privacy
          </Link>
          <Link href="/terms" style={{ color: "#56635E" }}>
            Terms
          </Link>
          <Link href="/data-deletion" style={{ color: "#56635E" }}>
            Data deletion
          </Link>
        </p>
      </div>
    </main>
  );
}
