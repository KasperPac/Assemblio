# Reports: professional tool direction

Requested by the user on 2026-10-13, MANUVA-117. These are product UI previews,
with the same explicitly labelled Pac-Technologies fixtures. No live writes or
production styling changes were made for this comparison.

| Direction | Accent treatment |
| --- | --- |
| A — restrained | Small uppercase section labels, fine domain rules, coloured links, narrow card accents. |
| B — expressive | Tinted section-heading areas and cards, larger Archivo labels/numerals, stronger accent rules. |
| C — professional tool | Neutral topbar and page heading, 28px Inter title, quiet section rules/cards, one consistent link accent and a small selected-navigation marker. |

After comparing A and B, the user chose constrained styling and explained that
bold marketing colours feel less appropriate for a professional working tool.
C follows that direction; warning and healthy states retain their semantic colours.

![Professional Reports preview](professional.jpg)

![Restrained Reports preview](restrained.jpg)

![Expressive Reports preview](expressive.jpg)

Both close the Reports cover's 32px gap beneath the topbar and remove the 1200px
page cap. The defect was reproduced in the existing signed-in Pac-Technologies
tab: cover 1168px wide versus topbar 1678px, caused by `.page`'s extra
`padding: 32px 40px`. Earlier shared-header verification missed the actual wrapper.

Preview links (while the local server runs):

- [C — professional tool](http://127.0.0.1:3218/?variant=professional)
- [A — restrained](http://127.0.0.1:3218/?variant=restrained)
- [B — expressive](http://127.0.0.1:3218/?variant=expressive)

Run `node scripts/preview-reports-accents.mjs` to rebuild the comparison from
the actual Reports JSX, wrapper, shared header, shell and CSS. Requires installed
dependencies and a local Next build for its existing Archivo/Inter font assets.
The generator replaces only server data/navigation/action boundaries with fixture
inputs; business actions are not wired. `?theme=midnight`, `ocean` or `ember` previews
the dark themes without changing user preferences.

Verified: both variants have zero band gap, equal band widths and no horizontal
overflow across four themes. Normal report-link contrast is at least 5.79:1 for A
and 5.43:1 for B; existing semantic warning/success states retain their roles.
The proposed shared index accents use the published `--accent-text`/`--accent-dim`
tokens, including their dark-theme shades. Quiet record headers retain their styling.

C was also inspected in Chrome across all four themes: no coloured content band,
28px title, no horizontal overflow; normal report-link contrast is at least 5.79:1.
These contrast measurements concern normal links, not every pre-existing status label.

Preferred direction: C, based on the user's latest feedback. The comparison and
initial A source changes are local drafts, not the completed professional rollout.
C overrides live only in the preview generator; apply its direction to shared
components and update the affected page map before publishing a new release.
Original deployed release remains `41321f8c`.
