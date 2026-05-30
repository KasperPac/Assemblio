import type { ReactNode } from "react";
import PageHeader from "../../_ui/page-header";
import { RelatedArticles } from "./related-articles";
import { CATEGORY_META, type HelpCategory } from "../_registry";
import styles from "./article-layout.module.css";

type Props = {
  title: string;
  description: string;
  category: HelpCategory;
  relatedSlugs?: string[];
  children: ReactNode;
};

export default function ArticleLayout({ title, description, category, relatedSlugs, children }: Props) {
  const cat = CATEGORY_META[category];
  return (
    <div className={styles.page}>
      <PageHeader
        breadcrumbs={[
          { label: "Help", href: "/app/help" },
          { label: cat.label },
          { label: title },
        ]}
        title={title}
        description={description}
      />
      <div className={styles.body}>{children}</div>
      {relatedSlugs?.length ? <RelatedArticles slugs={relatedSlugs} /> : null}
    </div>
  );
}
