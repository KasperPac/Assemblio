# Icon + Feature Image Brief

Required assets for the Partner Dashboard.

## App Icon

- **Dimensions:** 1200 × 1200 px (square)
- **Format:** PNG with transparent background OR solid Manuva brand colour
- **Safe area:** Keep the mark inside an 800px central circle (Shopify often renders icons as circles in their UI)
- **Source:** Start from `public/Manuva_svg.svg` (the full vector mark). Scale, recolour, and rasterize at 1200×1200.

### Design direction

- Use the existing Manuva mark from `public/Manuva_svg.svg` as-is, scaled into the 1200×1200 canvas
- Background: either transparent or `--brand-1` colour from the Manuva design system (`#6366F1` light / `#818CF8` dark). If transparent, ensure the mark works on both light and dark Shopify Admin themes
- No text in the icon (Shopify renders the app name separately)

### Save to

`docs/shopify-app-listing/assets/icon-1200.png`

---

## Feature Image (App Store Banner)

- **Dimensions:** 1600 × 900 px (16:9)
- **Format:** PNG or JPG
- **Used for:** Top of the App Store listing page

### Design direction

Recommended composition:

- Left third: Manuva mark + "Manufacturing operations for Shopify brands" tagline
- Right two-thirds: Screenshot collage showing the BOM Builder + a production order card (use real-looking demo data, not Lorem Ipsum)
- Background: Manuva brand gradient or solid `--bg-page` colour
- Keep all critical content inside a 1400×800 safe area (some platforms crop the edges)

### Save to

`docs/shopify-app-listing/assets/feature-1600x900.png`

---

## Brand reference

- Source vectors: `public/Manuva_svg.svg`, `public/manuva.svg`, `public/manuva-logo.png`
- Tokens: `C:\dev\manuva-tokens\Manuva Design System\colors_and_type.css`
- Brand colours used:
  - Primary brand: `--brand-1` — `#6366F1` (light) / `#818CF8` (dark)
  - Page bg: `--bg-page` — `#F8F7F5` (light) / `#0D1117` (dark)
  - Card bg: `--bg-card` — `#FFFFFF` (light) / `#161D2D` (dark)

Use the **light theme** colours for the App Store assets (most users browse the App Store in light mode).
