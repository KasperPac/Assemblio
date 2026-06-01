import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "b", "i", "em", "strong", "a", "p", "br",
  "ul", "ol", "li", "h2", "h3", "h4", "span",
];

const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions["allowedAttributes"] = {
  a: ["href", "target", "rel"],
  "*": ["class"],
};

/**
 * Strips all HTML except the product-safe whitelist.
 * Security-sensitive: do not weaken allowed tags/attributes without review.
 */
export function sanitizeProductHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }, false),
    },
  });
}
