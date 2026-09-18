import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const setupSteps = [
  {
    title: "Admin login",
    state: "Done",
    detail: "Only your email and password get in. The demo login and public signup are gone.",
  },
  {
    title: "Database",
    state: "Waiting on you",
    detail: "Create a free Neon Postgres database from the Storage tab of this project in Vercel.",
  },
  {
    title: "Platform developer apps",
    state: "Waiting on you",
    detail: "Register with Meta, LinkedIn, X and Pinterest. Reviews take weeks, so start them now.",
  },
  {
    title: "Clients and brand profiles",
    state: "In Progress",
    detail: "Manage your clients and their social media pages.",
  },
];

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6F5" }}>
      <nav style={{ background: "#FFFFFF", borderBottom: "1px solid #D4DCD8" }}>
        <div
          style={{
            maxWidth: "1000px",
            margin: "0 auto",
            padding: "14px 20px",
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <strong style={{ fontSize: "18px", letterSpacing: "-0.01em" }}>Social Preneur</strong>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <span style={{ fontSize: "13px", color: "#56635E" }}>{session.email}</span>
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                style={{
                  padding: "7px 14px",
                  background: "#EAEFEC",
                  border: "1px solid #D4DCD8",
                  borderRadius: "8px",
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </nav>

      <main style={{ maxWidth: "1000px", margin: "0 auto", padding: "36px 20px 80px" }}>
        <h1 style={{ margin: "0 0 6px", fontSize: "26px", letterSpacing: "-0.02em" }}>Setup</h1>
        <p style={{ margin: "0 0 26px", color: "#56635E", maxWidth: "62ch" }}>
          Clients, calendar and publishing arrive once the database is connected. Here is exactly where the build stands.
        </p>

        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "10px" }}>
          {setupSteps.map((step) => (
            <li
              key={step.title}
              style={{
                background: "#FFFFFF",
                border: "1px solid #D4DCD8",
                borderRadius: "10px",
                padding: "14px 16px",
                display: "flex",
                flexWrap: "wrap",
                gap: "8px 16px",
                alignItems: "baseline",
                justifyContent: "space-between",
              }}
            >
              <div style={{ minWidth: "min(100%, 240px)", flex: "1 1 240px" }}>
                <strong style={{ fontSize: "15.5px" }}>{step.title}</strong>
                <p style={{ margin: "3px 0 0", fontSize: "13.5px", color: "#56635E" }}>{step.detail}</p>
              </div>
              <span
                style={{
                  fontSize: "11.5px",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  padding: "4px 8px",
                  borderRadius: "6px",
                  whiteSpace: "nowrap",
                  background: step.state === "Done" ? "#DDEFE8" : "#F7EBD6",
                  color: step.state === "Done" ? "#0B4F40" : "#8A5A10",
                }}
              >
                {step.state}
              </span>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
