# Manuva — 90-Day Go-To-Market Plan

> Owner: Kasper (solo founder). Plan window: 2026-05-13 → 2026-08-11 (Weeks 1–12).
> Source inputs: `docs/marketing/manuva-brief.md`, `docs/research/manuva-gtm/outline.yaml`, `docs/research/manuva-gtm/report.md`, `docs/research/manuva-gtm/results/{01,04,16,17,19,26,27,28,30}.json`.

---

## 1. Executive summary

**GTM thesis (one sentence):** Land 5 Charter Partners across indie cosmetics, candle/soap, and Craftybase/Katana defectors while shipping Xero + a migration CSV wizard, so that by Day 90 a paid-pilot funnel and a 10-accountant referral bench are warm and producing AU$1.5–2.5K MRR with a clear path to AU$3–5K by month 12.

**Day-90 target outcomes:**
- **6 paying / piloting customers** (5 Charter Partners on free pilots + 1–3 paid pilots converting).
- **AU$1,500–2,500 MRR** (Charter discount drags blended ARPU to ~AU$150; paid pilots at AU$249).
- **5 signed Charter Partners** (2 indie cosmetics, 2 candle/soap, 1 Craftybase/Katana defector).
- **10 specialist Xero advisors** warm (intro call done, free practitioner account issued).
- **Xero integration shipped to production**; Craftybase + Katana CSV import wizard live.

**Single segment to NOT touch in 90 days:** **Supplements / nutraceuticals (item 10) and contract food co-packers (item 15).** Rationale: solo-founder credibility bar is too high in regulated/trust-based segments — deflect inbound to a waitlist and revisit in Phase 2 once 2 reference logos and lot/COA workflows are battle-tested.

---

## 2. Founder time budget

**Total available: 40 hours/week.** Cap at 45; anything beyond is a process bug, not heroism.

| Category | Hours/wk | What it is |
|---|---|---|
| **Build (product)** | 16 | Xero connector, migration wizard, calculator, paid-pilot Stripe plumbing |
| **Sell (outbound + demos)** | 12 | DMs, demos, Charter recruitment, Xero advisor calls |
| **Support (Charter Partners + early pilots)** | 6 | Bi-weekly 30-min Charter calls (5 × 0.5hr/fortnight = ~2.5hr/wk steady state), Slack triage |
| **Content + admin** | 6 | One pillar post / fortnight, weekly metrics review, Stripe/PandaDoc, email |

**Hard rules (enforce mechanically — calendar blocks + auto-replies):**
1. **No 1:1 demos for spreadsheet-stage trialists below AU$200K revenue.** Send Loom + Notion onboarding doc. Demo gate: Shopify revenue ≥ AU$20K/mo OR currently paying Craftybase Business / Katana / Cin7 / Unleashed.
2. **Deflect supplements / nutraceuticals / regulated-food inbound to a public waitlist** (`/waitlist/regulated`). Auto-reply: "Lot tracking + COA workflows are live; we're hardening them with 2 design partners before opening this vertical. Joining the list reserves a Charter slot in Q4."
3. **No free 30-day trials.** Two offers only: (a) **Charter Partner** (free 6mo + 50% off 24mo, by invitation, max 5 slots) or (b) **Paid Pilot** (AU$249/mo × 3 months, 100% credited on conversion, 4hr founder onboarding included).
4. **Demos capped at 30 min, Tue/Wed/Thu 10am–3pm AEST.** Block Mon (build) and Fri (content + admin) on the calendar; auto-reject Calendly outside the window.
5. **No WooCommerce, Amazon, or non-Shopify discovery calls.** Hard "not yet" with date estimate (Q4 2026); add to waitlist.
6. **Every Charter / pilot conversation gets a written success-criteria doc within 24 hours** (Notion template). No exceptions — this is what makes pilots convert.

---

## 3. Week-by-week plan (Weeks 1–12)

### Phase A — Weeks 1–4: Recruit Charter Partners, ship Xero, build migration assets

#### Week 1 (May 13–19)
1. **Publish Charter Partner Program landing page** at `manuva.app/charter`. Use Common Paper Design Partner Agreement template (commonpaper.com) as the contract base. Terms: free Pro 6mo + 50% off 24mo + bi-weekly 30-min call + one written case study + one reference call/quarter. 5 slots, named publicly. **Deliverable: live URL + PDF agreement.**
2. **Write and send 30 personalised Charter invites** in this exact split:
   - 12 indie cosmetics/skincare AU founders sourced via StoreLeads (Shopify + skincare + AU + revenue band proxy). Cross-check against Skincare Business Foundations alumni listings.
   - 12 AU candle/soap makers from the "Australian candle makers" + "Australian Soapmakers" Facebook groups (DM via Instagram where possible — higher response).
   - 6 G2/Capterra Katana negative reviewers in AU/NZ posted in last 12 months (LinkedIn DM, reference their specific review).
   **Deliverable: 30 outbound messages logged in a CRM (Pipedrive free or Notion).**
3. **Draft Xero OAuth integration spec.** Decide scope: COGS journal + inventory valuation push from Manuva → Xero (do NOT attempt bank-rec or P&L pull in v1). **Deliverable: 1-page spec + Linear epic.**
4. **Email Jennifer Rudd (Skincare Business Foundations, Brisbane)** with a partnership pitch: co-promotion to her Label Launchpad / Beauty Brand Bootcamp Circle community in exchange for affiliate (AU$50/closed customer first year) + free Manuva Growth for her practice. **Deliverable: email sent; follow-up scheduled D+5.**
5. **Set up weekly metrics dashboard** (Notion or Plausible + a Google Sheet): Charter applications, demos booked, pilots started, MRR, founder hours per customer, gross margin per customer. **Deliverable: dashboard live, baseline = 0.**

#### Week 2 (May 20–26)
1. **Run 8–12 Charter discovery calls** from Week-1 outreach. Target conversion: 30 invites → 12 calls → 5 signed Charter Partners by Week 4. **Deliverable: 8+ calls completed; notes in CRM.**
2. **Ship Xero OAuth + connection screen** (Manuva side). No data sync yet — connection establishment only. **Deliverable: PR merged, staging demo recordable.**
3. **Post in "Australian candle makers" FB group**: a value-first post on "How to track wax + fragrance lots when retailers ask for COA — a free template" (link to a downloadable PDF on the Manuva site, email-gated). DO NOT pitch. **Deliverable: post live; download form live; track signups.**
4. **Reach out to 5 Xero specialist advisors** found via Xero Advisor Directory (filter: AU + "inventory" or "manufacturing" or "ecommerce" specialism). Named targets to seek: practices known in the ecommerce-bookkeeper niche — search Heather Smith's "Anise Consulting" referrals, ICB Australia member directory ecommerce specialists, Bookkeepers Hub Australia FB group active voices. **Deliverable: 5 LinkedIn DMs + emails sent.**
5. **Write pillar post draft #1**: "Outgrowing Craftybase: a guide for AU candle and soap makers." Target keywords: 'Craftybase alternative', 'Craftybase Indie ceiling', 'Craftybase outgrowing'. **Deliverable: 1,800-word draft for review.**

#### Week 3 (May 27 – Jun 2)
1. **Sign 3 Charter Partners** (target: 2 cosmetics, 1 candle/soap). Send Common Paper agreement, kickoff Notion doc with success criteria, schedule first bi-weekly call. **Deliverable: 3 signed agreements; Stripe set to AU$0 with auto-flip to AU$125 at month 7.**
2. **Ship Xero COGS journal sync (one-way, Manuva → Xero).** Test against a sandbox Xero org. **Deliverable: working sync in staging.**
3. **Publish pillar post #1** ("Outgrowing Craftybase") on `manuva.app/blog`. Submit to r/soapmaking, r/candlemaking, r/Etsy (one comment in an existing thread, not a self-post — read mod rules first). **Deliverable: post live; 3 community placements logged.**
4. **Build Craftybase CSV import wizard v1** — material catalog + supplier list + product list mappers. (BOMs in v2.) **Deliverable: backend importer + UI in staging.**
5. **Confirm Jennifer Rudd partnership terms** (follow-up from Week 1). If declined or unresponsive, pivot to Beauty Industry Group AU LinkedIn newsletter sponsorship enquiry (~AU$1–3K range — defer commit to Week 8). **Deliverable: yes/no decision logged.**

#### Week 4 (May 27 – Jun 9)
1. **Sign Charter Partners 4 and 5.** Target mix: 1 candle/soap + 1 Craftybase or Katana defector (cross-vertical). **Deliverable: 5/5 Charter Partners signed.**
2. **Ship Xero integration to production** behind a feature flag; turn on for Charter Partners only. **Deliverable: prod release; one Charter Partner connected successfully.**
3. **Build Katana CSV import wizard v1** (products + BOMs + suppliers from Katana's standard export). **Deliverable: import works end-to-end with a sample Katana export file in staging.**
4. **Publish pillar post #2**: "Katana real-cost calculator: Core + traceability + manufacturing + warehouse add-ons vs Manuva flat." Embed a working calculator. Target keywords: 'Katana MRP alternative', 'Katana add-on cost', 'Katana 523% price hike'. Use the figures from research item 16 (Brahmin Solutions analysis: US$747–1,095/mo all-in). **Deliverable: post + calculator live.**
5. **Schedule 5 introductory Zoom calls with Xero specialist advisors** from Week 2 outreach. **Deliverable: 5 calls on the calendar for Weeks 5–6.**

---

### Phase B — Weeks 5–8: Convert Charter feedback into product, open inbound funnel, court Xero advisors

#### Week 5 (Jun 10–16)
1. **Run first bi-weekly cadence calls with all 5 Charter Partners.** Capture top 3 product asks per partner; consolidate. **Deliverable: feedback log; top 5 cross-partner asks prioritised in Linear.**
2. **Run 5 Xero advisor intro calls** (from Week 4 scheduling). Pitch: 20% rev-share for 24 months on referred clients + free Manuva Pro for the practice + quarterly insider Zoom. **Deliverable: 5 calls done; 2–3 advisors agree to a follow-up "first client review" call.**
3. **Ship Craftybase CSV import wizard v2** — adds BOMs + recipes. Onboard 1 Charter Partner via the wizard as a dogfood test. **Deliverable: imported live data for 1 Charter Partner.**
4. **Publish pillar post #3**: "Recall-readiness in 7 days: how Shopify candle, soap, and cosmetic makers can pass an ACCC recall drill." Anchor of the recall-readiness content hub. Include downloadable mock-recall checklist (email-gated). **Deliverable: post + checklist live.**
5. **Launch the paid-pilot offer page** at `manuva.app/pilot`. Offer: AU$249/mo × 3 months, 100% credit on annual conversion, 4hr founder onboarding included, written success criteria. Stripe + PandaDoc plumbing for credit-on-conversion. **Deliverable: page + payment + contract automation live.**

#### Week 6 (Jun 17–23)
1. **Start 30 cold DMs/week cadence to AU candle makers** (Instagram preferred, second touch on LinkedIn) using a 3-message sequence: (1) reference their product, (2) "saw you might be hitting the Craftybase 1,000-order ceiling — built a calculator", (3) offer 15-min Loom-only audit (no demo). Cap at 30/week for 4 weeks. **Deliverable: 30 messages sent; replies logged.**
2. **Continue Xero advisor outreach** — send 10 new DMs to specialist Xero ecommerce/manufacturing bookkeepers. Sources: Xero Advisor Directory + Bookkeepers Hub Australia FB + ICB Australia directory. Named voices to follow and engage with first (comment on their content for 1 week before DM): Heather Smith (Anise Consulting, AU Xero/MYOB voice), Clayton Oates (QA Business — Xero specialist), Diane Lucas (Direct Management). **Deliverable: 10 DMs sent.**
3. **First Manuva-on-Xero case study draft** — interview Charter Partner #1 (the one onboarded in Week 5). 400-word version + LinkedIn carousel. **Deliverable: draft case study + 1 carousel.**
4. **Publish pillar post #4**: "Recall-readiness, part 2 — what your Shopify order data needs to look like when a retailer asks for traceback in 24 hours." Include a downloadable lot-trace SQL/CSV template. **Deliverable: post + template live.**
5. **Submit Manuva to Shopify App Store** (Manufacturing & Inventory category). Charter Partners satisfy the "needs real installs" requirement. **Deliverable: submission acknowledged.**

#### Week 7 (Jun 24–30)
1. **Run paid-pilot demos for inbound leads** from Week 5–6 content. Target: 4 demos this week. Conversion goal: 2 paid pilots started. **Deliverable: 4 demos done; ≥1 pilot started.**
2. **Ship the cost-comparison calculator (v2)** covering Manuva vs Katana real-cost (already live from Week 4), **plus** Unleashed AUD-equivalent (NZ$349–499 + FX + GST) vs Manuva flat, **plus** Craftybase Business+Premium vs Manuva Growth. Embed on `/compare`. **Deliverable: 3-tool calculator live.**
3. **Hold a 30-min webinar** ("Outgrowing Craftybase or Katana? A 30-min migration walkthrough") promoted in the two AU candle/soap FB groups and to the email list built from Week 5–6 lead magnets. **Deliverable: ≥15 registrants; recording posted publicly.**
4. **Begin Xero App Store listing application** (Xero requires 3 active integration customers — Charter Partners #1, #2, #3 satisfy this). **Deliverable: listing submitted.**
5. **Run third Charter cadence call** for each partner. Surface one cross-partner blocker per call. **Deliverable: blockers logged + 1 shipped.**

#### Week 8 (Jul 1–7)
1. **Convert 1 paid pilot** (the strongest of Week 6–7 starts) to annual contract. **Deliverable: AU$2,988 annual invoice paid; first non-Charter paying customer.**
2. **Launch on Product Hunt + Indie Hackers + r/shopify (where rules permit, comment-first not self-post).** Use the Charter case study + cost calculator as anchor. **Deliverable: PH launch live; Indie Hackers post live; ≥200 visits to `/compare`.**
3. **Publish Charter Partner case study #1** as a long-form blog + LinkedIn post + Loom video. **Deliverable: all 3 assets live.**
4. **Sign first Xero advisor partner agreement** (20% rev-share, 24-month cap, free Pro practitioner account, named in Manuva's Xero App Store listing). **Deliverable: signed agreement + first referral name pencilled in.**
5. **Mid-quarter metrics review (founder solo).** Numbers required: Charter signed (target 5), demos completed (target 30+ cumulative), pilots started (target 2+), MRR (target ≥AU$700), founder hours/customer this month (target ≤12). **Deliverable: 1-page memo, written, dated.**

---

### Phase C — Weeks 9–12: Scale paid pilots, ProAdvisor channel, accountant referrals, measure

#### Week 9 (Jul 8–14)
1. **Push paid-pilot pipeline to 6 active demos this week.** Source split: 50% inbound (Compare page + content), 30% cold candle/soap DMs, 20% G2/Capterra Katana reviewer outreach. **Deliverable: 6 demos; ≥2 new pilots started.**
2. **Outreach to 10 more Xero advisors.** Now lead with the Charter case study + working Xero integration screenshots. **Deliverable: 10 DMs; ≥3 intro calls booked for Week 10.**
3. **Publish pillar post #5**: "Unleashed alternative for AU manufacturers: NZD billing, FX, and a flat-AUD comparison." Embed the calculator. Target keywords: 'Unleashed alternative', 'Unleashed AU cost NZD', 'Unleashed pricing'. **Deliverable: post live.**
4. **Approach 3 accountant referral partners with their first real client referral conversation.** From the 1 advisor signed in Week 8 + 2 most-engaged from Week 5–6. **Deliverable: 3 named end-customer conversations on the calendar for Weeks 10–11.**
5. **Apply for a speaker slot at the Australian Soaping and Candle Conference** (annual, ~200–400 attendees, sponsor slots AU$500–3K). Defer paid sponsorship; lead with a free practitioner talk pitch ("How AU candle/soap makers pass a retailer COA audit in 7 days"). **Deliverable: application submitted.**

#### Week 10 (Jul 15–21)
1. **Run 5 demo+pilot calls** sourced from the accountant pipeline (3) + inbound (2). **Deliverable: ≥2 pilots started.**
2. **Sign 2 more Xero advisors** to the partner agreement. Target 5 cumulative by Week 12. **Deliverable: 2 more agreements signed.**
3. **Publish Charter Partner case study #2.** Same playbook as Week 8 — long-form + LinkedIn + Loom. **Deliverable: all 3 assets live.**
4. **Build a "Switch Pack" service page** at `manuva.app/switch` covering Craftybase + Katana + Cin7 + Unleashed import services. AU$199 one-time, waived on annual conversion. **Deliverable: page + Stripe product live.**
5. **Run the fourth Charter cadence call** for each partner. By now expect at least one Charter Partner to verbally commit to converting at month 7 at AU$125 (50% off Pro). Get it in writing in the Notion doc. **Deliverable: written WTP confirmations from ≥3 Charter Partners.**

#### Week 11 (Jul 22–28)
1. **Convert pilot #2 to annual.** Target: by end of week, 2 cumulative non-Charter paying customers + 2 paid pilots in flight + 5 Charter Partners in month 3 of pilot. **Deliverable: AU$1,500–2,000 MRR running, 1 more conversion logged.**
2. **Run 4 demos** — bias toward Xero-advisor-referred (highest LTV, lowest churn). **Deliverable: 4 demos; ≥1 paid pilot started.**
3. **Publish pillar post #6**: "Lot-and-recall content hub index page" linking all four recall-readiness posts published in Weeks 5–9. Add a self-assessment quiz ("Are you recall-ready in 7 days?"). **Deliverable: hub page + quiz live.**
4. **Reach out to 3 ecommerce-3PLs in AU** (eStore Logistics, James and James AU, ShipBob AU) for a basic co-referral conversation. Goal: 1 informal handshake, no formal agreement yet. **Deliverable: 3 emails sent.**
5. **Submit a Xerocon AU side-event speaker pitch** for the September event ("MRP for ecommerce: where Xero stops and a manufacturing layer starts"). **Deliverable: pitch submitted.**

#### Week 12 (Jul 29 – Aug 4)
1. **Run the Day-90 review (see section 6).** Day allocated: full day Friday Aug 1, no meetings. **Deliverable: written 2-page Day-90 memo with go/no-go calls per channel.**
2. **Push final pilot conversions of the quarter.** Target conversion ratio: ≥40% of paid pilots started in Weeks 5–8 converted by end of Week 12. **Deliverable: at least 2 annual conversions logged.**
3. **Publish Charter Partner case study #3.** **Deliverable: all 3 assets live.**
4. **Send a "Quarter-in-review" email to the full list + LinkedIn post** with the 3 case studies, the calculator stats, and the Xero integration shipped. End with a paid-pilot CTA. **Deliverable: email sent; LinkedIn post live.**
5. **Lock the Phase-2 (months 4–6) priorities in writing** based on the Day-90 review. Decision points listed in section 6. **Deliverable: Q3 plan committed to repo in `docs/marketing/`.**

---

## 4. Three priority assets to build

| Asset | Owner | Weeks | Done-when |
|---|---|---|---|
| **Migration CSV wizard** (Craftybase + Katana + Cin7 imports) | Founder | Weeks 3–7 (Craftybase v1 W3; Craftybase v2 W5; Katana W4; Cin7 W7) | A Charter Partner imports their full Craftybase or Katana export with ≤1 founder hour of hand-holding. |
| **"Recall-readiness in 7 days" content hub** | Founder | Weeks 5–11 (one post per fortnight: W5, W6, W9, W11 hub index + quiz) | 4 pillar posts + 1 hub page + 1 quiz live; ≥300 organic visits/month by Week 12. |
| **Cost-comparison calculator** (Manuva vs Katana real-cost, Unleashed AUD vs Manuva flat, Craftybase Business+Premium vs Manuva Growth) | Founder | Weeks 4–7 (Katana W4, all three by W7) | All three calculators embedded on `/compare`, sharable URL outputs, ≥150 monthly users by Week 12. |

---

## 5. Success metrics (tracked every Friday)

| Metric | Baseline (W0) | W4 target | W8 target | W12 target |
|---|---|---|---|---|
| Charter Partner applications received | 0 | 12+ | — | — |
| Charter Partners signed | 0 | 5/5 | 5/5 | 5/5 |
| Demo bookings (qualified, ICP-fit) | 0 | 8 | 20 | 35 cumulative |
| Paid pilots started | 0 | 0 | 2 | 5 cumulative |
| Paid pilots converted to annual | 0 | 0 | 1 | 2–3 cumulative |
| Xero advisors signed (rev-share agreement) | 0 | 0 | 1 | 5 |
| MRR (AU$) | 0 | 0 | 700 | 1,500–2,500 |
| Founder hours / paying or piloting customer (this month) | n/a | n/a | ≤12 | ≤10 |
| Gross margin per active customer | n/a | n/a | ≥65% | ≥70% |
| `/compare` page visits (monthly) | 0 | — | 100 | 150+ |

**Stop / reduce signals** (any one triggers an immediate channel cut):
- **Gross margin < 65%** for 2 consecutive months → cut Starter-tier acquisition; route Starter inbound to fully self-serve with no founder time.
- **CAC payback > 18 months** on fully-loaded CAC → kill the underperforming channel (cold DMs first, then content, advisor channel last because it compounds).
- **Founder hours per customer > 15** for 2 consecutive months → freeze new pilot starts until a self-serve onboarding flow ships (do not hire to paper over it at this stage).
- **Pilot conversion < 30%** by end of Week 12 → diagnose: success criteria too loose, ICP too broad, or pricing too high. Do NOT respond by adding free trial.
- **Any Charter Partner verbally withdraws** → 24-hour exit interview, document, do not replace (capacity is the constraint, not slots).

---

## 6. Day 90 review checklist (Week 12, Friday Aug 1, full day blocked)

**Decision points for Phase 2 (months 4–6):**

1. **Charter Partner conversion** — Are ≥3 of 5 Charter Partners on track to convert at month 7 at AU$125 Growth-equivalent? If yes, proceed; if no, run individual save-or-graduate calls in Week 13–14.
2. **Paid-pilot conversion rate** — Is the rolling conversion rate ≥40%? If yes, double the outbound cadence to 60 DMs/week. If 30–40%, hold cadence; tighten ICP qualification. If <30%, pause outbound and rework the demo script.
3. **Xero advisor channel** — Are ≥5 advisors signed and ≥3 of them sourcing real client conversations? If yes, push Xerocon AU side-event presence in September (budget up to AU$3K for a side-event sponsorship if a speaker slot accepted). If <5 advisors, lower the activation bar — try Bookkeepers Hub AU FB group office hours.
4. **Content + SEO compounding** — Is the recall-readiness hub producing ≥300 monthly organic visits and ≥20 email captures/month? If yes, commit to 2 more pillar posts in Q3 ("AICIS for indie brands", "FSANZ-lite for makers"). If no, pause new content; double down on calculator distribution instead.
5. **MYOB integration** — Ship in Phase 2 (target Weeks 13–18). Confirm scope: AccountRight desktop vs MYOB Business cloud. Default to Business cloud only; AccountRight is desktop-legacy and a tar pit per research item 28.
6. **Lot tracking workflow hardening** — If both candle/soap Charter Partners are using lot tracking in real production by Day 90, consider opening the supplements waitlist to a quiet 1-on-1 Charter conversation (NOT public reopen).

**Conditions to fire a partner accountant** (be specific so it's not personal):
- 0 client referrals in 6 months AND 0 booked intro calls with prospective referrals → notify, offer a 90-day extension, then revoke free Pro practitioner account and remove from listing.

**Conditions to kill a segment** (in 90 days, no decision yet — but lock criteria):
- Indie cosmetics or candle/soap: <2 Charter signed and <5 inbound demos by Day 90 → demote from Phase-2 priority.
- Katana defectors: if `/compare` Katana calculator does not rank top-10 for "Katana alternative AU" by Day 90, double down on backlinks (Brahmin Solutions guest post; Craftybase comparison content backlinks) in Q3 rather than killing.
- Unleashed defectors: parked deliberately in Phase 1 — formal entry decision in Phase 2 after Xero integration has 30 days of production data.

**Conditions to hire a contractor** (NOT a full FTE yet):
- A specific recurring task consumes ≥8 founder hours/week for 4 consecutive weeks AND is genuinely templatable (e.g. case-study writing, Loom editing, CSV-wizard QA). Contract a freelancer at AU$60–100/hr capped at AU$2K/month. Hire decision-maker: founder, written in the Day-90 memo.
- DO NOT hire customer success or sales before AU$10K MRR — too early.

---

## 7. What to ignore (so the next 90 days don't drift)

- WooCommerce + Amazon connectors — Q4 2026 at earliest.
- B2B portal — Pro-tier roadmap, not GTM-blocking now.
- MYOB AccountRight desktop — Phase 2 evaluation only, default no.
- QuickBooks ProAdvisor channel — Year 2.
- Paid Google Ads — not in budget; revisit when one organic page ranks top-10 first.
- Beauty Expo Australia (~AU$5–15K booth) — defer to Year 2.
- Shopify Plus Tech Partner application — defer to Phase 3 (months 9–12), after 3 multi-channel reference logos.

---
