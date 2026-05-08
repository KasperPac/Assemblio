import styles from "./report-stat-cards.module.css";

export type CardVariant = "default" | "amber" | "red" | "green";

export interface StatCard {
  label: string;
  value: string | number;
  sub?: string;
  variant?: CardVariant;
}

interface Props {
  cards: StatCard[];
}

export function ReportStatCards({ cards }: Props) {
  return (
    <div className={styles.grid}>
      {cards.map((c, i) => {
        const v = c.variant ?? "default";
        const cardCls = [
          styles.card,
          v === "amber" ? styles.cardAmber : "",
          v === "red" ? styles.cardRed : "",
          v === "green" ? styles.cardGreen : "",
        ]
          .filter(Boolean)
          .join(" ");
        const labelCls = [
          styles.label,
          v === "amber" ? styles.labelAmber : "",
          v === "red" ? styles.labelRed : "",
          v === "green" ? styles.labelGreen : "",
        ]
          .filter(Boolean)
          .join(" ");
        const valueCls = [
          styles.value,
          v === "amber" ? styles.valueAmber : "",
          v === "red" ? styles.valueRed : "",
          v === "green" ? styles.valueGreen : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <div key={c.label} className={cardCls}>
            <div className={labelCls}>{c.label}</div>
            <div className={valueCls}>{c.value}</div>
            {c.sub && <div className={styles.sub}>{c.sub}</div>}
          </div>
        );
      })}
    </div>
  );
}
