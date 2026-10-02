# Xero integration: market patterns and accounting needs (workstream 04)

**Date:** 2026-10-01
**For:** MVP scope decision for Manuva's Xero integration
**Method:** Read the existing repo research first (`docs/research/competitor-integrations/*`, `docs/superpowers/specs/2026-05-11-integrations-strategy-analysis.md` Part 4, `docs/research/manuva-gtm/results/16–20, 28`). Then verified and filled gaps against vendor help centres, Xero App Store listings, Xero developer docs, A2X support, accountant blogs and ATO material.

**Access limits (read before relying on Q3):**
- Reddit could not be fetched (blocked), and `site:reddit.com` searches returned nothing useful. User-voice evidence therefore comes from Xero App Store, Capterra, vendor troubleshooting docs and accountant blogs, not Reddit.
- Cin7 Core's help centre returns HTTP 403. Cin7 facts come from search snippets of its help pages, A2X's Cin7 articles and a UK partner's settings walkthrough.
- Unleashed's help centre has moved to `help-unleashed.theaccessgroup.com`, and the old URLs 301 there.
- Xero App Store pages show aggregate ratings but only a handful of review texts, mostly 5-star.

---

## 0. Corrections to the prior repo research

Several statements in the existing docs are wrong or out of date. They change the MVP conversation, so they come first.

| # | Prior claim (file) | What is actually true (2026-10-01) | Source |
|---|---|---|---|
| 1 | Katana posts COGS journals to Xero automatically when an SO is Delivered (`competitor-integrations/results/Katana_MRP.json`) | **No.** Katana's Xero integration pushes invoices and bills **by manual button only**. There is no COGS or stock journal, and Katana tells Xero users to write periodic manual journals themselves. The automatic COGS-on-Delivered feature exists **only for QuickBooks Online**. (The strategy spec had this right.) | [Katana Xero FAQ](https://support.katanamrp.com/en/articles/5968135-xero-faq), [Katana "sync" stock to Xero](https://support.katanamrp.com/en/articles/5968138-how-to-sync-stock-to-xero-from-katana) (both dated 2025-09-12), [Katana QBO stock sync](https://support.katanamrp.com/en/articles/5968165-syncing-stock-with-quickbooks-online) |
| 2 | "A2X never touches the inventory or COGS accounts, so journals won't collide" (strategy spec §3.4, §4.4) | **Wrong.** A2X has an optional COGS module that debits COGS and credits Inventory Asset per settlement. Link My Books and Amaka also post COGS. Each must be switched off when the inventory app posts COGS. | [A2X COGS solutions](https://www.a2xaccounting.com/solutions/cost-of-goods-sold), [A2X + Cin7 Core](https://support.a2xaccounting.com/en/articles/9656517-using-a2x-with-cin7-core), [Link My Books COGS FAQ](https://help.linkmybooks.com/en/articles/3780511-cogs-faq-s), [Amaka Shopify→Xero](https://amaka.com/integrations/shopify/xero/) |
| 3 | MRPeasy's Xero connector is "feature-thin" (`manuva-gtm/results/20`) | **Wrong.** MRPeasy has a two-mode integration. Its Advanced mode posts a daily journal covering Inventory, COGS, WIP, applied overhead and direct labour. It also syncs payments both ways and maps up to 2 tracking categories. It is one of the deeper Xero integrations in the cohort. | [MRPeasy Xero manual](https://www.mrpeasy.com/resources/user-manual/settings/system/integration/xero/) |
| 4 | Xero pays 85% / takes 15% on App Store billing, and you need 3 active customers to list (`manuva-gtm/results/28`) | **Superseded.** From **2026-03-02** Xero replaced the revenue share with five developer tiers priced on connections and data egress. XASS plans had to be migrated off by 2026-07-01. App Store listing is **not available** on Starter (free, 5 connections) or Core (AUD 35/mo, 50 connections). It is **optional** on Plus (AUD 245/mo, 1,000 connections) and Advanced (AUD 1,445/mo, 10,000), and **required** on Enterprise. Certification applies from Core upward. Xero's FAQ mentions no minimum connection count for listing. | [Xero developer pricing](https://developer.xero.com/pricing), [Pricing & policy FAQ](https://developer.xero.com/faq/pricing-and-policy-updates), [ecommercenews NZ](https://ecommercenews.co.nz/story/xero-to-retire-app-store-billing-shift-to-api-tiers) |
| 5 | Craftybase: Xero "in progress" | Craftybase was **renamed Stocksmith on 2026-07-01** and repositioned at "small manufacturing businesses", i.e. Manuva's segment. Xero is still listed as **"Coming soon"**. | [Craftybase is now Stocksmith](https://stocksmith.io/blog/craftybase-is-now-stocksmith), [Stocksmith integrations](https://stocksmith.io/integrations/) |
| 6 | Cin7 Core: Xero Awards 2025 finalist | Cin7 Core **won** Xero Small Business App of the Year (Australia) 2026, announced 2026-08-26. | [Cin7 newsroom](https://www.cin7.com/newsroom/cin7-wins-xero-awards-2026-australia/) |
| 7 | Cin7 Core COGS is daily-aggregate (strategy spec §4.1) | Cin7 lets you choose per channel and per transaction type: **Individual / Daily consolidate / Monthly consolidate / No sync**. COGS can be consolidated or turned off per sales channel. | [Cin7 Xero sync options](https://help.core.cin7.com/hc/en-us/articles/13000978343695-Xero-sync-options) (via search snippet), [Consolidate transactions](https://help.core.cin7.com/hc/en-us/articles/12119932745103-Consolidate-transactions-on-export-to-Xero) |

---

## 1. What competitors sync to Xero, how, and what they expose

### 1.1 Comparison matrix

Unless noted, flow is app → Xero.

| | **Katana** | **Cin7 Core** | **Unleashed** | **MRPeasy** | **Qoblex** | **Stocksmith (ex-Craftybase)** |
|---|---|---|---|---|---|---|
| **Supplier bills** | Manual "Create bill" button on PO. Creates bills, not POs. | Always auto. Optionally also Xero POs. | Auto (purchases, supplier returns) | Auto every ~5 min, or "Add to Xero" button. Also POs, vendor credits, vendor prepayments. | Auto (bills + bill payments) | QBO: no. Xero (planned): "supplier invoices" |
| **Sales invoices** | Manual "Create invoice" button on SO | Per channel: Individual / Daily / Monthly / **No sync** | Auto. **Toggle to stop sending sales** while still processing stock. | Auto ~5 min, or button. Plus prepayment invoices. | Auto per SO; batch option | **None.** Never posts sales. |
| **Credit notes** | Not documented | Yes | Yes (credits, credit journals) | Yes | Yes (refunds/returns) | — |
| **Payments** | No | **Two-way**, configurable (push / pull / both) | **Xero → Unleashed** (payment status flows back into Unleashed invoices) | **Two-way** (Xero→MRPeasy synced daily in the evening) | Yes (invoice and bill payments) | — |
| **COGS journal** | **None for Xero.** User writes manual journals periodically. (Auto on QBO only.) | Manual journal created on shipment authorisation. Individual or consolidated, can be off per channel. | Stock journals posted as **zero-total draft bills ("Bill Journals") that the user must approve** | Advanced mode only: one **daily** manual journal (9–11 pm) | Yes ("journals that carry stock value and COGS") | QBO: **monthly** period-total COGS journal plus inventory valuation adjustment |
| **Adjustments / write-offs** | Manual | Manual journals for stock adjustment, transfer, write-off, stocktake discrepancy | Draft $0 bill: Dr shrinkage / Cr Stock on Hand | In daily journal (Inventory Adjustments account) | Yes | In monthly valuation adjustment |
| **Manufacturing / WIP** | Manual (Katana describes 5 journal types for users to write) | Assembly/disassembly journals; WIP account | Dis/Assembly journal | WIP, applied overhead, direct labour, materials and FG mapped separately | "Manufacturing costs" | Period totals only |
| **Contacts** | Imported from Xero at setup, matched on push | Two-way | Two-way | Auto-created on first document. Matched by name, case-sensitive. | Matched to existing, "not duplicated" | — |
| **Items** | Listing says two-way | Two-way (recommend **not** loading Xero items) | — | Matched by Part No ↔ Item Code. **Must not use Xero tracked inventory.** | Synced as **untracked** "to avoid dual costing" | — |
| **Tax** | Tax rates mapped | Tax rules imported from Xero and mapped | Tax rates Xero → Unleashed; each tax must be Sales *or* Purchase | **Matched by percentage** (fragile in AU, where several 0% codes exist) | Each tax class mapped to a Xero rate once | Not stated |
| **Tracking categories** | Not documented | 2, mapped from Core fields | Yes | Max 2, mapped to MRPeasy custom fields | Override rules route to accounts or tracking | — |
| **Account mapping** | Revenue + expense accounts | Inventory control, COGS, tax liability, customer credit, in-transit, unrealised FX, inventory discrepancy, revenue, WIP, supplier deposits, gift card, **GRNI, GINR** | Default Sales, COGS, Stock on Hand | Purchases, Sales, Bank, Prepayments, Purchase credits. Advanced: FG, materials, WIP, applied overhead, direct labour, COGS, adjustments, transfer liability. Per-product-group overrides. | Per transaction type, plus override rules | QBO COGS + inventory asset |
| **Start date / history / lock date** | — | "Load historical data" from a chosen date. **Mirrors Xero's lock date.** | Opening stock value is **not** exported; the user journals it into Xero. Lock-date errors are surfaced. | Inventory older than 3 months needs a separate manual sync. Approved Xero documents can't be updated. | — | — |
| **Trigger** | Manual per document | Event-driven or scheduled auto-sync, with error alerts | On transaction | 5-min (docs), daily (journals) | ~5 min + events | Monthly, manual |

Sources: Katana [Xero FAQ](https://support.katanamrp.com/en/articles/5968135-xero-faq), [stock article](https://support.katanamrp.com/en/articles/5968138-how-to-sync-stock-to-xero-from-katana); Cin7 [sync options](https://help.core.cin7.com/hc/en-us/articles/13000978343695-Xero-sync-options), [Bluehub settings walkthrough](https://bluehub.co.uk/cin7-core-and-xero-integration-settings-and-account-code-mapping-2/), [Xero App Store AU listing](https://apps.xero.com/au/app/cin7-core); Unleashed [setup](https://support.unleashedsoftware.com/hc/en-us/articles/4402418327961-Xero-Integration-Setup) (search snippet), [after setup](https://support.unleashedsoftware.com/hc/en-us/articles/4402418335257-Xero-after-the-integration-setup), [SOH difference](https://support.unleashedsoftware.com/hc/en-us/articles/360039804152); MRPeasy [manual](https://www.mrpeasy.com/resources/user-manual/settings/system/integration/xero/); Qoblex [Xero page](https://qoblex.com/xero/); Stocksmith [QBO sync](https://stocksmith.io/blog/quickbooks-cogs-inventory-valuation-sync), [integrations](https://stocksmith.io/integrations/).

**Others (from prior repo JSONs; not re-verified):**
- **Prediko:** PO → Bill only.
- **inFlow:** invoices and bills per order, limited payments, contacts. COGS is pushed as **periodic totals**, not per movement.
- **Zoho Inventory:** invoices, bills and payments. Chart of accounts and contacts come from Xero. **Items don't sync.**
- **Amaka** (AU Shopify→Xero connector, Premium plan): **daily COGS manual journal** plus inventory sync ([Amaka](https://amaka.com/integrations/shopify/xero/)).

### 1.2 First release vs added later

| Vendor | First Xero release | Added later |
|---|---|---|
| **Katana** | Manual invoice + bill push. A Capterra reviewer on 2019-11-12 called Xero "in development… the most notable con". The launch post is dated 2023-08-10 on the page, which may be an update date. | **Nothing material.** As of 2025-09-12 there was still no COGS or stock sync for Xero, while QBO got auto-COGS. |
| **Cin7 Core** | Invoices, bills, payments, COGS and journals: DEAR was Xero-native from early on (date not found). | **Sales posting OFF / COGS posting ON** as independent toggles, around mid-2025. A2X's blog of 2025-06-11 says "when Cin7 enabled…", and A2X support on 2025-10-15 says "recently updated… previously, sales posting could not be switched off while leaving COGS posting on". July 2025: fixed Shopify partial refunds not landing on credit notes. COGS across multiple accounts is gated behind the paid **Advanced Products module**. |
| **Unleashed** | Built around Xero (2019 App of the Year) | "Don't send sales to accounting" toggle documented by 2023-07-20 ([A2X + Unleashed](https://support.a2xaccounting.com/en/articles/6076998-using-a2x-with-unleashed)) |
| **Stocksmith** | **First accounting release (Dec 2025) was COGS + inventory valuation journals only, to QBO, monthly, manual.** No bills, no invoices. | Xero is "Coming soon", with planned scope of "expenses, supplier invoices, and COGS". Still no sales. |
| **MRPeasy** | Date not found. Two modes: core (documents) vs advanced (journals). | — |

**Pattern:** vendors ship either *documents first* (Katana: invoices and bills) or *COGS first* (Stocksmith). Both later-arriving features in the cohort, Cin7's sales-off toggle and Stocksmith's sales-free design, move in the **same direction: stop posting channel sales and post COGS only.** That is the market correcting toward the A2X-coexistence model.

---

## 2. The double-counting problem

### 2.1 Where double counting comes from

A Manuva merchant typically has Shopify and/or Square sales already reaching Xero through one of:

| Revenue path | What it posts | Does it also post COGS? |
|---|---|---|
| **A2X** | One invoice per payout or settlement: sales by tax rate, fees, refunds, shipping. Matches the bank deposit. | **Optional.** A2X COGS module: Dr COGS / Cr Inventory, as a zero-total bill per settlement. |
| **Link My Books** | Same model as A2X | **Optional.** Can be set to "Show COGS in Analytics only". |
| **Shopify integration by Xero** (built by Xero) | Daily summary *or* per-sale transactions, plus payouts, fees and taxes | **No.** "Does not cover inventory, multi-currency COGS…" per A2X's comparison, 2024-08-05. |
| **Square + Xero** (official; run by Amaka) | Daily summary invoice *or* one invoice per Square order. Fees as bills on deposit. | **Not in the free official integration.** Amaka's paid Shopify product does post daily COGS. |
| **Amaka (Shopify)** | Summary sales | **Yes on Premium:** daily COGS manual journal |
| **Xero Inventory Plus** | US only (launched 2024-08-15). Has a "payout reconciliation" setting to avoid duplicating Shopify sales. | Yes, but US-only and no BOM. AU rollout is "Gaining Support" on Xero's ideas forum, with no commitment. |

There are therefore **two separate collision risks**:
1. **Revenue:** the inventory app posts per-order sales invoices while A2X, Xero-Shopify or Square is also posting sales. Revenue doubles.
2. **COGS:** the inventory app posts COGS while A2X, LMB or Amaka is also posting COGS. COGS doubles and Inventory Asset is credited twice.

A third, subtler one: if the merchant uses **Xero tracked inventory items** and any app sends item-coded invoices, Xero itself posts COGS. MRPeasy says "do NOT use Xero's Tracked Inventory feature", and Qoblex syncs items as untracked "to avoid dual costing".

### 2.2 How the inventory apps avoid it

- **Cin7 Core:** independent switches since roughly 2025: turn off "Sales Invoice Posting" and keep COGS, or the reverse. Per-channel "No sync" for invoices. A2X tells Cin7 users to disable COGS in A2X (*Settings > COGS > Disable*). A2X calls this the **"Parallel IMS"** model. ([A2X + Cin7 Core, 2025-10-15](https://support.a2xaccounting.com/en/articles/9656517-using-a2x-with-cin7-core), [A2X × Cin7 blog, 2025-06-11](https://www.a2xaccounting.com/blog/a2x-cin7-ecommerce-inventory-accounting))
- **Unleashed:** a Sales Integration toggle "ensures Sales Orders are still processed by Unleashed, updating your inventory levels without sending the data to your accounting system". COGS still goes over as a Bill Journal. A2X tells users to stop uploading costs to A2X. A2X calls this the **"Companion IMS"** model. ([A2X + Unleashed, 2023-07-20](https://support.a2xaccounting.com/en/articles/6076998-using-a2x-with-unleashed))
- **Finale:** the reverse: Finale syncs average costs into A2X daily and **A2X posts COGS** ("Integrated IMS").
- **Katana:** no setting. Its Xero push is manual per document, so users avoid doubling by not clicking "Create invoice" for Shopify orders. Its stock guidance even suggests keeping stock out of Xero altogether. **Katana publishes no A2X guidance.**
- **Stocksmith:** avoids the problem structurally by never posting sales.

A2X's own caveats on the parallel model ([2025-10-15](https://support.a2xaccounting.com/en/articles/9656517-using-a2x-with-cin7-core)):
- **Timing skew:** the IMS books COGS at fulfilment while A2X books revenue at payout, so "if Cin7 posts your COGS more frequently than A2X posts your sales, your margins will be skewed… until A2X posts the sales entry".
- **Order-date discrepancies** between the two systems at month end.

### 2.3 The "correct stack" accountants recommend

The consistent recommendation, from A2X, an operator-CFO blog dated 2026-06-01, Bean Ninjas (an AU-founded ecommerce bookkeeping firm) and Accolution (AU):

> **Channel → A2X (or Link My Books) posts revenue, fees and GST per payout → Xero**
> **Inventory/ops app posts bills, COGS and stock movements → Xero**
> **Only one system posts each journal type.**

- "Inventory tool handles the COGS journal, A2X handles the settlement journal, both post to QuickBooks or Xero", and "trying to make A2X your sole inventory accounting tool is usually the wrong call above $2M" ([Eightx, 2026-06-01](https://eightx.co/blog/a2x-accounting-shopify-amazon)).
- Below roughly AUD 2M, or with simple SKUs, many bookkeepers let **A2X post COGS from SKU costs** with no inventory app posting at all (Bean Ninjas' default stack is Xero + A2X + Hubdoc: [Bean Ninjas](https://beanninjas.com/blog/why-a2x-is-one-of-our-favorite-tools-for-7-figure-ecommerce-businesses/)).
- AU firms recommend A2X over Xero's own Shopify connector ([Accolution](https://accolution.com.au/blog/the-accolution-blog-1/integrating-a2x-shopify-xero-12)). Xero's connector suits "lower order volumes, just starting out" (A2X's view, 2024-08-05).

**Conclusion for Manuva:**
- For Shopify and Square orders, Manuva should **not post sales invoices by default**.
- It should post **COGS and stock movements only**, and onboarding should **ask which tool posts the merchant's sales**, then tell them to switch off COGS in that tool if it posts COGS.
- Per-order AR invoices belong only to channels that have **no payout connector**: B2B, wholesale, manual and direct orders. A2X itself carves out Shopify B2B for per-order invoices.
- Manuva's manufactured cost is the number A2X can only approximate from a static SKU cost. That is the case for Manuva owning COGS.

---

## 3. Real user pain

### 3.1 Ratings landscape (Xero App Store AU, read 2026-10-01)

| App | Rating | Reviews | Note |
|---|---|---|---|
| A2X | 4.96 | 940 | 97% 5-star. 2026 Global/US-CA Small Business App of the Year. |
| Unleashed | 4.55 | 394 | 5% 1-star |
| Cin7 Omni | 4.26 | 273 | |
| Cin7 Core | 4.47 | 221 | 6% 1-star, 5% 2-star. **AU Small Business App of the Year 2026.** |
| Fishbowl | 4.66 | 124 | |
| MRPeasy | 4.61 | 77 | 1% 1-star |
| Katana | 4.65 | 72 | 4% 1-star |
| Shopify integration by Xero | 4.7 | 69 | |
| Square (Amaka) | 4.2 | 103 | **15% 1-star** |
| Qoblex | 4.96 | 27 | 2026 finalist (Canada) |

The AU "Inventory apps" collection lists **24 apps** ([collection](https://apps.xero.com/au/collection/inventory-apps)). Only MRPeasy, Fishbowl and Qoblex present as manufacturing-focused.

### 3.2 Recurring complaints, with evidence

| Pain | Evidence |
|---|---|
| **Duplicate transactions** | Xero's own Shopify connector: "I've had invoices duplicated multiple times" ([listing](https://apps.xero.com/au/app/shopify)). Unleashed: freight on POs means "you will wind up with 2 bills" (1-star, [listing](https://apps.xero.com/au/app/unleashed-software/reviews)). Cin7 Core (Capterra): a re-import "duplicated about 50,000 orders… manual void 100 at a time". Unleashed docs: deposits entered in Xero before the PO is receipted cause duplicate transactions. |
| **Duplicate or colliding contacts** | Xero enforces unique contact names. Unleashed's error list includes "The contact name XXXX is already assigned to another contact" and "matched an archived contact". MRPeasy matches contacts by name, case-sensitive. Prior research notes Katana requires customers unique by name. Cin7 Capterra: "duplicates frequently" in customer mapping. |
| **Tax-code mapping errors** | Unleashed: "Account must be valid, Tax Rate must be valid", "[TaxCode] is not mapped", and each tax must be Sales *or* Purchase. MRPeasy picks the Xero rate by **percentage**, which is ambiguous in AU because GST Free, BAS Excluded and Input Taxed are all 0%. A2X says tax setup is its most common onboarding pain (prior repo JSON). |
| **App vs Xero inventory variance** | Unleashed and Equation (NZ accountants, 2024-12-12) list the causes: opening balances not matched at go-live; edits or deletes in Xero (one-way flow); manual journals in Xero; **unapproved draft journals**; failed exports; FX revaluation; freight coding; timing (invoice vs shipment in different months); recosts not journaled (Unleashed "receipted goods on assemblies"). A Fiskal bookkeeper (2026-05-14) warns that fixing variances with a manual journal in Xero leaves the app's sub-ledger wrong. |
| **Locked periods** | Unleashed error #1: "The document date cannot be before the period lock date". Cin7 mirrors Xero's lock date and blocks updates before it. Bookkeepers set the lock date from the oldest pending PO invoice. |
| **Silent stops and disconnects** | Xero refresh tokens expire after 60 days unused, and access lapses when the authorising user is removed. Integrations "stop without obvious user notification". Unleashed's "500 Internal Server Error" fix is to wait 24h for the **daily rate limit** to reset. |
| **Account-type mismatch** | Unleashed: "Account Code XXX is not a valid Code for this document". The fix is to change the Xero account type to Revenue, Direct Cost or Current Asset. |
| **Depth behind a paywall** | Cin7 Core: COGS across multiple accounts needs the paid Advanced Products module (Capterra, 2025-07). |
| **Sync latency** | Unleashed: "the 15 minute time delay… is frustrating" (3-star). |
| **Price rises** (not integration, but the top 1-star theme) | Katana: "$1,188/yr → $2,148/yr" (1-star). Unleashed: "increased by over 37%" (1-star). |

Sources: [Unleashed Xero error catalogue](https://help-unleashed.theaccessgroup.com/en/articles/11582217-troubleshooting-xero-integration-errors), [Equation NZ](https://www.equation.co.nz/post/understanding-variances-between-xero-and-your-stock-management-system-unleashed-cin7core-cin7omni), [Fiskal: reconcile Cin7/Xero (2025-05-30)](https://fiskalfinance.com/how-to-reconcile-cin7-and-xero-a-step-by-step-guide), [Fiskal: mismatch after manual journal (2026-05-14)](https://fiskalfinance.com/cin7-inventory-not-matching-after-manual-journal), [Capterra Cin7 Core](https://www.capterra.com/p/133038/Cin7-Core/reviews/), [Capterra Katana](https://www.capterra.com/p/172888/Katana-MRP/reviews/), [Xero lock-date behaviour (Cin7 FAQ snippet)](https://help.core.cin7.com/hc/en-us/articles/9034590908175-Xero-Integration-FAQs).

### 3.3 What earns a high rating

- **Named human support during onboarding dominates the review text.** Cin7 Core's 5-star reviews name an onboarding specialist, Unleashed's name a support agent, and A2X's name chat agents. Reviews mention support far more often than features. Vendors clearly solicit reviews at the end of onboarding.
- **Things just match.** A2X's praise is "makes it so easy to reconcile", "structured, reliable and manageable". The payout invoice equals the bank deposit, which is a visible proof of correctness.
- **Few moving parts for the user.** MRPeasy's 5-star reviews say "almost seamless", "without manual workarounds".
- **Ratings are not a depth signal.** Katana's thin manual-button integration scores 4.65, above Cin7 Core's 4.47. Owner-reviewers rate the experience, not the journals.

---

## 4. The accountant and bookkeeper perspective

### 4.1 What should land in Xero for a small manufacturer running perpetual inventory in an ops app

| Flow | Accountant-preferred treatment | Minimum tolerated |
|---|---|---|
| **Supplier bills for stock items** | Bill lines coded to **Inventory Asset** (or a GRNI clearing account if goods were received before the bill). Correct GST code. Supplier matched to the existing contact. | Bill coded to a Purchases/COGS expense, with a periodic stock adjustment. This is Katana's model and is acceptable under the ATO simplified rules below. |
| **Non-stock purchases** | Expense accounts | Same |
| **Goods received before bill** | **GRNI accrual:** receipt Dr Inventory / Cr GRNI, then bill Dr GRNI / Cr AP. Cin7 offers GRNI and GINR accounts as an option. | Post the bill at bill date and accept a timing difference at month end |
| **COGS** | Perpetual, **summarised daily or monthly** (Cin7 daily/monthly consolidate, MRPeasy daily, Amaka daily, Stocksmith monthly), with drill-down kept in the app | Monthly manual journal from the app's COGS report (Katana) |
| **Manufacturing** | Raw → WIP → FG with labour and overhead absorbed (MRPeasy advanced mode). WIP matters only when runs span period end. | A single Inventory account, where production moves are internal and net to zero in Xero |
| **Stock adjustments, write-offs, stocktake variance** | Journal Dr Shrinkage / Inventory discrepancy expense, Cr Inventory (Unleashed, Cin7) | Year-end adjustment. Bookkeepers keep adjustments within about 2% of inventory value and at year end where possible (Fiskal, 2025-05-30). |
| **Landed cost (freight, duty)** | Capitalised into inventory value | Expensed |
| **Opening balance** | App's opening valuation equals the Xero inventory balance at go-live. Unleashed makes users journal this manually. | Same |
| **Month-end** | App valuation report as at the month-end date **equals** the Xero Inventory Asset balance. Variances explained from the sync log. Lock date set after the tie-out. | Quarterly or annual tie-out |

### 4.2 AU-specific rules that shape the floor

- **ATO simplified trading stock rules:** businesses with aggregated turnover under $10M (and, from 2021-07-01, under $50M) whose stock value changed by **$5,000 or less** in the year need not do a formal stocktake or account for the change ([ATO](https://www.ato.gov.au/businesses-and-organisations/income-deductions-and-concessions/income-and-deductions-for-business/accounting-for-trading-stock/simplified-trading-stock-rules)). This is why very small makers survive on "expense purchases, adjust at year end", Katana's model.
- **ATO IT 2350: absorption costing for manufacturers.** For tax, manufactured trading stock valued at cost must include materials, direct labour **and an appropriate share of production overheads**. Direct or variable costing is not accepted. The ruling remains on the ATO legal database ([ATO](https://www.ato.gov.au/law/view/document?LocID=%22ITR%2FIT2350%2FNAT%2FATO%22&PiT=20240729000000)). If Manuva's valuation is materials-only, the accountant will adjust at year end. A valuation report that can absorb labour and overhead is something an accountant would value. *(Whether Manuva captures labour or overhead is for the manuva-finance-map workstream.)*

### 4.3 The minimum an accountant would accept, and what earns a recommendation

**Minimum acceptable:**
1. No double revenue and no double COGS (§2).
2. Supplier bills with the right supplier contact, accounts and GST code, and no duplicate bills or contacts.
3. A periodic COGS / inventory journal (daily or monthly summary is fine) so that **Xero's Inventory Asset ties to the app's valuation report**.
4. Nothing posts into a locked period.

**What makes them recommend it:**
- A **reconciliation view** (app valuation vs Xero balance, with the variance traced to transactions). Unleashed and Cin7 both ship one: "Reconciliation with Xero" and "Transactions vs Stock on Hand Difference".
- A clear **failed-sync queue** with fixable errors.
- **Lock-date respect.**
- **A2X coexistence** (sales off, COGS on).
- **Accountant-controlled configuration.** Scale Suite (AU, July 2026) says configuration needs "accountant sign-off… a finance function responsibility, not merely an IT deployment".
- **Tracking categories** and **landed cost** for growing clients.
- **Support** that answers.

---

## 5. Buyer evaluation and the Xero App Store channel

### 5.1 Checkbox or depth?

Both, depending on who evaluates.

- **Owner on the discovery call: a checkbox.**
  - Katana's 2019 reviewer listed missing Xero as the "most notable con", then accepted manual buttons.
  - Katana still scores 4.65, and G2 and Software Advice reviewers praise it: "works seamlessly for bills and sales orders".
  - Prediko ships PO→Bill only, and Stocksmith shipped COGS-only to QBO. Thin integrations sell.
- **Accountant or bookkeeper: tests depth.**
  - Scale Suite's (AU, July 2026) first criterion is "how cleanly the inventory system posts to Xero, sales, COGS, stock adjustments and purchase data".
  - Comparison content consistently ranks Katana's Xero below Cin7 and Unleashed ("requires workarounds for more complex accounting scenarios" per [Qoblex comparison](https://qoblex.com/blog/cin7-vs-katana-which-inventory-management-software-should-you-choose-in-2026/), a competitor source).
  - Xero's award judging criteria include "integration depth" ([thefirm.media](https://www.thefirm.media/articles/xero-app-awards-2026-winners/)).
  - Cin7 won AU 2026 "for… keeping their books accurate in Xero".
  - Unleashed's edge is "partner network density" with Xero advisors in APAC ([Eightx, 2026-06-04](https://eightx.co/blog/cin7-vs-unleashed-inventory-erp)).
- **Implication for Manuva:** the GTM research makes the **accountant channel the #1 motion** (`manuva-gtm/results/28`, priority 1) and says Unleashed and MRPeasy defectors are gated on Xero (`19`, `20`). In that motion the evaluator is the one who tests depth. So a bills-only MVP clears the owner's checkbox but **does not earn accountant referrals**. The depth that matters to accountants is the COGS journal, the tie-out and no double counting, not per-order invoices.
- **Caveat:** the defector files are model-generated hypotheses with "[uncertain]" quotes (one claim there is factually wrong, see §0 #3). Treat them as direction, not evidence.

### 5.2 Value of a Xero App Store listing for AU SMBs

- **Reach:** Xero has 4.4–4.6M subscribers globally and more than 1,000 apps. Xero claims 78% of customers have gained efficiencies from apps (undated). In Xero's AU practice report (2024-02-12), firms using at least one Xero practice app added an average of 24 new clients vs 15. That shows apps matter to practices, but it is not inventory-specific.
- **Category density is low enough to stand out:** the AU inventory collection has 24 apps, and only ~3 present as manufacturing-focused. Unleashed's 394 reviews show the review moat that comes from years of accountant-referred installs.
- **Cost and gating changed on 2026-03-02.** Listing needs the **Plus tier (AUD 245/mo, up to 1,000 connections)** plus certification, and probably the security assessment (sources differ on whether that starts at Plus or Advanced). Starter (free, 5 connections) and Core (AUD 35/mo, 50) cannot list. Xero no longer bills on the app's behalf, so Manuva keeps its own billing.
- **Practical read:**
  - Build to **certification checkpoints from day one**: Sign Up with Xero, account and payment mapping, tax rates, error handling, data integrity ([checkpoints](https://developer.xero.com/documentation/xero-app-store/app-partner-guides/certification-checkpoints)).
  - Run on Core while the customer count is under 50.
  - **List once the accountant channel is being worked**, because advisors search the App Store and read its reviews. The listing is a trust artefact for advisors more than a self-serve acquisition channel for owners.
  - A listing with few reviews in a category led by 200–400-review incumbents needs onboarding-solicited reviews (§3.3).

---

## 6. Proposed tiering

### MVP must-have

| # | Capability | Evidence |
|---|---|---|
| M1 | **Connect / disconnect / reconnect** (OAuth, tenant pick). **Detect a dead token and alert loudly** (in-app banner + email). | 60-day refresh expiry and silent stops (§3.2). Certification "connection" checkpoint. |
| M2 | **Account mapping**: Inventory Asset, COGS, Stock adjustments/write-off, default purchase account. Validate Xero account *types*. | Unleashed account-type errors. MRPeasy and Cin7 mapping sets. Certification checkpoint. |
| M3 | **Tax mapping by Xero TaxType pulled from the org**, never by percentage. Separate purchase and sales. | MRPeasy's %-match is ambiguous with AU 0% codes. Unleashed tax errors. Certification "tax rates" checkpoint. |
| M4 | **Supplier bills** from POs / goods inwards → Xero ACCPAY (draft or awaiting-approval option), with **contact matching by Xero ContactID** (offer link-to-existing, never create by name blindly). Attach the PO reference. | Universal across the cohort. Prediko and Katana launched with it. Duplicate-contact and duplicate-bill pain. |
| M5 | **COGS + stock-movement journal: one consolidated journal per day** (Dr COGS / Cr Inventory, plus adjustments/write-offs to the mapped expense), with narration listing the source documents. | Cin7 daily consolidate, MRPeasy daily, Amaka daily, Stocksmith monthly. Katana's lack of it is its most-cited depth gap. It is what lets Xero inventory tie out. |
| M6 | **Channel sales OFF by default for Shopify/Square orders**, plus an onboarding question: *"What sends your sales to Xero? A2X / Link My Books / Xero's Shopify app / Square / none"*. If the answer is A2X, LMB or Amaka, show how to **disable COGS** in that tool. | §2: Cin7 added this toggle in 2025 after the problem; Unleashed has the toggle; A2X's Parallel/Companion IMS guidance. |
| M7 | **Idempotent posting + sync log + failed-sync queue** with plain-English, fixable errors and retry. Never double-post on retry. | Duplicates are the #1 complaint. Unleashed's 12-error catalogue is the checklist. |
| M8 | **Sync start date + lock-date awareness**: read Xero's lock date and never attempt a post before it. Queue and flag instead. | Unleashed error #1. Cin7 mirrors the lock date. |
| M9 | **Tie-out view**: Manuva valuation as at date vs Xero Inventory Asset balance (read Balance Sheet / Trial Balance), with the variance and the unsynced items. | The accountant's minimum (§4.3). Unleashed and Cin7 both ship reconciliation reports. |
| M10 | **Guardrail against Xero tracked inventory**: warn if the org uses tracked items on mapped accounts. Never send item codes that would trigger Xero's own COGS. | MRPeasy and Qoblex guidance (§2.1 third risk). |

### V2 (next 1–2 releases)

| Capability | Evidence |
|---|---|
| **Sales invoices for channels without a payout connector** (B2B, wholesale, manual orders), with **per-channel mode Individual / Daily summary / Off** | Cin7 per-channel modes. A2X carves out B2B per-order invoices. MRPeasy and Unleashed post invoices. |
| **Payment status read back from Xero** (paid/unpaid on Manuva orders) | Unleashed (Xero → app), MRPeasy and Cin7 (two-way) |
| **Credit notes** for returns and refunds | Cin7, Unleashed, Qoblex, MRPeasy. Cin7's 2025 partial-refund fix shows it's a bug magnet. |
| **Tracking categories** (max 2: channel / location / product group) | Cin7, Unleashed, MRPeasy, Qoblex, A2X |
| **Landed cost capitalised into inventory** (freight/duty bills allocated to receipt) | Unleashed's "2 bills" freight complaint. Scale Suite criterion. Cin7 and Unleashed have it. |
| **GRNI accrual** for receipt-before-bill | Cin7 GRNI/GINR accounts. Fiskal's month-end process. |
| **Separate Raw / WIP / FG accounts with production journals** | MRPeasy advanced mode. Needed when runs span month end. |
| **Opening-balance journal assistant** at go-live | Unleashed's top variance cause is mismatched opening balances |
| **Multi-currency bills** | Cohort standard. Xero plan-gated. |
| **App Store listing + certification** (Plus tier), plus free advisor access | §5.2. GTM channel plan. |

### Differentiator later

| Capability | Evidence / rationale |
|---|---|
| **Per-production-order COGS with variance lines** (PPV, material usage, scrap) and drill-back links | Nobody in the cohort does it (strategy spec Gap 2). Demand evidence is thin: accountants ask for tie-out, not detail. Build once M9 is trusted. |
| **Absorption-costed valuation report for EOFY** (materials + labour + overhead share, IT 2350) with a simplified-trading-stock-rules check | AU-specific, accountant-facing, and a clear "we know AU" signal. Depends on Manuva capturing labour/overhead. |
| **Accountant workspace**: multi-client tie-out dashboard, month-end checklist, period close aligned to the Xero lock date | Unleashed's moat is the advisor network. Accountants are the evaluators (§5.1). |
| **Native payout/settlement posting (replace A2X)** | Strategy spec says don't build: A2X is 4.96★/940, a category winner, and cheap. Keep as "never unless pulled". Coexistence (M6) captures most of the value. |
| **Cost sync into A2X** (Integrated IMS model, like Finale) | Alternative for merchants who prefer A2X to own COGS. A2X lists Finale and sku.io as cost sources. |

---

## 7. Hand-offs to other workstreams

- **xero-platform:**
  - Unleashed and A2X both post COGS as **zero-total draft bills** rather than ManualJournals, and the reason isn't stated definitively. A2X cites attached supporting data. It is worth checking whether Manuva should use ManualJournals (simpler, no approval step) or bills.
  - Also confirm whether the **security assessment** applies from Plus or from Advanced. Xero's pricing page and third-party guides disagree.
- **manuva-finance-map:** M5 and M9 assume Manuva can produce (a) a valuation as at any date and (b) a daily COGS total per channel. Absorption costing (differentiator) needs labour and overhead capture.
- **GTM docs:** `manuva-gtm/results/28` partner economics (85/15, 3-customer listing bar) are obsolete after 2026-03-02.

---

## Sources

**Vendor docs**
- Katana: [Xero FAQ](https://support.katanamrp.com/en/articles/5968135-xero-faq), [How to "sync" stock to Xero](https://support.katanamrp.com/en/articles/5968138-how-to-sync-stock-to-xero-from-katana), [QBO stock sync](https://support.katanamrp.com/en/articles/5968165-syncing-stock-with-quickbooks-online), [Xero launch post](https://katanamrp.com/blog/katana-xero-integration/)
- Cin7 Core: [Xero sync options](https://help.core.cin7.com/hc/en-us/articles/13000978343695-Xero-sync-options), [Consolidate transactions](https://help.core.cin7.com/hc/en-us/articles/12119932745103-Consolidate-transactions-on-export-to-Xero), [Xero FAQ (lock date)](https://help.core.cin7.com/hc/en-us/articles/9034590908175-Xero-Integration-FAQs), [Bluehub settings walkthrough](https://bluehub.co.uk/cin7-core-and-xero-integration-settings-and-account-code-mapping-2/), [AU 2026 award](https://www.cin7.com/newsroom/cin7-wins-xero-awards-2026-australia/)
- Unleashed: [Xero error catalogue](https://help-unleashed.theaccessgroup.com/en/articles/11582217-troubleshooting-xero-integration-errors), [SOH vs Xero difference](https://support.unleashedsoftware.com/hc/en-us/articles/360039804152), [After setup](https://support.unleashedsoftware.com/hc/en-us/articles/4402418335257-Xero-after-the-integration-setup), [Setup](https://support.unleashedsoftware.com/hc/en-us/articles/4402418327961-Xero-Integration-Setup)
- MRPeasy: [Xero manual](https://www.mrpeasy.com/resources/user-manual/settings/system/integration/xero/)
- Qoblex: [Xero](https://qoblex.com/xero/)
- Stocksmith: [Rename announcement](https://stocksmith.io/blog/craftybase-is-now-stocksmith), [QBO COGS sync](https://stocksmith.io/blog/quickbooks-cogs-inventory-valuation-sync), [Integrations](https://stocksmith.io/integrations/)

**A2X and revenue connectors**
- A2X: [A2X + Cin7 Core](https://support.a2xaccounting.com/en/articles/9656517-using-a2x-with-cin7-core), [A2X + Unleashed](https://support.a2xaccounting.com/en/articles/6076998-using-a2x-with-unleashed), [A2X × Cin7 blog](https://www.a2xaccounting.com/blog/a2x-cin7-ecommerce-inventory-accounting), [COGS solutions](https://www.a2xaccounting.com/solutions/cost-of-goods-sold), [Partners FAQ COGS](https://support.a2xaccounting.com/en/articles/4241259-a2x-partners-faq-does-a2x-calculate-cogs), [Xero Shopify integration vs A2X](https://support.a2xaccounting.com/en/articles/5777250-shopify-integration-by-xero-vs-a2x)
- Link My Books: [COGS FAQ](https://help.linkmybooks.com/en/articles/3780511-cogs-faq-s)
- Amaka: [Shopify→Xero](https://amaka.com/integrations/shopify/xero/), [Square→Xero guide](https://amaka.com/help/guide/square/xero/)
- Xero: [Inventory Plus (US)](https://www.xero.com/us/accounting-software/manage-inventory/inventory-plus/), [Inventory Plus launch](https://www.xero.com/us/media-releases/xero-unveils-inventory-software-xero-inventory-plus/), [AU rollout idea](https://productideas.xero.com/forums/967139-purchase-orders-bills-inventory/suggestions/50393745-inventory-plus-roll-out-xero-inventory-plus-to-a)

**Xero App Store (read 2026-10-01)**
- Listings: [Unleashed](https://apps.xero.com/au/app/unleashed-software/reviews), [Cin7 Core](https://apps.xero.com/au/app/cin7-core), [MRPeasy](https://apps.xero.com/au/app/mrpeasy), [Katana](https://apps.xero.com/au/app/katana), [A2X](https://apps.xero.com/au/app/a2x/reviews), [Shopify by Xero](https://apps.xero.com/au/app/shopify), [Square](https://apps.xero.com/au/app/square)
- Collections: [AU Inventory collection](https://apps.xero.com/au/collection/inventory-apps), [Award-winning 2026](https://apps.xero.com/au/collection/award-winning-apps-2026)

**Xero developer platform**
- [Pricing](https://developer.xero.com/pricing), [Pricing & policy FAQ](https://developer.xero.com/faq/pricing-and-policy-updates), [Certification checkpoints](https://developer.xero.com/documentation/xero-app-store/app-partner-guides/certification-checkpoints), [maesn partnership guide (2026-08-11)](https://www.maesn.com/blog/xero-partnership-guide/), [ecommercenews: XASS retirement](https://ecommercenews.co.nz/story/xero-to-retire-app-store-billing-shift-to-api-tiers)

**Accountant and operator views**
- [Eightx: A2X verdict, 2026-06-01](https://eightx.co/blog/a2x-accounting-shopify-amazon)
- [Eightx: Cin7 vs Unleashed, 2026-06-04](https://eightx.co/blog/cin7-vs-unleashed-inventory-erp)
- [Bean Ninjas on A2X](https://beanninjas.com/blog/why-a2x-is-one-of-our-favorite-tools-for-7-figure-ecommerce-businesses/)
- [Accolution (AU)](https://accolution.com.au/blog/the-accolution-blog-1/integrating-a2x-shopify-xero-12)
- [Scale Suite (AU), July 2026](https://www.scalesuite.com.au/resources/best-inventory-software-xero)
- [Equation (NZ), 2024-12-12](https://www.equation.co.nz/post/understanding-variances-between-xero-and-your-stock-management-system-unleashed-cin7core-cin7omni)
- Fiskal: [reconcile Cin7 and Xero, 2025-05-30](https://fiskalfinance.com/how-to-reconcile-cin7-and-xero-a-step-by-step-guide), [mismatch after manual journal, 2026-05-14](https://fiskalfinance.com/cin7-inventory-not-matching-after-manual-journal)
- [FD Works on Unleashed (2017)](https://www.fd-works.co.uk/insights/unleashed-inventory-app/)

**Reviews**
- [Capterra Cin7 Core](https://www.capterra.com/p/133038/Cin7-Core/reviews/), [Capterra Katana](https://www.capterra.com/p/172888/Katana-MRP/reviews/)

**ATO and Xero reports**
- ATO: [Simplified trading stock rules](https://www.ato.gov.au/businesses-and-organisations/income-deductions-and-concessions/income-and-deductions-for-business/accounting-for-trading-stock/simplified-trading-stock-rules), [IT 2350 absorption cost](https://www.ato.gov.au/law/view/document?LocID=%22ITR%2FIT2350%2FNAT%2FATO%22&PiT=20240729000000)
- Xero: [AU practice app report, 2024-02-12](https://www.xero.com/us/media-releases/leveraging-app-advantage-report-australia-february-2024/), [2026 App Awards winners (thefirm.media)](https://www.thefirm.media/articles/xero-app-awards-2026-winners/)
