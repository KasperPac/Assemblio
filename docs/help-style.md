# Help manual style guide

The rules for every manual in `src/content/help/`. A manual is read by a customer in the middle of
a job, or by someone deciding whether Manuva fits them. It must be true, findable and short.

## Voice

- Plain, second person, short sentences: "Click **Post invoice**." not "The user should click…".
- Australian English in prose (organisation, colour, labour). **UI text is quoted exactly as the app
  spells it**, even where that differs (a button that says "Labor" stays **Labor**).
- No marketing language. Say what happens, not how great it is.

## What goes in

- **Only what the code does.** Every statement can be traced to a route, component, server action
  or database function. A detail the code does not settle is left out.
- **No invented numbers.** Timings, limits, retry schedules, decimal places: only when the code sets
  them, and exactly as it sets them.
- **Exact UI text.** Button labels, field labels, tab names, statuses and error messages are copied
  from the source, in bold for controls (**Save draft**) and in quotes for messages
  ("Xero is locked up to …"). A message that includes a value gets `…` or a `[name]` placeholder.
- **Role and plan markers.** *(admin)*, *(super_admin)*, *(plan-gated)*, after the step or row they
  apply to.

## Shape

Every manual uses these `##` sections, in this order. A section with nothing true to say is left
out, never padded.

1. **Lead paragraph** (no heading): what the module is for and who uses it. Two or three sentences.
2. `## How it fits together`: one `<Diagram>` and a sentence that reads it.
3. **Task sections**, one per job a person does, named for the job in sentence case:
   `## Entering a supplier invoice`. A short intro sentence, then a numbered list of steps.
4. `## Statuses explained`: a table of every status label the module shows, what it means, and what
   moves it on.
5. `## Fixing problems`: a table of the exact messages the app shows, and what to do about each.
6. `## Who can do what`: a table with a row per action and a column per role.
7. `## Common questions`: a bulleted list, each item a bold question then a short answer.

Headings are plain text (no code, bold, links or brackets) and unique within the manual, because
each one becomes a link anchor.

## Markdown and components

- Steps: a Markdown ordered list (`1.`). Sub-points: an indented `-` list.
- Tables: GFM Markdown tables with a header row.
- No `import`/`export` lines and no `#` heading. The page supplies the title.
- Three components are available:
  - `<Callout type="tip|info|warning">…</Callout>`: one idea, used sparingly.
  - `<Diagram name="<manual slug>" caption="…" />`: the manual's drawing (see Diagrams).
  - `<Screenshot src="/help/<manual slug>/<name>.png" alt="…" caption="…" />`: name the screen it
    will show. The image arrives with the capture script; until then nothing renders in production.
    `alt` says what the screen shows ("The supplier invoice form with two receipt lines").
- Link to another manual with a normal Markdown link: `[Suppliers](/help/suppliers#adding-a-supplier)`.

## Diagrams

One drawing per manual, in `src/components/help/diagrams/<slug>.tsx`, default-exported and
registered in `src/components/help/diagrams/index.ts` under the manual's slug.

- An `<svg viewBox="0 0 760 H" role="img" aria-label="…">`, where H is the drawing's height plus
  about 24. The `aria-label` is the drawing's title.
- The first text is the title: the finding a reader should leave with, not the topic.
- Colours come only from tokens:
  - boxes: `var(--bg-card)` fill, `var(--ink-faint)` stroke;
  - text: `var(--ink-strong)`, quiet text `var(--ink-muted)`;
  - one accent box: `var(--brand-dim)` fill, `var(--brand-1)` stroke at width 2;
  - a band: `var(--surface-1)`.
- Text 15 (title) / 13 (names, weight 600) / 11.5 (body). Corners `rx={8}`. Arrowheads are one
  `<marker>` per drawing, with an id prefixed `m-<slug>-`.
- Boxes carry a name and at most two short lines. A role column at the left says who does each step,
  where that matters.

## Drafting a manual from the code

1. Read this guide, the manual's brief in the plan, and the old articles it replaces
   (`src/app/app/help/...`, until the cutover removes them). Treat the old articles as leads to
   check, not as truth.
2. Read the module's routes, client components and server actions. Collect every UI string you will
   quote, with its `file:line`.
3. Walk each task the way a user would: the page they start on, what they click, what changes.
   Note the role checks (`role === "admin"`, read-only observer guards) and plan gates
   (`has_planning_module`).
4. Write the diagram, then the MDX, in the shape above.
5. Run the help tests (`npm test -- src/content/help src/components/help src/lib/help`).
6. In your report, list:
   - every quoted UI string with its source `file:line`;
   - anything the brief asked for that the code does not do;
   - anything in the code that looks broken or inconsistent while you read it. Bugs are not fixed
     in a manual task; they are reported.
