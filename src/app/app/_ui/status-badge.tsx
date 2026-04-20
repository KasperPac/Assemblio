import styles from "./status-badge.module.css";

type Variant = "default" | "success" | "warning" | "danger" | "info";

type Props = {
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
};

export default function StatusBadge({
  children,
  variant = "default",
  className = "",
}: Props) {
  return <span className={`${styles.badge} ${styles[variant]} ${className}`.trim()}>{children}</span>;
}
