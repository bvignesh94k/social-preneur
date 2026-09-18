import type { Metadata } from "next";
import { SectionHeader } from "@/components/ui";
import { getClientOverview } from "@/data/clients";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };

export default async function ClientSettingsPage({ params }: PageProps<"/c/[client]/settings">) {
  const { client } = await getClientOverview((await params).client);

  return (
    <div className="grid gap-6">
      <SectionHeader title="Settings" description={`Details and timezone for ${client.name}.`} />
      <SettingsForm
        slug={client.slug}
        values={{
          name: client.name,
          website: client.website ?? "",
          industry: client.industry ?? "",
          timezone: client.timezone,
        }}
      />
    </div>
  );
}
