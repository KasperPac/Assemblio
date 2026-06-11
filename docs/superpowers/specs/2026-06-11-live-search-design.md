# Live search (remove Enter-to-search) — Design

Date: 2026-06-11

## Problem

Search inputs on the Components and Products list pages are plain GET forms — the
user must press Enter to search. The Orders page already searches live with a
300ms debounce. Search behavior should be consistent and live on all pages.

## Design

### New shared component: `src/app/app/_ui/search-input.tsx`

Client component.

Props:

- `param: string` — URL query param name to write (e.g. `"q"`, `"search"`)
- `placeholder: string`
- `ariaLabel: string`
- `className?: string` — pages style it via their own CSS module

Behavior:

- Local state seeded from the current value of `param` in `useSearchParams`
- On change, debounce 300ms, then `router.replace(pathname + "?" + params)`
- Builds the query string from the current `useSearchParams`, so all other
  params (sort, dir, filter, status, dates…) are preserved automatically
- Sets the trimmed value; deletes the param when empty
- Deletes the `page` param on change so paginated lists reset to page 1
- Skips navigation when the input value already matches the URL (same guard as
  the existing Orders implementation)

### Components page (`src/app/app/components/page.tsx`)

Replace the `<form className={styles.search} method="get">` block (lines
159–169) with `<SearchInput param="q" …/>` wrapped in the same
`styles.search` styling. The hidden inputs for `filter`/`sort`/`dir` are
removed — param preservation makes them unnecessary.

### Products (`src/app/app/products/product-filters.tsx`)

Drop the `<form method="get">`. Use `SearchInput` for the text box. Convert the
variant-filter `<select>` to set its `filter` param directly via
`router.replace` on change (today it submits the form on change, so behavior is
unchanged apart from no longer requiring Enter for the text input).

### Orders (`src/app/app/orders/_components/orders-filters.tsx`)

Replace the inline debounced search input (state + `useEffect` + `setTimeout`)
with `<SearchInput param="search" …/>`. The status/source/historical selects
and date inputs keep their existing `setParam` handling.

## Out of scope

- No server-side changes — all three pages already read search from the URL
- No new search UIs on pages that lack one (Suppliers, Locations, Inventory,
  BOMs, Purchase Orders, Goods Inwards)

## Testing

- Manual: type in each search box and confirm results filter without Enter;
  confirm sort/filter/tab state is preserved while searching on Components;
  confirm Orders pagination resets to page 1 on a new search
- `npx tsc --noEmit` and lint against known baselines
