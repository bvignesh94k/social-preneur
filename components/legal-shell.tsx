import Link from "next/link";
import type { ReactNode } from "react";

export const CONTACT_EMAIL = "contact@socialpreneur.in";
export const COMPANY = "VTurnU Digital Solutions LLP";
export const LAST_UPDATED = "16 September 2026";

export function LegalShell({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#F4F6F5", color: "#17201D" }}>
      <main
        style={{
          maxWidth: "760px",
          margin: "0 auto",
          padding: "40px 20px 80px",
          fontSize: "15.5px",
          lineHeight: 1.65,
        }}
      >
        <Link href="/" style={{ fontSize: "13px", color: "#0F6B57" }}>
          Social Preneur
        </Link>
        <h1 style={{ margin: "14px 0 8px", fontSize: "30px", letterSpacing: "-0.02em", lineHeight: 1.15 }}>{title}</h1>
        <p style={{ margin: "0 0 4px", color: "#56635E" }}>{intro}</p>
        <p style={{ margin: "0 0 28px", fontSize: "13px", color: "#56635E" }}>
          Last updated {LAST_UPDATED} &middot; {COMPANY}
        </p>
        {children}
        <p style={{ marginTop: "36px", paddingTop: "16px", borderTop: "1px solid #D4DCD8", fontSize: "13.5px", color: "#56635E" }}>
          Questions about this page: <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "#0F6B57" }}>{CONTACT_EMAIL}</a>
        </p>
      </main>
    </div>
  );
}

export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: "26px" }}>
      <h2 style={{ fontSize: "18px", margin: "0 0 8px", letterSpacing: "-0.01em" }}>{heading}</h2>
      {children}
    </section>
  );
}
