"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ClientMark } from "./client-mark";

export interface SwitcherClient {
  slug: string;
  name: string;
  industry: string | null;
}

export function ClientSwitcher({ clients }: { clients: SwitcherClient[] }) {
  const pathname = usePathname();
  const currentSlug = pathname.match(/^\/c\/([^/]+)/)?.[1];
  const current = clients.find((c) => c.slug === currentSlug);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const needle = query.trim().toLowerCase();
  const filtered = needle ? clients.filter((c) => c.name.toLowerCase().includes(needle)) : clients;
  const close = () => {
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="client-switcher-panel"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-lg border border-line bg-surface py-1.5 pl-1.5 pr-3 text-left hover:bg-sunk"
      >
        {current ? (
          <ClientMark name={current.name} slug={current.slug} size="sm" />
        ) : (
          <span className="grid size-6 place-items-center rounded-md bg-sunk text-[10px] font-semibold text-muted">
            ALL
          </span>
        )}
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted">Client</span>
          <span className="max-w-[14rem] truncate text-sm font-medium">{current?.name ?? "All clients"}</span>
        </span>
        <svg aria-hidden viewBox="0 0 16 16" className="ml-1 size-3.5 fill-none stroke-muted stroke-2">
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div
          id="client-switcher-panel"
          className="absolute left-0 top-full z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface p-2 shadow-lg"
        >
          <label htmlFor="client-switcher-search" className="sr-only">
            Find a client
          </label>
          <input
            id="client-switcher-search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a client"
            className="w-full rounded-md border border-line bg-ground px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
          <ul className="mt-2 max-h-80 overflow-y-auto">
            <li>
              <Link
                href="/dashboard"
                onClick={close}
                className="flex items-center gap-2.5 rounded-md px-2 py-2 text-sm hover:bg-sunk"
              >
                <span className="grid size-6 place-items-center rounded-md bg-sunk text-[10px] font-semibold text-muted">
                  ALL
                </span>
                All clients
              </Link>
            </li>
            {filtered.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/c/${c.slug}`}
                  onClick={close}
                  aria-current={c.slug === currentSlug ? "page" : undefined}
                  className={`flex items-center gap-2.5 rounded-md px-2 py-2 text-sm hover:bg-sunk ${
                    c.slug === currentSlug ? "bg-accent-soft" : ""
                  }`}
                >
                  <ClientMark name={c.name} slug={c.slug} size="sm" />
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate font-medium">{c.name}</span>
                    {c.industry && <span className="truncate text-xs text-muted">{c.industry}</span>}
                  </span>
                </Link>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-2 py-3 text-sm text-muted">No client matches &ldquo;{query}&rdquo;.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
