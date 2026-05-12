import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InvitationEmail } from "./invitation";

describe("InvitationEmail", () => {
  it("renders the inviter name, tenant, role, and accept URL", () => {
    const html = renderToStaticMarkup(
      <InvitationEmail
        inviterName="Kasper Simonsen"
        tenantName="Acme Industries"
        role="member"
        acceptUrl="https://manuva.app/accept-invite/abc123"
        logoBaseUrl="https://manuva.app"
      />
    );
    expect(html).toContain("Kasper Simonsen");
    expect(html).toContain("Acme Industries");
    expect(html).toContain("member");
    expect(html).toContain("https://manuva.app/accept-invite/abc123");
  });

  it("renders the H1 with the tenant name", () => {
    const html = renderToStaticMarkup(
      <InvitationEmail
        inviterName="Jane"
        tenantName="Acme"
        role="admin"
        acceptUrl="https://manuva.app/accept-invite/x"
        logoBaseUrl="https://manuva.app"
      />
    );
    expect(html).toMatch(/You(?:'|&#x27;|&apos;)re invited to join Acme/);
  });

  it("renders the admin role when invited as admin", () => {
    const html = renderToStaticMarkup(
      <InvitationEmail
        inviterName="Jane"
        tenantName="Acme"
        role="admin"
        acceptUrl="https://manuva.app/accept-invite/x"
        logoBaseUrl="https://manuva.app"
      />
    );
    expect(html).toContain("as an admin");
  });

  it("renders the member role with the right article", () => {
    const html = renderToStaticMarkup(
      <InvitationEmail
        inviterName="Jane"
        tenantName="Acme"
        role="member"
        acceptUrl="https://manuva.app/accept-invite/x"
        logoBaseUrl="https://manuva.app"
      />
    );
    expect(html).toContain("as a member");
  });

  it("includes the 7-day expiry copy and plain link fallback", () => {
    const html = renderToStaticMarkup(
      <InvitationEmail
        inviterName="Jane"
        tenantName="Acme"
        role="member"
        acceptUrl="https://manuva.app/accept-invite/x"
        logoBaseUrl="https://manuva.app"
      />
    );
    expect(html).toContain("7 days");
    // plain link appears in the fallback block as well as the button
    expect(html.match(/https:\/\/manuva\.app\/accept-invite\/x/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
