import Link from "next/link";
import type { ReactNode } from "react";
import type { AppBandDomain } from "../route-meta";
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
  band?: boolean;
  domain?: AppBandDomain;
  stat?: { label: string; value: string | number; unit?: string; delta?: string };
  cover?: boolean;
};

export default function PageHeader({
  breadcrumbs,
  eyebrow,
  title,
  description,
  actions,
  band = false,
  domain,
  stat,
  cover = false,
}: Props) {
  if (band) {
    return (
      <div className={`${styles.header} ${styles.band} ${cover ? styles.cover : ""}`} data-band="" data-domain={domain}>
        {cover && stat ? <span className={styles.watermark} aria-hidden="true">{stat.value}</span> : null}
        <div className={styles.content}>
          {eyebrow ? <span className={styles.eyebrow}>{eyebrow}</span> : null}
          {title ? <h1 className={styles.title}>{title}</h1> : null}
          {description ? <p className={styles.description}>{description}</p> : null}
        </div>
        {stat || actions ? (
          <div className={styles.side}>
            {stat ? (
              <div className={styles.stat}>
                <span className={styles.statLabel}>{stat.label}</span>
                <span className={styles.statReading}>
                  <span className={styles.statValue}>{stat.value}</span>
                  {stat.unit ? <span className={styles.statUnit}>{stat.unit}</span> : null}
                </span>
                {stat.delta ? <span className={styles.statDelta}>{stat.delta}</span> : null}
              </div>
            ) : null}
            {actions ? <div className={styles.actions}>{actions}</div> : null}
          </div>
        ) : null}
      </div>
    );
  }
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
