import Link from "next/link";
import PageHeader from "../_ui/page-header";
import { HELP_ARTICLES, CATEGORY_META, MODULE_CATEGORIES, articlesByCategory } from "./_registry";
import styles from "./help.module.css";

const gettingStarted = HELP_ARTICLES.filter((a) => a.category === "getting-started");

export default function HelpPage() {
  return (
    <div className={styles.page}>
      <PageHeader
        title="Help & Guides"
        description="Guides, procedures, and reference for every module."
      />

      {/* Getting Started strip */}
      <div className={styles.gettingStarted}>
        <p className={styles.gsLabel}>🚀 Get started</p>
        <div className={styles.gsGrid}>
          {gettingStarted.map((article) => (
            <Link key={article.slug} href={`/app/help/${article.slug}`} className={styles.gsCard}>
              <span className={styles.gsCardTitle}>{article.title}</span>
              <span className={styles.gsCardDesc}>{article.description}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Module category jump links */}
      <div className={styles.categoryGrid}>
        {MODULE_CATEGORIES.map((cat) => {
          const meta = CATEGORY_META[cat];
          return (
            <a key={cat} href={`#${cat}`} className={styles.categoryCard}>
              <span className={styles.categoryIcon}>{meta.icon}</span>
              <span className={styles.categoryLabel}>{meta.label}</span>
            </a>
          );
        })}
      </div>

      {/* Article sections */}
      <div className={styles.sections}>
        {MODULE_CATEGORIES.map((cat) => {
          const meta = CATEGORY_META[cat];
          const articles = articlesByCategory(cat);
          return (
            <section key={cat} id={cat} className={styles.section}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionIcon}>{meta.icon}</span>
                <h2 className={styles.sectionTitle}>{meta.label}</h2>
              </div>
              <div className={styles.articleList}>
                {articles.map((article) => (
                  <Link key={article.slug} href={`/app/help/${article.slug}`} className={styles.articleLink}>
                    <span className={styles.articleTitle}>{article.title}</span>
                    <span className={styles.articleDesc}>{article.description}</span>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
