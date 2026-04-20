import styles from "./list-panel.module.css";

type ListPanelProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  columns?: string[];
  columnsTemplate?: string;
  children: React.ReactNode;
  className?: string;
};

type ListRowProps = {
  columnsTemplate: string;
  children: React.ReactNode;
  className?: string;
};

export default function ListPanel({
  eyebrow,
  title,
  description,
  action,
  columns,
  columnsTemplate,
  children,
  className = "",
}: ListPanelProps) {
  return (
    <section className={`${styles.panel} ${className}`.trim()}>
      <div className={styles.sectionHeader}>
        <div>
          {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
          <h2 className={styles.title}>{title}</h2>
          {description ? <p className={styles.description}>{description}</p> : null}
        </div>
        {action ? <div className={styles.headerAction}>{action}</div> : null}
      </div>
      {columns?.length && columnsTemplate ? (
        <div
          className={styles.tableHeader}
          style={{ gridTemplateColumns: columnsTemplate }}
        >
          {columns.map((column) => (
            <span key={column}>{column}</span>
          ))}
        </div>
      ) : null}
      <div className={styles.body}>{children}</div>
    </section>
  );
}

export function ListRow({ columnsTemplate, children, className = "" }: ListRowProps) {
  return (
    <div
      className={`${styles.row} ${className}`.trim()}
      style={{ gridTemplateColumns: columnsTemplate }}
    >
      {children}
    </div>
  );
}
