# Privacy Policy Maintenance Guide

**Document Version:** 1.0  
**Created:** 12 May 2026  
**Last Updated:** 12 May 2026

## Overview

This guide outlines procedures for maintaining and updating the Manuva Privacy Policy. It covers processes for minor updates, major revisions, legal reviews, user communication, and version control.

### Key Resources
- **Privacy Policy Content:** `public/docs/privacy-policy.md`
- **Privacy Page Component:** `src/app/privacy/page.tsx`
- **Privacy Page Styles:** `src/app/privacy/page.module.css`
- **Maintenance Log:** This document (version history table at end)
- **Deployment Guide:** `docs/PRIVACY_POLICY_DEPLOYMENT.md`

---

## Update Categories & Procedures

### Category 1: Typos and Formatting Fixes

**Scope:** Spelling errors, punctuation, grammar, or formatting issues that don't change meaning.

**Example Changes:**
- "privicy" → "privacy"
- Fix inconsistent spacing around punctuation
- Correct capitalization errors
- Fix markdown formatting (bold, italics, lists)

**Process:**

1. **Make the Fix**
   - Edit `public/docs/privacy-policy.md`
   - Do NOT change version number
   - Do NOT notify legal team

2. **Local Testing**
   - Run development server: `npm run dev`
   - Navigate to http://localhost:3000/privacy
   - Verify fix renders correctly
   - No console errors
   - No layout changes

3. **Commit**
   ```bash
   git add public/docs/privacy-policy.md
   git commit -m "docs(privacy): fix typo in section [X]"
   git push origin main
   ```

4. **Deployment**
   - Vercel auto-deploys on push to main
   - Verify at https://manuva.app/privacy
   - Takes ~2-3 minutes

5. **No User Communication Required**
   - No version number change
   - No changelog entry

**Timeline:** Same-day deployment typical

---

### Category 2: Clarifications & Minor Wording Updates

**Scope:** Changes that clarify existing statements without introducing new policies or features.

**Example Changes:**
- Reword a section for clarity
- Add clarifying examples (keeping the same policy)
- Better organize existing information
- Improve readability of a sentence

**Process:**

1. **Propose the Change**
   - Create feature branch: `git checkout -b privacy/clarification-[description]`
   - Edit `public/docs/privacy-policy.md`
   - Do NOT change version number yet

2. **Local Verification**
   - Run: `npm run dev`
   - Test at http://localhost:3000/privacy
   - Ensure no layout shifts
   - Check readability on mobile

3. **Legal Review** (Optional - if major clarification)
   - Contact legal if substantive clarification
   - Email: Send markdown diff to legal team
   - Turnaround: 2-3 business days
   - Get written approval before merging

4. **Merge**
   - Create Pull Request with description
   - Link to any legal approval email
   - Merge to main after approval
   - Delete feature branch

5. **Commit Message**
   ```bash
   git commit -m "docs(privacy): clarify [section name] - [brief description]"
   ```

6. **Deployment**
   - Vercel auto-deploys
   - Monitor for 24 hours

7. **User Communication**
   - No user notification required
   - Optional: Blog post if clarification is significant

**Timeline:** 3-5 business days (including legal review if needed)

---

### Category 3: Contact Information Updates

**Scope:** Changes to phone number, email, address, ABN, or other contact details.

**Process:**

1. **Verification**
   - [ ] Contact information verified with legal/admin team
   - [ ] Updated information provided in writing
   - [ ] Contact: ___________
   - [ ] Verified date: ___________

2. **Make the Change**
   - Edit `public/docs/privacy-policy.md`
   - Update ONLY the contact section
   - Do NOT increment version number

3. **Review**
   - Have another team member verify the contact info
   - Reviewer: ___________
   - Date reviewed: ___________

4. **Commit**
   ```bash
   git add public/docs/privacy-policy.md
   git commit -m "docs(privacy): update contact information"
   ```

5. **Deployment & Verification**
   - Push to main (auto-deploys via Vercel)
   - Verify contact info on live site

**Timeline:** Same day deployment (after verification)

---

### Category 4: Major Content Updates

**Scope:** New sections, substantive policy changes, new features affecting privacy, or significant rewording.

**Example Changes:**
- Add new data collection category (e.g., "Customer data collection section when feature launches")
- Change data retention policy
- Add new third-party integrations
- Update handling of GDPR/CCPA/international regulations
- Major restructuring of existing policy

**Process:**

1. **Plan the Change**
   - Create detailed specification of changes
   - Document "why" this change is needed
   - Document "what" is changing
   - Link to feature launch or compliance requirement
   - Timeline: 1-2 weeks planning before implementation

2. **Create Feature Branch**
   ```bash
   git checkout -b privacy/[change-type]-[description]
   ```

3. **Draft Content**
   - Edit `public/docs/privacy-policy.md`
   - Increment minor version: v1.0 → v1.1
   - Update "Last Updated" timestamp
   - Update "Effective Date" if substantive change

4. **Prepare for Legal Review**
   - Export the markdown as HTML or PDF
   - Create a change summary document:
     - What changed
     - Why it changed
     - Impact on users
     - Compliance implications
   - Compile diff: `git diff public/docs/privacy-policy.md`

5. **Legal Review** (MANDATORY)
   - Send to legal team with:
     - Full updated policy
     - Change summary
     - Diff showing changes
     - Timeline for launch
   - Turnaround: 5-10 business days
   - May require multiple review rounds
   - Get written legal sign-off

6. **Incorporate Legal Feedback**
   - Address legal team comments
   - Make revisions in feature branch
   - Re-submit if significant changes
   - Repeat until approved

7. **Prepare Launch Communication**
   - Draft email to users (if required)
   - Draft in-app notification message
   - Get legal approval on communication
   - Plan notification timing

8. **Create Pull Request**
   - Include legal sign-off approval in PR description
   - Add link to change summary
   - PR title: "docs(privacy): [major change description]"
   - Require review from tech lead + legal representative

9. **Merge**
   - All reviews approved
   - Merge to `main` branch
   - Delete feature branch

10. **Schedule Launch**
    - Target deployment date: ___________
    - Ensure legal can support if questions arise
    - Coordinate with marketing/support if needed

11. **User Communication** (Before or on launch date)
    - Send email notification: TBD
    - Publish in-app notification: TBD
    - Consider 30-day notice for major changes
    - Include link to updated policy
    - Explain what changed and why

12. **Deploy & Monitor**
    - Push to main (triggers Vercel deployment)
    - Verify page at https://manuva.app/privacy
    - Monitor error logs for 48 hours
    - Monitor support tickets for questions
    - Document in version history (see below)

**Timeline:** 4-6 weeks (planning + legal review + communication + deployment)

---

## Legal Review Requirements

### When Legal Review Is Required
- [ ] Any change to what data is collected
- [ ] Any change to how data is used
- [ ] Any change to data retention or deletion
- [ ] New third-party integrations or data sharing
- [ ] Changes to user rights or choices
- [ ] Updates to compliance statements
- [ ] Major rewording of existing policies
- [ ] Effective date change

### When Legal Review Is Optional
- [ ] Typos and grammar fixes
- [ ] Reformatting or reorganization (no content change)
- [ ] Contact information updates
- [ ] Minor clarifications of existing policy

### Legal Review Process
1. **Prepare Documentation**
   - Full updated policy
   - Change summary (what's different)
   - Rationale for changes
   - Compliance implications

2. **Submit for Review**
   - Email to: [Legal contact email]
   - Subject: "Privacy Policy Update Review - v[X.X]"
   - Attach policy and change summary
   - Specify deadline for review

3. **Review Turnaround**
   - Minor clarifications: 2-3 business days
   - Major changes: 5-10 business days
   - Urgent updates: can be expedited (discuss with legal)

4. **Incorporate Feedback**
   - Address all legal comments
   - Ask for clarification if needed
   - Re-submit revised version if substantive feedback
   - Continue until legal approves

5. **Get Written Approval**
   - Legal provides written approval email
   - Approval must include sign-off on specific version
   - Save approval email for compliance record

---

## Version Control & Numbering

### Version Number Format
- Format: `X.Y` (major.minor)
- Current version: `1.0`
- Starting point: `1.0` (launched May 12, 2026)

### When to Increment Versions

**Increment MAJOR (X.0 → 2.0):**
- Fundamental restructuring of privacy policy
- Complete rewrite
- Major shift in company privacy practices
- Transition to entirely new compliance framework
- Estimated: Every 2-5+ years

**Increment MINOR (X.Y → X.(Y+1)):**
- New data collection category
- New third-party integration
- Change to data retention policy
- New user rights or controls
- New compliance obligations
- Estimated: Every 3-6 months (depending on product changes)

**No Version Change:**
- Typos and grammar
- Formatting improvements
- Contact information updates
- Minor clarifications

---

## Scheduled Review Calendar

### Quarterly Reviews (Every 3 Months)
**Timing:** First week of Q2, Q3, Q4, Q1 (Jan, Apr, Jul, Oct)

**Checklist:**
- [ ] Verify all contact information is still accurate
- [ ] Check all external links for 404 errors
- [ ] Verify integrations listed (Shopify, Stripe, Xero) are still current
- [ ] Confirm no product features are missing from policy
- [ ] Check for any typos or formatting issues
- [ ] Review analytics: is /privacy page getting traffic?
- [ ] Review support tickets: any privacy questions?
- [ ] Document findings

**If Issues Found:**
- Fix typos immediately (no legal review needed)
- Contact information changes: update same day
- Missing features: escalate to legal for policy review
- Create GitHub issue if substantial changes needed

### Annual Review (Every Year)
**Timing:** May 12 (anniversary of initial launch)

**Checklist:**
- [ ] Full compliance audit with legal team
- [ ] Review all regulatory changes since last update
- [ ] Assess any new data collection practices
- [ ] Review third-party integrations and data handling
- [ ] Get explicit legal sign-off on current policy
- [ ] Document review findings
- [ ] Plan any necessary updates for next quarter

**Output:**
- Legal sign-off email (save for compliance records)
- List of any changes needed
- Timeline for implementing changes

---

## Planned Updates & Roadmap

These updates are anticipated based on product roadmap and compliance needs:

| Version | Target Date | Change Description | Status | Notes |
|---------|-------------|-------------------|--------|-------|
| 1.0 | 12 May 2026 | Initial privacy policy (MVP launch) | Complete | Launched with app |
| 1.1 | Q3 2026 (Jul-Sep) | Add customer data collection section | Planned | When customer data features launch |
| 1.2 | Q4 2026 (Oct-Dec) | Add Xero integration details | Planned | When Xero integration releases |
| 1.3 | Q1 2027 | Regional variations (GDPR, CCPA) | Planned | If expanding to EU/US markets |
| 1.4 | Q2 2027 | Update audit logging section | Planned | As audit features expand |
| 2.0 | 2027+ | Complete restructure/rewrite | TBD | Timing depends on major policy changes |

---

## User Communication Templates

### Email Notification Template (Major Changes)

Subject: Important Update to Manuva Privacy Policy

```
Dear Manuva User,

We're writing to inform you of an important update to our Privacy Policy, 
effective [DATE].

WHAT CHANGED:
[2-3 sentences explaining changes in simple language]

WHY WE MADE THIS CHANGE:
[1-2 sentences explaining reason]

WHAT THIS MEANS FOR YOU:
[Bullet points of user impact, if any]

REVIEW THE UPDATED POLICY:
[Link to /privacy page]

If you have any questions about these changes, please contact us at:
privacy@manuva.app

Thank you for using Manuva.

Best regards,
Manuva Team
```

### In-App Notification Template (Major Changes)

```
Privacy Policy Updated

We've updated our Privacy Policy. Please review the changes.

[Learn More] [Dismiss]
```

### Blog Post Template (Significant Changes)

```
# Privacy Policy Update: [Change Title]

We're committed to transparency about how we handle your data. 
Today we're announcing an update to our privacy policy.

## What's Changed
[2-3 paragraphs explaining changes]

## Why This Matters
[1-2 paragraphs on compliance/user benefit]

## What You Need to Know
[Bullet points of action items, if any]

[Link to updated policy]

Questions? Email us at privacy@manuva.app
```

---

## Troubleshooting & Common Scenarios

### Scenario 1: Grammar/Typo Found After Launch
**Action:** Fix immediately (Category 1)
- Edit file
- Commit with message: "docs(privacy): fix typo in [section]"
- Deploy same day
- No legal review needed
- No user notification

### Scenario 2: Contact Information Changes
**Action:** Update immediately (Category 3)
- Verify new contact info
- Edit file
- Commit with message: "docs(privacy): update contact information"
- Deploy same day
- No version increment
- No legal review if info is just administrative

### Scenario 3: New Feature Affects Privacy
**Action:** Major update process (Category 4)
- Feature team must notify privacy owner
- Legal review required
- Version increment (v1.0 → v1.1)
- User communication may be needed
- 4-6 week timeline

### Scenario 4: Legal/Compliance Issue Discovered
**Action:** Urgent review and update
- Immediately notify legal team
- Assess severity and urgency
- Pull problem content if critical
- Expedited legal review
- Potential emergency rollback

### Scenario 5: User Questions About Privacy Policy
**Action:** Document and escalate if needed
- Support team logs question
- Provide links to relevant policy section
- If question reveals policy gap: escalate to product/legal
- Use feedback for next quarterly review

---

## Role Assignments

| Role | Responsibility | Contact |
|------|-----------------|---------|
| **Privacy Owner** | Oversees all updates and maintains schedule | TBD |
| **Legal/Compliance** | Reviews major changes and provides approval | TBD |
| **Engineering Lead** | Reviews technical aspects, manages deployment | TBD |
| **Product Manager** | Notifies of feature changes that affect privacy | TBD |
| **Support Team** | Collects user questions, escalates concerns | TBD |

---

## Tools & Resources

### Essential Commands
```bash
# View changes to privacy policy
git diff public/docs/privacy-policy.md

# Create feature branch for update
git checkout -b privacy/[your-branch-name]

# Run local development server
npm run dev

# Build for production
npm run build

# View deployment history
# Go to: https://vercel.com/[project-name]/deployments
```

### File Locations
- Policy content: `public/docs/privacy-policy.md`
- Page component: `src/app/privacy/page.tsx`
- Page styles: `src/app/privacy/page.module.css`
- Deployment guide: `docs/PRIVACY_POLICY_DEPLOYMENT.md`
- This guide: `docs/PRIVACY_POLICY_MAINTENANCE.md`

### Compliance Resources
- **Australian Privacy Principles (APPs):** https://www.oaic.gov.au/privacy/the-privacy-act/australian-privacy-principles
- **Privacy Act 1988 (Cth):** https://www.legislation.gov.au/C2012A00197/latest/text
- **OAIC Website:** https://www.oaic.gov.au/
- **Our Compliance Mapping:** See Section 8 of privacy policy

---

## Version History

| Version | Date | Changes | Status | Changed By |
|---------|------|---------|--------|------------|
| 1.0 | 12 May 2026 | Initial privacy policy (MVP launch) | Live | Kasper |
| 1.1 | TBD | [Planned] Add customer data collection section | Planned | TBD |
| 1.2 | TBD | [Planned] Add Xero integration details | Planned | TBD |
| 1.3 | TBD | [Planned] Regional variations (GDPR, CCPA) | Planned | TBD |

---

## Document Revision History

This maintenance guide itself is versioned:

| Version | Date | Changes | Updated By |
|---------|------|---------|------------|
| 1.0 | 12 May 2026 | Initial maintenance guide | Kasper |

---

## Related Documents
- `docs/PRIVACY_POLICY_DEPLOYMENT.md` - Deployment and launch checklist
- `public/docs/privacy-policy.md` - Privacy policy source content
- `src/app/privacy/page.tsx` - Next.js page component
- `src/app/privacy/page.module.css` - Page styling

