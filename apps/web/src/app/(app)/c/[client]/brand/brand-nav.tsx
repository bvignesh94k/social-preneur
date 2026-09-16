"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function BrandNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/c/${slug}/brand`;
  const items = [
    { href: base, label: "Profile" },
    { href: `${base}/offerings`, label: "Products and services" },
    { href: `${base}/facts`, label: "Facts" },
    { href: `${base}/rules`, label: "Content rules" },
    { href: `${base}/website`, label: "Website scan" },
    { href: `${base}/summary`, label: "Brand summary" },
  ];

  return (
    <nav aria-label="Brand Brain sections">
      <ul className="flex gap-1 overflow-x-auto lg:grid lg:overflow-visible">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex whitespace-nowrap rounded-md px-3 py-2 text-sm ${
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
