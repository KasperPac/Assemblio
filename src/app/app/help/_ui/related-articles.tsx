import Link from "next/link";
import { findArticle, type HelpArticle } from "../_registry";
import styles from "./related-articles.module.css";

type Props = { slugs: string[] };

export function RelatedArticles({ slugs }: Props) {
  const articles = slugs.map((s) => findArticle(s)).filter((a): a is HelpArticle => a !== undefined);
  if (!articles.length) return null;

  return (
    <div className={styles.related}>
      <p className={styles.heading}>Related articles</p>
      <ul className={styles.list}>
        {articles.map((article) => (
          <li key={article.slug}>
            <Link href={`/app/help/${article.slug}`} className={styles.link}>
              {article.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
