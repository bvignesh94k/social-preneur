import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { getMyClients } from "@/data/clients";
import { requireWorkspace } from "@/lib/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user, agency, actor } = await requireWorkspace();
  const clients = await getMyClients();

  return (
    <AppShell
      userName={user.name}
      role={actor.agencyRole}
      agencyName={agency.name}
      clients={clients.map(({ slug, name, industry }) => ({ slug, name, industry }))}
    >
      {children}
    </AppShell>
  );
}
