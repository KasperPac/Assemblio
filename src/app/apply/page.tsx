import { Suspense } from "react";
import type { Metadata } from "next";
import ApplyForm from "./apply-form";
import styles from "./apply.module.css";

export const metadata: Metadata = {
  title: "Apply for early access — Manuva",
  description:
    "Manuva is currently in private beta. Apply for early access and we'll reach out when there's a spot.",
};

export default function ApplyPage() {
  return (
    <Suspense fallback={<div className={styles.page} />}>
      <ApplyForm />
    </Suspense>
  );
}
