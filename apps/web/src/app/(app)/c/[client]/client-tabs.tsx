"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ClientTabs({
  slug,
  showBrand,
  showContent,
}: {
  slug: string;
  showBrand: boolean;
  showContent: boolean;
}) {
  const pathname = usePathname();
  const base = `/c/${slug}`;
  const tabs = [
    { href: base, label: "Overview", active: pathname === base },
    ...(showBrand ? [{ href: `${base}/brand`, label: "Brand Brain", active: pathname.startsWith(`${base}/brand`) }] : []),
    ...(showContent
      ? [{ href: `${base}/content`, label: "Content", active: pathname.startsWith(`${base}/content`) }]
      : []),
  ];

  return (
    <nav aria-label="Client sections" className="overflow-x-auto overflow-y-hidden border-b border-line">
      <ul className="flex gap-1">
        {tabs.map((tab) => (
          <li key={tab.href}>
            <Link
              href={tab.href}
              aria-current={tab.active ? "page" : undefined}
              className={`-mb-px inline-flex whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
                tab.active ? "border-accent font-medium text-ink" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
