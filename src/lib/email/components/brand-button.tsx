import { Button } from "@react-email/components";
import { COLOR, FONT } from "./tokens";

export interface BrandButtonProps {
  href: string;
  children: React.ReactNode;
}

export function BrandButton({ href, children }: BrandButtonProps) {
  return (
    <Button
      href={href}
      style={{
        background: COLOR.brand,
        color: COLOR.inkOnBrand,
        borderRadius: 8,
        padding: "10px 18px",
        fontFamily: FONT.body,
        fontWeight: 600,
        fontSize: 15,
        textDecoration: "none",
        display: "inline-block",
      }}
    >
      {children}
    </Button>
  );
}
