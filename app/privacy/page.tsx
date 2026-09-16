import type { Metadata } from "next";
import { CONTACT_EMAIL, COMPANY, LegalShell, Section } from "@/components/legal-shell";

export const metadata: Metadata = {
  title: "Privacy Policy | Social Preneur",
  description: "How Social Preneur handles data from connected social media accounts.",
};

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      intro="Social Preneur is a private tool used by one administrator to plan and publish social media content for clients of the agency. It is not offered to the public."
    >
      <Section heading="Who runs this application">
        <p>
          Social Preneur is operated by {COMPANY} at socialpreneur.in. The only account holder is the agency
          administrator. There is no public signup and no third-party user access.
        </p>
      </Section>

      <Section heading="What the application stores">
        <ul>
          <li>Administrator account details: email address and a hashed password.</li>
          <li>Client business information entered by the administrator, such as description, services, audience and brand preferences.</li>
          <li>Access tokens issued by social media platforms when a page or profile is connected, stored encrypted.</li>
          <li>Content created in the application: post ideas, captions, creative briefs, images and schedules.</li>
          <li>Publishing records and performance figures returned by the platforms, such as impressions, reach and engagement.</li>
        </ul>
      </Section>

      <Section heading="What it is used for">
        <p>
          The stored data is used only to draft, schedule, publish and measure social media content for the agency&apos;s own
          clients. It is not sold, rented, or used for advertising, profiling or training public models.
        </p>
      </Section>

      <Section heading="Platform data">
        <p>
          When the administrator connects a Facebook Page, Instagram Business account, LinkedIn Page, X account, Threads
          profile or Pinterest account, the application requests only the permissions needed to publish posts and read the
          performance of those posts. Platform data is used for that purpose alone, and access can be revoked at any time
          from the platform&apos;s own settings or from within this application.
        </p>
      </Section>

      <Section heading="Service providers">
        <ul>
          <li>Hosting: Vercel.</li>
          <li>Database: Neon, a managed Postgres service.</li>
          <li>Artificial intelligence: Anthropic, used to draft content from the client information entered by the administrator.</li>
        </ul>
        <p>Each provider processes data only to deliver its service to this application.</p>
      </Section>

      <Section heading="Retention and security">
        <p>
          Data is kept while the client remains active in the application and is deleted on request. Access tokens are
          encrypted, passwords are stored only as a hash, and all traffic uses HTTPS.
        </p>
      </Section>

      <Section heading="Your choices">
        <p>
          A client of the agency may ask for their information to be removed at any time by writing to {CONTACT_EMAIL}. See
          the <a href="/data-deletion" style={{ color: "#0F6B57" }}>data deletion</a> page for how that request is handled.
        </p>
      </Section>
    </LegalShell>
  );
}
