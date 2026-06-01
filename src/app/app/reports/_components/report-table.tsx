import styles from "./report-table.module.css";

export type BadgeVariant = "green" | "blue" | "amber" | "red" | "gray";

export interface TableColumn<T> {
  key: string;
  header: string;
  align?: "left" | "right";
  render: (row: T) => React.ReactNode;
}

interface Props<T> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage?: string;
}

export function ReportTable<T>({
  columns,
  rows,
  rowKey,
  emptyMessage = "No data for this period.",
}: Props<T>) {
  if (rows.length === 0) {
    return (
      <div className={styles.wrapper}>
        <p className={styles.empty}>{emptyMessage}</p>
      </div>
    );
  }
  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.align === "right" ? styles.right : ""}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => (
                <td key={c.key} className={c.align === "right" ? styles.right : ""}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Badge({
  children,
  variant,
}: {
  children: React.ReactNode;
  variant: BadgeVariant;
}) {
  const cls = {
    green: styles.badgeGreen,
    blue: styles.badgeBlue,
    amber: styles.badgeAmber,
    red: styles.badgeRed,
    gray: styles.badgeGray,
  }[variant];
  return <span className={`${styles.badge} ${cls}`}>{children}</span>;
}
