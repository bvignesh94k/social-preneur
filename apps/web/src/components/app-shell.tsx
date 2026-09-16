import type { AgencyRole } from "@sp/core";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/actions/auth";
import { AGENCY_ROLE_LABEL } from "@/lib/labels";
import { ClientSwitcher, type SwitcherClient } from "./client-switcher";
import { SidebarNav } from "./sidebar-nav";

const COMING_NEXT = ["Today", "Calendar", "Content", "Approvals", "Media", "Integrations", "Analytics"];

export function AppShell({
  children,
  userName,
  role,
  agencyName,
  clients,
}: {
  children: ReactNode;
  userName: string;
  role: AgencyRole;
  agencyName: string;
  clients: SwitcherClient[];
}) {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface px-3 py-5 md:flex">
        <div className="mb-6 flex items-center gap-2.5 px-3 font-display text-lg font-extrabold tracking-tight">
          <span aria-hidden className="block h-4 w-5 rounded-[3px] border-2 border-t-[6px] border-accent" />
          Social Preneur
        </div>
        <SidebarNav />
        <p className="mt-8 px-3 text-[10px] font-medium uppercase tracking-wider text-muted">Coming next</p>
        <ul className="mt-2 grid gap-0.5">
          {COMING_NEXT.map((label) => (
            <li key={label} className="flex items-center justify-between px-3 py-1.5 text-sm text-muted">
              {label}
              <span className="rounded bg-sunk px-1.5 py-0.5 text-[10px] uppercase tracking-wide">Soon</span>
            </li>
          ))}
        </ul>
        <p className="mt-auto px-3 pt-6 text-xs text-muted">{agencyName}</p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-line bg-surface">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
            <ClientSwitcher clients={clients} />
            <div className="flex items-center gap-3">
              <div className="hidden text-right leading-tight sm:block">
                <div className="text-sm font-medium">{userName}</div>
                <div className="text-xs text-muted">{AGENCY_ROLE_LABEL[role]}</div>
              </div>
              <form action={signOutAction}>
                <button type="submit" className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-sunk">
                  Sign out
                </button>
              </form>
            </div>
          </div>
          <div className="border-t border-line px-2 py-1.5 md:hidden">
            <SidebarNav orientation="horizontal" />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
