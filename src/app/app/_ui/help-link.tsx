import Link from "next/link";
import styles from "./help-link.module.css";

type Props = {
  slug: string;
  label?: string;
};

export default function HelpLink({ slug, label }: Props) {
  const href = `/app/help/${slug}`;
  return (
    <Link href={href} className={styles.link} title={label ?? "Help"}>
      <span className={styles.icon} aria-hidden="true">ⓘ</span>
      {label ? <span>{label}</span> : null}
    </Link>
  );
}
