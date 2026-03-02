"use client";

import { useRouter } from "next/navigation";
import styles from "./product-detail.module.css";

type Option = {
  id: string;
  label: string;
};

type Props = {
  productId: string;
  value: string;
  options: Option[];
};

export default function ProductVariantPicker({ productId, value, options }: Props) {
  const router = useRouter();

  return (
    <select
      className={styles.variantSelect}
      value={value}
      onChange={(event) =>
        router.push(`/app/products/${productId}?variant_id=${event.target.value}`)
      }
    >
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
