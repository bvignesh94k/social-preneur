"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/dashboard", label: "Dashboard", match: ["/dashboard"] },
  { href: "/clients", label: "Clients", match: ["/clients", "/c/"] },
] as const;

export function SidebarNav({ orientation = "vertical" }: { orientation?: "vertical" | "horizontal" }) {
  const pathname = usePathname();
  const horizontal = orientation === "horizontal";

  return (
    <nav aria-label="Main">
      <ul className={horizontal ? "flex gap-1" : "grid gap-0.5"}>
        {ITEMS.map((item) => {
          const active = item.match.some((m) => pathname === m || pathname.startsWith(m.endsWith("/") ? m : `${m}/`));
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex rounded-md px-3 py-2 text-sm ${
                  active ? "bg-accent-soft font-medium text-accent-ink" : "text-muted hover:bg-sunk hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
