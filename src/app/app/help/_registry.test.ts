import { describe, it, expect } from "vitest";
import { HELP_ARTICLES, findArticle, articlesByCategory, CATEGORY_META, MODULE_CATEGORIES } from "./_registry";

describe("HELP_ARTICLES", () => {
  it("has no duplicate slugs", () => {
    const slugs = HELP_ARTICLES.map((a) => a.slug);
    const unique = new Set(slugs);
    expect(unique.size).toBe(slugs.length);
  });

  it("every slug matches category/article-name pattern", () => {
    for (const article of HELP_ARTICLES) {
      expect(article.slug).toMatch(/^[a-z-]+\/[a-z-]+$/);
    }
  });

  it("every slug starts with its category", () => {
    for (const article of HELP_ARTICLES) {
      expect(article.slug.startsWith(article.category)).toBe(true);
    }
  });

  it("every article has non-empty title and description", () => {
    for (const article of HELP_ARTICLES) {
      expect(article.title.length).toBeGreaterThan(0);
      expect(article.description.length).toBeGreaterThan(0);
    }
  });

  it("all categories have metadata in CATEGORY_META", () => {
    for (const article of HELP_ARTICLES) {
      expect(CATEGORY_META[article.category]).toBeDefined();
    }
  });

  it("has 26 articles", () => {
    expect(HELP_ARTICLES).toHaveLength(26);
  });
});

describe("findArticle", () => {
  it("returns the article for a known slug", () => {
    const article = findArticle("inventory/adjustments");
    expect(article?.title).toBe("Recording an inventory adjustment");
  });

  it("returns undefined for an unknown slug", () => {
    expect(findArticle("does/not-exist")).toBeUndefined();
  });
});

describe("articlesByCategory", () => {
  it("returns only articles matching the category", () => {
    const articles = articlesByCategory("inventory");
    expect(articles.every((a) => a.category === "inventory")).toBe(true);
    expect(articles.length).toBe(3);
  });
});

describe("MODULE_CATEGORIES", () => {
  it("does not include getting-started", () => {
    expect(MODULE_CATEGORIES).not.toContain("getting-started");
  });

  it("has 7 entries", () => {
    expect(MODULE_CATEGORIES).toHaveLength(7);
  });
});
