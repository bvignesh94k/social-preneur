"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface User {
  name: string;
  email: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const userStr = localStorage.getItem("user");
    if (!userStr) {
      router.push("/login");
      return;
    }
    setUser(JSON.parse(userStr));
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("user");
    router.push("/login");
  };

  if (!user) {
    return <div style={{ textAlign: "center", padding: "40px" }}>Loading...</div>;
  }

  return (
    <div>
      <nav style={{
        backgroundColor: "white",
        borderBottom: "1px solid #eee",
        padding: "16px 20px"
      }}>
        <div style={{
          maxWidth: "1200px",
          margin: "0 auto",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <h1 style={{ margin: 0, fontSize: "24px" }}>Social Preneur</h1>
          <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
            <span style={{ fontSize: "14px", color: "#666" }}>{user.email}</span>
            <button
              onClick={handleLogout}
              style={{
                padding: "8px 16px",
                backgroundColor: "#f0f0f0",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "14px"
              }}
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      <main style={{
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "40px 20px"
      }}>
        <h2 style={{ marginTop: 0 }}>Welcome, {user.name}!</h2>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
          gap: "20px",
          marginBottom: "40px"
        }}>
          <div style={{
            backgroundColor: "white",
            padding: "20px",
            borderRadius: "8px",
            border: "1px solid #eee"
          }}>
            <h3 style={{ margin: "0 0 8px 0" }}>Clients</h3>
            <p style={{ margin: "0", fontSize: "32px", fontWeight: "bold", color: "#0F6B57" }}>0</p>
            <p style={{ margin: "8px 0 0 0", fontSize: "12px", color: "#999" }}>Total clients</p>
          </div>

          <div style={{
            backgroundColor: "white",
            padding: "20px",
            borderRadius: "8px",
            border: "1px solid #eee"
          }}>
            <h3 style={{ margin: "0 0 8px 0" }}>Posts Scheduled</h3>
            <p style={{ margin: "0", fontSize: "32px", fontWeight: "bold", color: "#0066cc" }}>0</p>
            <p style={{ margin: "8px 0 0 0", fontSize: "12px", color: "#999" }}>This month</p>
          </div>

          <div style={{
            backgroundColor: "white",
            padding: "20px",
            borderRadius: "8px",
            border: "1px solid #eee"
          }}>
            <h3 style={{ margin: "0 0 8px 0" }}>Accounts</h3>
            <p style={{ margin: "0", fontSize: "32px", fontWeight: "bold", color: "#9933cc" }}>0</p>
            <p style={{ margin: "8px 0 0 0", fontSize: "12px", color: "#999" }}>Connected</p>
          </div>
        </div>

        <div style={{
          backgroundColor: "white",
          padding: "30px",
          borderRadius: "8px",
          border: "1px solid #eee"
        }}>
          <h3>Quick Start</h3>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "16px"
          }}>
            <button style={{
              padding: "20px",
              border: "2px dashed #ddd",
              borderRadius: "8px",
              backgroundColor: "transparent",
              cursor: "pointer",
              fontSize: "14px"
            }}>
              <div style={{ fontWeight: "600" }}>Add Client</div>
              <div style={{ fontSize: "12px", color: "#999", marginTop: "8px" }}>
                Create a new client workspace
              </div>
            </button>
            <button style={{
              padding: "20px",
              border: "2px dashed #ddd",
              borderRadius: "8px",
              backgroundColor: "transparent",
              cursor: "pointer",
              fontSize: "14px"
            }}>
              <div style={{ fontWeight: "600" }}>Connect Account</div>
              <div style={{ fontSize: "12px", color: "#999", marginTop: "8px" }}>
                Connect social media accounts
              </div>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
