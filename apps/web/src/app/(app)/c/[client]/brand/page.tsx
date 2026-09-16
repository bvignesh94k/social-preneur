import { getBrandProfile } from "@sp/db";
import type { Metadata } from "next";
import { SectionHeader } from "@/components/ui";
import { getBrandWorkspace } from "@/data/brand";
import { formatDateTime } from "@/lib/labels";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Brand profile" };

export default async function BrandProfilePage({ params }: PageProps<"/c/[client]/brand">) {
  const ws = await getBrandWorkspace((await params).client);
  const profile = await getBrandProfile(ws.db, ws.scope);

  return (
    <div className="grid gap-6">
      <SectionHeader
        title="Brand profile"
        description={`What the AI needs to know about ${ws.client.name} before it suggests anything.`}
      />
      <ProfileForm
        clientId={ws.client.id}
        slug={ws.client.slug}
        readOnly={!ws.can.edit}
        initial={{
          description: profile?.description ?? "",
          targetAudience: profile?.targetAudience ?? "",
          targetLocations: profile?.targetLocations.join(", ") ?? "",
          usps: profile?.usps.join("\n") ?? "",
          toneOfVoice: profile?.toneOfVoice ?? [],
          contentStyle: profile?.contentStyle ?? "",
          primaryCta: profile?.primaryCta ?? "",
          ctaUrl: profile?.ctaUrl ?? "",
          phone: profile?.phone ?? "",
          email: profile?.email ?? "",
          brandColors: profile?.brandColors ?? [],
          fonts: profile?.fonts.join(", ") ?? "",
          preferredHashtags: profile?.preferredHashtags.join(" ") ?? "",
          wordsToAvoid: profile?.wordsToAvoid.join(", ") ?? "",
          socialLinks: profile?.socialLinks ?? {},
          lastSaved: profile ? formatDateTime(profile.updatedAt, ws.timezone) : null,
        }}
      />
    </div>
  );
}
