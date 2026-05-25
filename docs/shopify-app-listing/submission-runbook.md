# Pre-submission Runbook

Two items the App Store reviewer needs before you click Submit. Plan: ~60 minutes of work.

---

## 1. Create the reviewer account (~15 min)

The reviewer needs working credentials so they can verify the "Open Manuva" link from the embedded surface actually goes somewhere useful.

### Steps

1. **Decide on the reviewer email.** Options:
   - `reviewer@manuva.app` — clean, professional, requires you to set up that mailbox (Gmail/Google Workspace alias works)
   - Any existing inbox you control — fine, just don't use your personal admin account

2. **Sign up at https://app.manuva.app/signup** with that email.

3. **Set up the demo tenant** so the reviewer sees real-looking data, not an empty workspace:
   - Connect a Shopify store (use the dev dashboard's "Install app" flow on a dev store — `pactechdevtemp.myshopify.com` would work if you reinstall Manuva there)
   - Trigger a sync so products + orders populate
   - Optionally seed BOMs on 2-3 products (use the BOM Builder or the existing `scripts/seed_pac_catalog_and_boms.mjs`)
   - Confirm dashboard shows non-zero counters

4. **Capture the credentials:**
   - Username: `reviewer@manuva.app`
   - Password: _(generate a long random one — store in 1Password)_

5. **Paste into the listing form:**
   - Open https://partners.shopify.com/4581855/apps/360504393729/edit_listing/en
   - Scroll to **App testing information → Test account → Login details**
   - Replace `reviewer@manuva.app` with your real reviewer email
   - Replace `REVIEWER_PASSWORD_PLACEHOLDER` with the password
   - In **Account description**, replace the existing text with: "Reviewer account on app.manuva.app. The embedded Shopify surface (Apps → Manuva inside Admin) does not require a login — use Token Exchange via App Bridge. Sign in here to test the full Manuva workspace at app.manuva.app/app after clicking 'Open Manuva' from the embedded card."
   - Save

---

## 2. Record the screencast (~30 min including upload)

Goal: a 60-90 second walkthrough that proves the integration works. Production value doesn't matter — clarity does. Unlisted YouTube / Loom / Vimeo all fine.

### Pre-flight

- Use the demo tenant from step 1 (with synced data)
- Have two browser tabs ready:
  - Tab A: Shopify Admin at `pactechdev.myshopify.com` (or whatever dev store has Manuva installed)
  - Tab B: app.manuva.app (signed in as the reviewer account)
- Resize browser to ~1600×900 for clean recording
- Close unrelated tabs, hide bookmark bar, set browser to light mode
- Use Loom (free) or QuickTime / OBS — Loom is the easiest for upload + share link

### Shot list (target: 75 seconds total)

| Time | Shot | Voice-over (or on-screen text overlay) |
|------|------|-----------------------------------------|
| 0:00-0:08 | Shopify Admin home, click **Apps → Manuva** in left nav | "Manuva loads inside Shopify Admin as an embedded app." |
| 0:08-0:18 | Embedded surface visible — point to **Store**, **Last synced**, **Sync now**, **Open Manuva** | "It shows your store connection, last sync, and lets you trigger a sync from inside Shopify." |
| 0:18-0:28 | Click **Sync now**. Wait for the success state. | "Sync now pulls latest products and orders into Manuva." |
| 0:28-0:35 | Click **Open Manuva** — new tab opens to app.manuva.app dashboard | "Open Manuva takes you to the full workspace." |
| 0:35-0:45 | In Manuva: navigate **Products → click a variant → Bill of Materials tab** | "Each variant has a Bill of Materials with components, quantities, and costs." |
| 0:45-0:55 | In Manuva: navigate **Orders → click an allocated order** | "Shopify orders sync into Manuva with allocation status and planned margin." |
| 0:55-1:05 | In Manuva: navigate **Components** | "Components inventory with on-hand, available, and reorder points." |
| 1:05-1:15 | In Manuva: navigate **Settings → Integrations → Shopify card → Manage** | "Settings shows the connected store with sync stats and a disconnect option." |
| 1:15-1:20 | End on the Settings page | (no voice-over — let it close) |

### Tips

- Don't try to demo *features* — demo the *flow*. The reviewer wants to confirm the integration works, not learn how to use Manuva.
- Don't show real customer data. The demo tenant should be your own data.
- Don't speed up the video. Reviewers should be able to follow along at native speed.
- Don't show your own browser bookmarks, extensions, or notification popups.

### Upload + paste URL

1. Upload to Loom (or YouTube as unlisted)
2. Copy the share link
3. In the listing form (https://partners.shopify.com/4581855/apps/360504393729/edit_listing/en), scroll to **App testing information → Screencast URL**
4. Replace `https://manuva.app` with the video link
5. Save

---

## 3. Click Submit

When both items above are done:

1. Open https://partners.shopify.com/4581855/apps/360504393729/distribution/app-store
2. Verify all 9 preliminary steps are green
3. Click **Submit for review** (top-right of the page)
4. Confirm in the modal that appears

After submission you'll get a confirmation email and the status changes from `Draft` to `Submitted`. Expect a reviewer response within 5-10 business days.

---

## What review typically catches

Even with everything green, reviewers sometimes flag:

- **Pricing disclosure clarity** — they want it crystal clear that Manuva charges externally. Our listing description already says "Free to install. A Manuva subscription is required to sync products and orders." Should be fine.
- **GDPR webhook responses** — they trigger real webhooks at the declared URLs and verify HMAC + 200 response. Our handlers do this.
- **Install redirect timing** — the install must complete within a reasonable time. Our OAuth callback is quick.
- **Shop data isolation** — if the reviewer installs the app on two different dev stores, they should see different data in each. Our tenant scoping handles this.

If anything is flagged, you'll get a specific list. Most rejections take 1-2 weeks to round-trip; if you submit clean, it usually goes through first time.
