import type { Metadata } from "next";
import { COMPANY, LegalShell, Section } from "@/components/legal-shell";

export const metadata: Metadata = {
  title: "Terms of Use | Social Preneur",
  description: "Terms governing use of the Social Preneur application.",
};

export default function TermsPage() {
  return (
    <LegalShell
      title="Terms of Use"
      intro="These terms cover the use of the Social Preneur application at socialpreneur.in."
    >
      <Section heading="Who may use it">
        <p>
          Social Preneur is an internal application of {COMPANY}. Access is limited to the agency administrator. Accounts
          are not offered to the public and access may not be shared.
        </p>
      </Section>

      <Section heading="Acceptable use">
        <p>
          The application may be used only to manage social media accounts the agency is authorised to manage on behalf of
          its clients. Content published through it must follow the terms and community standards of each platform,
          including those of Meta, LinkedIn, X and Pinterest.
        </p>
      </Section>

      <Section heading="Platform connections">
        <p>
          Connecting an account grants this application permission to publish to that account and to read its performance
          data. Publishing depends on each platform&apos;s approval of this application, and on the connected account
          remaining valid. Where automatic publishing is unavailable, the application marks the post for manual posting
          rather than claiming it was published.
        </p>
      </Section>

      <Section heading="Content responsibility">
        <p>
          Drafts produced with artificial intelligence are suggestions. The administrator reviews and approves content
          before it is published, and remains responsible for what is posted to a client&apos;s accounts.
        </p>
      </Section>

      <Section heading="Availability">
        <p>
          The application is provided as is, without warranty. It runs on third-party hosting and depends on third-party
          social media APIs, and either may be interrupted.
        </p>
      </Section>
    </LegalShell>
  );
}
