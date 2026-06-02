// Server-only module — never import from client components.

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

let cachedToken: CachedToken | null = null;

async function getToken(): Promise<string> {
  // Reuse token until 60 s before expiry
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.accessToken;
  }

  const clientId = process.env.NEXAR_CLIENT_ID ?? "";
  const clientSecret = process.env.NEXAR_CLIENT_SECRET ?? "";

  const resp = await fetch("https://identity.nexar.com/connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!resp.ok) {
    throw new Error(`Nexar token request failed: HTTP ${resp.status}`);
  }

  const data = (await resp.json()) as {
    access_token: string;
    expires_in: number;
  };
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.accessToken;
}

const SUP_SEARCH_QUERY = `
  query SupSearch($q: String!) {
    supSearch(q: $q, limit: 1) {
      results {
        part {
          bestImage { url }
          manufacturer { name }
          mpn
        }
      }
    }
  }
`;

export type NexarImageResult =
  | { found: true; imageUrl: string; mpn: string; manufacturer: string }
  | { found: false; reason: "no_results" | "api_error"; message?: string };

export async function searchComponentImage(q: string): Promise<NexarImageResult> {
  try {
    const token = await getToken();

    const resp = await fetch("https://api.nexar.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query: SUP_SEARCH_QUERY, variables: { q } }),
    });

    if (!resp.ok) {
      return { found: false, reason: "api_error", message: `HTTP ${resp.status}` };
    }

    const body = (await resp.json()) as {
      data?: {
        supSearch?: {
          results?: Array<{
            part?: {
              bestImage?: { url: string };
              manufacturer?: { name: string };
              mpn?: string;
            };
          }>;
        };
      };
      errors?: Array<{ message: string }>;
    };

    if (body.errors?.length) {
      return { found: false, reason: "api_error", message: body.errors[0].message };
    }

    const part = body.data?.supSearch?.results?.[0]?.part;
    if (!part?.bestImage?.url) {
      return { found: false, reason: "no_results" };
    }

    return {
      found: true,
      imageUrl: part.bestImage.url,
      mpn: part.mpn ?? q,
      manufacturer: part.manufacturer?.name ?? "",
    };
  } catch (err) {
    return { found: false, reason: "api_error", message: String(err) };
  }
}
