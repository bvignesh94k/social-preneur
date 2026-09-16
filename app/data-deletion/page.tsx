import type { Metadata } from "next";
import { CONTACT_EMAIL, LegalShell, Section } from "@/components/legal-shell";

export const metadata: Metadata = {
  title: "Data Deletion | Social Preneur",
  description: "How to have data removed from the Social Preneur application.",
};

export default function DataDeletionPage() {
  return (
    <LegalShell
      title="Data Deletion"
      intro="How to have account or client data removed from Social Preneur."
    >
      <Section heading="Disconnect an account yourself">
        <p>
          Removing this application from a connected account immediately ends its access. On Facebook and Instagram this is
          under Settings, Business integrations. On LinkedIn it is under Settings, Permitted services. On X it is under
          Settings, Connected apps. On Pinterest it is under Settings, Apps. Stored tokens for that account stop working
          the moment access is withdrawn.
        </p>
      </Section>

      <Section heading="Request deletion of stored data">
        <p>
          Write to {CONTACT_EMAIL} with the subject &quot;Data deletion&quot; and name the business or social account
          involved. No particular format is required.
        </p>
      </Section>

      <Section heading="What gets deleted">
        <ul>
          <li>Stored access tokens for the accounts named in the request.</li>
          <li>Business information, brand details and uploaded media for that client.</li>
          <li>Drafts, scheduled posts, captions and creative briefs for that client.</li>
          <li>Stored performance figures collected from that client&apos;s accounts.</li>
        </ul>
        <p>
          Posts already published on a social media platform live on that platform and must be deleted there. Records
          required for accounting or legal reasons are kept only for as long as the law requires.
        </p>
      </Section>

      <Section heading="How long it takes">
        <p>Requests are completed within 30 days, and a confirmation is sent to the address that made the request.</p>
      </Section>
    </LegalShell>
  );
}
