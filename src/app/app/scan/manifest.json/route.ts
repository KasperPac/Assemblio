import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    name: "Manuva Scanner",
    short_name: "Scanner",
    start_url: "/app/scan",
    display: "standalone",
    background_color: "#111827",
    theme_color: "#1e40af",
    icons: [
      { src: "/manuva.svg", sizes: "any", type: "image/svg+xml" },
    ],
  });
}
