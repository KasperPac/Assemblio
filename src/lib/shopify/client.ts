type ShopifyGraphQLError = {
  message: string;
};

type ShopifyGraphQLResponse<T> = {
  data?: T;
  errors?: ShopifyGraphQLError[];
};

export async function shopifyGraphqlRequest<T>(
  shopDomain: string,
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>
) {
  const apiVersion = process.env.SHOPIFY_API_VERSION ?? "2026-01";
  const response = await fetch(
    `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query,
        variables: variables ?? {},
      }),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Shopify GraphQL request failed (${response.status}): ${text}`);
  }

  const json = (await response.json()) as ShopifyGraphQLResponse<T>;
  if (json.errors?.length) {
    throw new Error(`Shopify GraphQL error: ${json.errors[0]?.message ?? "Unknown"}`);
  }
  if (!json.data) {
    throw new Error("Shopify GraphQL returned no data.");
  }

  return json.data;
}

export async function registerRequiredWebhooks(shopDomain: string, accessToken: string) {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  const callbackUrl = `${appUrl}/api/shopify/webhooks`;

  const mutation = `
    mutation WebhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $callbackUrl: URL!) {
      webhookSubscriptionCreate(
        topic: $topic
        webhookSubscription: { callbackUrl: $callbackUrl, format: JSON }
      ) {
        userErrors { field message }
      }
    }
  `;

  const topics = [
    "APP_UNINSTALLED",
    "ORDERS_CREATE",
    "ORDERS_UPDATED",
    "ORDERS_CANCELLED",
    "ORDERS_FULFILLED",
    "PRODUCTS_CREATE",
    "PRODUCTS_UPDATE",
  ];

  for (const topic of topics) {
    const data = await shopifyGraphqlRequest<{
      webhookSubscriptionCreate: {
        userErrors: Array<{ message: string }>;
      };
    }>(shopDomain, accessToken, mutation, {
      topic,
      callbackUrl,
    });

    const error = data.webhookSubscriptionCreate.userErrors[0]?.message;
    if (error && !error.toLowerCase().includes("already been taken")) {
      throw new Error(`Webhook ${topic} registration failed: ${error}`);
    }
  }
}
