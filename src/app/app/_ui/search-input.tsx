"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type Props = {
  /** URL query param to read/write, e.g. "q" or "search". */
  param: string;
  placeholder: string;
  ariaLabel: string;
  className?: string;
};

export default function SearchInput({ param, placeholder, ariaLabel, className }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [value, setValue] = useState(sp.get(param) ?? "");

  // Debounce the search box -> URL.
  useEffect(() => {
    const current = sp.get(param) ?? "";
    const trimmed = value.trim();
    if (trimmed === current) return;
    const t = setTimeout(() => {
      const params = new URLSearchParams(sp.toString());
      if (trimmed) params.set(param, trimmed);
      else params.delete(param);
      params.delete("page");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      className={className}
      type="search"
      placeholder={placeholder}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  );
}
