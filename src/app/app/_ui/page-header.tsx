import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./page-header.module.css";

type Breadcrumb = {
  label: string;
  href?: string;
};

type Props = {
  breadcrumbs?: Breadcrumb[];
  eyebrow?: string;
  title?: string;
  description?: string;
  actions?: ReactNode;
};

export default function PageHeader({
  breadcrumbs,
  eyebrow,
  title,
  description,
  actions,
}: Props) {
  return (
    <div className={styles.header}>
      <div className={styles.content}>
        {breadcrumbs?.length ? (
          <div className={styles.breadcrumbs}>
            {breadcrumbs.map((crumb, index) => (
              <span key={`${crumb.label}-${index}`}>
                {index > 0 ? " / " : ""}
                {crumb.href ? <Link href={crumb.href}>{crumb.label}</Link> : crumb.label}
              </span>
            ))}
          </div>
        ) : null}
        {eyebrow ? <span className={styles.eyebrow}>{eyebrow}</span> : null}
        {title ? <h1 className={styles.title}>{title}</h1> : null}
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}
