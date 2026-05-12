# Privacy Policy Deployment Checklist

**Document Version:** 1.0  
**Created:** 12 May 2026  
**Last Updated:** 12 May 2026

## Overview

This checklist guides the deployment of the Manuva Privacy Policy to production. The privacy policy is hosted at `https://manuva.app/privacy` and is a public-facing compliance document.

### Key Resources
- **Privacy Policy Content:** `public/docs/privacy-policy.md`
- **Privacy Page Component:** `src/app/privacy/page.tsx`
- **Privacy Page Styles:** `src/app/privacy/page.module.css`
- **Build Output:** `.next/server/app/privacy` (generated after `npm run build`)

---

## Pre-Launch Checklist (7-14 Days Before Launch)

### Legal & Compliance Review
- [ ] **Legal Team Sign-off**
  - Date of review: ___________
  - Reviewer: ___________
  - Compliance assessment: ✓ Compliant with Australian Privacy Principles (APPs) and Privacy Act 1988 (Cth)
  - Comments/issues resolved: ___________

- [ ] **Content Verification**
  - [ ] No placeholder text (e.g., "[INSERT]", "TODO", "TBD")
  - [ ] All contact information verified and current
    - [ ] Email: privacy@manuva.app
    - [ ] Phone: +61 2 8248 8888
    - [ ] Address: Level 10, 99 Pitt Street, Sydney, NSW 2000, Australia
    - [ ] ABN: 12 345 678 901
  - [ ] Effective date matches release date (12 May 2026)
  - [ ] Version number is set to 1.0
  - [ ] No outdated references to features or integrations

- [ ] **Compliance Mapping Verification**
  - [ ] APPs compliance table reviewed and accurate
  - [ ] Regional regulations documented (Australian focus)
  - [ ] Integrations listed (Shopify, Stripe, Xero) and data handling explained
  - [ ] Data retention periods specified for each data category

### Technical Review (Dev/QA Team)
- [ ] **Code Quality Checks**
  - [ ] No console errors or warnings in development build
  - [ ] Next.js page component compiles without errors
  - [ ] Markdown parser correctly handles all content sections
  - [ ] No broken links or relative path issues

- [ ] **Performance Testing**
  - [ ] Page load time < 1 second (on 4G connection)
  - [ ] First Contentful Paint (FCP) < 1.2s
  - [ ] Largest Contentful Paint (LCP) < 2.5s
  - [ ] Cumulative Layout Shift (CLS) < 0.1
  - [ ] Lighthouse score > 90 for Performance

- [ ] **Accessibility Testing**
  - [ ] All headings properly structured (H1, H2, H3, etc.)
  - [ ] Links have descriptive text (not "click here" or "read more")
  - [ ] Color contrast meets WCAG AA standard (4.5:1 for text)
  - [ ] Page is keyboard navigable (Tab key works smoothly)
  - [ ] Screen reader compatible (test with NVDA or JAWS)
  - [ ] Mobile accessibility verified (touch targets > 48x48px)

- [ ] **Responsive Design Verification**
  - [ ] Desktop (1920px, 1440px, 1024px) - renders correctly
  - [ ] Tablet (768px, 810px) - readable and accessible
  - [ ] Mobile (375px, 480px, 600px) - fully responsive, readable
  - [ ] Images scale appropriately on all screen sizes
  - [ ] No horizontal scrolling on any device

- [ ] **Design System Compliance**
  - [ ] All colors use design system tokens (--brand-1, --bg-card, --ink-strong, etc.)
  - [ ] Typography follows Manuva Design System (font sizes, weights, line heights)
  - [ ] Spacing uses design token values (no hardcoded margins/padding)
  - [ ] Border widths use token values
  - [ ] No hardcoded color values (hex, rgb, etc.)

### SEO & Navigation
- [ ] **Meta Tags & SEO**
  - [ ] Page title is set: "Privacy Policy | Manuva"
  - [ ] Meta description is present and descriptive (< 160 characters)
  - [ ] Canonical tag points to: `https://manuva.app/privacy`
  - [ ] Open Graph tags set for social sharing
  - [ ] Page is indexed by Google (checked in Google Search Console)

- [ ] **Navigation & Discovery**
  - [ ] Footer link added to all pages (text: "Privacy")
  - [ ] Privacy page included in sitemap.xml
  - [ ] Privacy page listed in robots.txt (not blocked)
  - [ ] Internal navigation to related pages (Terms of Service if exists)
  - [ ] Breadcrumb navigation shows correct path

- [ ] **Link Verification**
  - [ ] All internal links are absolute or correctly relative
  - [ ] All external links open in new tab (target="_blank")
  - [ ] Email link format: `mailto:privacy@manuva.app` works correctly
  - [ ] No 404 errors when following links on the page

### Data & Security
- [ ] **No Sensitive Data Exposure**
  - [ ] No API keys, tokens, or credentials in content
  - [ ] No customer data or examples in privacy text
  - [ ] No internal IP addresses or system architecture details
  - [ ] Content review for unintended information disclosure

- [ ] **Security Headers**
  - [ ] Content Security Policy (CSP) headers configured
  - [ ] No inline scripts or event handlers
  - [ ] Markdown content properly sanitized
  - [ ] No XSS vulnerabilities in markdown parser

---

## Launch Day Checklist (2-4 Hours Before Launch)

### Pre-Deployment Build
- [ ] **Build Verification**
  - [ ] Run `npm run build` successfully
  - [ ] Build output: ✓ No errors
  - [ ] Build time: __________ seconds
  - [ ] Bundle size acceptable (check `.next` output)
  - [ ] All assets bundled and fingerprinted

- [ ] **Final Content Check**
  - [ ] Effective date is correct: 12 May 2026
  - [ ] Version number is 1.0
  - [ ] Contact information is accurate
  - [ ] Last updated timestamp is correct

### Staging Verification (Before Production Deploy)
- [ ] **Staging Environment Testing**
  - [ ] Deploy to Vercel staging/preview environment
  - [ ] Page loads at `https://assemblio-staging.vercel.app/privacy` (or equivalent)
  - [ ] All content renders correctly in staging
  - [ ] Links work in staging environment
  - [ ] Performance metrics acceptable in staging
  - [ ] No console errors in staging

### Production Deployment
- [ ] **Vercel Deployment**
  - [ ] Commit message: "docs: add privacy policy documentation and deployment guides"
  - [ ] Branch: `main`
  - [ ] Push to GitHub triggers deployment
  - [ ] Vercel build completes successfully
  - [ ] Deployment status: ✓ Production ready
  - [ ] Deployment URL: https://manuva.app/privacy
  - [ ] Deployment timestamp: ___________

- [ ] **Immediate Post-Deploy Checks (First 15 minutes)**
  - [ ] Page loads at https://manuva.app/privacy
  - [ ] Page title is correct in browser tab
  - [ ] Content displays correctly without layout shifts
  - [ ] No console errors (check DevTools)
  - [ ] Images load properly
  - [ ] CSS styling applied correctly

---

## Launch Day Verification (First 30 Minutes)

### Functional Testing
- [ ] **Page Content**
  - [ ] All sections present (Introduction, Data Collection, Usage, Rights, etc.)
  - [ ] Headings render with correct hierarchy
  - [ ] Paragraphs and lists format correctly
  - [ ] Tables display properly (compliance mapping)
  - [ ] Emphasis (bold, italic) renders correctly

- [ ] **Links & Navigation**
  - [ ] Footer link to /privacy works from homepage
  - [ ] Footer link from privacy page works
  - [ ] Email link `privacy@manuva.app` functions (opens mail client)
  - [ ] External links open in new tab
  - [ ] No 404 errors on page

- [ ] **Mobile & Desktop**
  - [ ] Desktop view (1920px) - no layout issues
  - [ ] Tablet view (768px) - readable and organized
  - [ ] Mobile view (375px) - fully accessible, no horizontal scroll
  - [ ] Touch interactions work on mobile
  - [ ] Text readable without zoom

### Performance & Error Monitoring
- [ ] **Analytics & Monitoring**
  - [ ] Page view analytics begin recording
  - [ ] Performance metrics visible in Vercel Analytics
  - [ ] Error monitoring active (Sentry or equivalent)
  - [ ] No JavaScript errors reported

- [ ] **Search Engine Verification**
  - [ ] Page is crawlable by search engines
  - [ ] Robots.txt allows /privacy route
  - [ ] Sitemap includes privacy page
  - [ ] Google Search Console shows page indexed (may take 24-48 hours)

---

## Post-Launch Monitoring (First 24 Hours)

### Error & Performance Monitoring
- [ ] **Day 1 - Error Log Review**
  - [ ] Check error logs: Last 24 hours
  - [ ] Any 500 errors on /privacy route? ___________
  - [ ] Any 404 errors? ___________
  - [ ] JavaScript console errors? ___________
  - [ ] Browser compatibility issues reported? ___________

- [ ] **Performance Metrics (First 24 Hours)**
  - [ ] Average page load time: __________ ms
  - [ ] P95 page load time: __________ ms
  - [ ] Core Web Vitals:
    - [ ] LCP: __________ ms (target < 2500ms)
    - [ ] FID: __________ ms (target < 100ms)
    - [ ] CLS: __________ (target < 0.1)
  - [ ] Bounce rate on privacy page: __________ %

- [ ] **Link Verification (24 Hours Later)**
  - [ ] All internal links still functional
  - [ ] Email link working correctly
  - [ ] External links accessible
  - [ ] No new 404 errors

### User Accessibility Monitoring
- [ ] **User Feedback (First Week)**
  - [ ] No complaints about page layout or readability
  - [ ] No accessibility issues reported
  - [ ] Mobile users able to access content
  - [ ] Screen reader users report positive experience

---

## User Communication (Timeline: Before/After Launch)

### Pre-Launch Notification (Optional - 7 Days Before)
- [ ] **Internal Team Notification**
  - [ ] Engineering team aware of launch
  - [ ] Support team briefed on privacy policy
  - [ ] Sales/Marketing aware of public availability

### Launch Day Announcement (Optional)
- [ ] **Public Announcement**
  - [ ] Blog post scheduled: ___________
  - [ ] Email announcement sent to: ___________
  - [ ] Social media post scheduled: ___________
  - [ ] In-app notification published: ___________
  - [ ] Announcement content reviewed by legal
  - [ ] Announcement scheduled time: ___________

### Post-Launch Follow-up (Optional - Days 1-7)
- [ ] **Monitoring Public Response**
  - [ ] Email support monitoring privacy@manuva.app
  - [ ] Support tickets categorized and tracked
  - [ ] Any privacy concerns documented
  - [ ] Legal team review of inquiries: ___________

---

## Rollback Plan

### When to Rollback
Rollback should be initiated if any of the following occur:
- Critical page rendering errors preventing content access
- Security vulnerability discovered in deployed code
- Privacy content violations identified after launch
- Performance degradation affecting site stability
- Accessibility issues preventing user access

### Rollback Steps
1. **Identify the Issue**
   - Document the problem in detail
   - Screenshot/log error messages
   - Time of detection: ___________
   - Severity level: Critical / High / Medium

2. **Notify Team**
   - Slack channel: #engineering
   - Escalate to: ___________
   - Contact legal if content-related

3. **Execute Rollback**
   - Option A (Recommended): Revert last commit on main branch
     - Run: `git revert [commit-hash]`
     - Push to main
     - Vercel auto-deploys previous version
   - Option B: Manual Rollback
     - Navigate to Vercel Dashboard
     - Select previous successful deployment
     - Click "Promote to Production"

4. **Post-Rollback**
   - Verify /privacy route serves previous version
   - Document what went wrong
   - Root cause analysis
   - Fix issues in feature branch
   - Re-deploy after verification

### Escalation Contacts
- **Engineering Lead:** ___________
- **Legal/Compliance:** ___________
- **Operations/DevOps:** ___________

---

## Sign-off

### Deployment Approval
- [ ] **QA Lead Sign-off**
  - Name: ___________
  - Date: ___________
  - Status: Approved / Conditional / Not Approved

- [ ] **Legal/Compliance Sign-off**
  - Name: ___________
  - Date: ___________
  - Status: Approved / Conditional / Not Approved

- [ ] **Product Manager Sign-off**
  - Name: ___________
  - Date: ___________
  - Status: Approved / Conditional / Not Approved

### Deployment Execution
- [ ] **Deployed By:** ___________
- [ ] **Deployment Date:** ___________
- [ ] **Deployment Time:** ___________
- [ ] **Deployment Status:** ✓ Success / ✗ Failed
- [ ] **Notes:** ___________

---

## Related Documents
- `docs/PRIVACY_POLICY_MAINTENANCE.md` - Future maintenance and updates
- `public/docs/privacy-policy.md` - Privacy policy source content
- `src/app/privacy/page.tsx` - Next.js page component
- `src/app/privacy/page.module.css` - Page styling

---

## Deployment History

| Version | Date | Deployed By | Status | Notes |
|---------|------|-------------|--------|-------|
| 1.0 | TBD | TBD | Pending | Initial privacy policy launch |

