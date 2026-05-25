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
  // Lazy import to avoid a cycle: client.ts <- auth.ts only depends on crypto.
  const { isAcceptableAppUrl } = await import("./auth");
  if (!isAcceptableAppUrl(appUrl)) {
    throw new Error(
      `Cannot register Shopify webhooks: NEXT_PUBLIC_APP_URL must be HTTPS (got: ${appUrl || "<empty>"}).`
    );
  }
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

  // Operational webhooks only. GDPR mandatory privacy webhooks
  // (customers/data_request, customers/redact, shop/redact) cannot be registered
  // via the webhookSubscriptionCreate GraphQL mutation — they must be declared
  // in shopify.app.toml under [webhooks.privacy_compliance] and are provisioned
  // by Shopify-managed install. See:
  // https://shopify.dev/docs/apps/build/privacy-law-compliance
  const topicEndpoints: Array<{ topic: string; callbackUrl: string }> = [
    { topic: "APP_UNINSTALLED", callbackUrl },
    { topic: "ORDERS_CREATE", callbackUrl },
    { topic: "ORDERS_UPDATED", callbackUrl },
    { topic: "ORDERS_CANCELLED", callbackUrl },
    { topic: "ORDERS_FULFILLED", callbackUrl },
    { topic: "PRODUCTS_CREATE", callbackUrl },
    { topic: "PRODUCTS_UPDATE", callbackUrl },
  ];

  for (const { topic, callbackUrl: url } of topicEndpoints) {
    const data = await shopifyGraphqlRequest<{
      webhookSubscriptionCreate: {
        userErrors: Array<{ message: string }>;
      };
    }>(shopDomain, accessToken, mutation, {
      topic,
      callbackUrl: url,
    });

    const error = data.webhookSubscriptionCreate.userErrors[0]?.message;
    if (error) {
      const errorLower = error.toLowerCase();
      if (errorLower.includes("already been taken")) {
        continue;
      }
      if (errorLower.includes("not approved") || errorLower.includes("protected customer data")) {
        console.warn(`[shopify] Webhook ${topic} requires approval: ${error}`);
        continue;
      }
      throw new Error(`Webhook ${topic} registration failed: ${error}`);
    }
  }
}
