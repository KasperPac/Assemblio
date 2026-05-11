const XERO_CLIENT_ID = process.env.XERO_CLIENT_ID!;
const XERO_CLIENT_SECRET = process.env.XERO_CLIENT_SECRET!;
const XERO_REDIRECT_URI = process.env.XERO_REDIRECT_URI!;

const AUTH_URL = "https://login.xero.com/identity/connect/authorize";
const TOKEN_URL = "https://identity.xero.com/connect/token";
const CONNECTIONS_URL = "https://api.xero.com/connections";
const INVOICES_URL = "https://api.xero.com/api.xro/2.0/Invoices";

export type XeroTokenSet = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

export type XeroOrg = {
  tenantId: string;
  tenantName: string;
};

export type XeroBillLine = {
  description: string;
  quantity: number;
  unitAmount: number;
  accountCode: string;
};

export type XeroBillInput = {
  contactName: string;
  date: string;
  dueDate: string;
  reference?: string;
  lines: XeroBillLine[];
};

function xeroBasicAuth(): string {
  return Buffer.from(`${XERO_CLIENT_ID}:${XERO_CLIENT_SECRET}`).toString("base64");
}

export function buildXeroAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: XERO_CLIENT_ID,
    redirect_uri: XERO_REDIRECT_URI,
    scope: "accounting.transactions offline_access",
    state,
  });
  return `${AUTH_URL}?${params}`;
}

export async function exchangeXeroCode(code: string): Promise<XeroTokenSet> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${xeroBasicAuth()}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: XERO_REDIRECT_URI,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Xero token exchange failed (${res.status}): ${body}`);
  }
  return res.json() as Promise<XeroTokenSet>;
}

export async function refreshXeroToken(refreshToken: string): Promise<XeroTokenSet> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${xeroBasicAuth()}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Xero token refresh failed (${res.status}): ${body}`);
  }
  return res.json() as Promise<XeroTokenSet>;
}

export async function getXeroOrgs(accessToken: string): Promise<XeroOrg[]> {
  const res = await fetch(CONNECTIONS_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to fetch Xero orgs (${res.status}): ${body}`);
  }
  const data = (await res.json()) as Array<{ tenantId: string; tenantName: string }>;
  return data.map((d) => ({ tenantId: d.tenantId, tenantName: d.tenantName }));
}

export async function createXeroBill(
  accessToken: string,
  xeroTenantId: string,
  bill: XeroBillInput
): Promise<string> {
  const body = {
    Invoices: [
      {
        Type: "ACCPAY",
        Contact: { Name: bill.contactName },
        Date: bill.date,
        DueDate: bill.dueDate,
        Reference: bill.reference ?? "",
        LineItems: bill.lines.map((l) => ({
          Description: l.description,
          Quantity: l.quantity,
          UnitAmount: l.unitAmount,
          AccountCode: l.accountCode,
        })),
      },
    ],
  };
  const res = await fetch(INVOICES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "Xero-tenant-id": xeroTenantId,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Xero bill creation failed (${res.status}): ${err}`);
  }
  const data = (await res.json()) as { Invoices: Array<{ InvoiceID: string }> };
  return data.Invoices[0].InvoiceID;
}
