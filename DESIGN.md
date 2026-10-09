
---
# gstack: design-md-format=spec
name: CampusSign
description: Security-print precision — ink on bond paper, serial-number type, and fine-line guilloché that appears only where something is being proven.
colors:
  paper: "#F4F5F1"
  surface: "#FFFFFF"
  sunken: "#ECEEE8"
  text: "#0F1A17"
  text-secondary: "#2B3632"
  text-muted: "#5B6662"
  text-faint: "#8A948F"
  rule: "#DADDD6"
  rule-strong: "#C3C8BF"
  primary: "#0E5A4A"
  primary-hover: "#0A4739"
  primary-tint: "#E3EEE9"
  primary-ink: "#0B4A3D"
  on-primary: "#F4F5F1"
  success: "#0E5A4A"
  warning: "#B54708"
  warning-tint: "#FDF1E3"
  error: "#B42318"
  error-tint: "#FBE9E7"
  dark-paper: "#0C1311"
  dark-surface: "#121B18"
  dark-sunken: "#0F1714"
  dark-text: "#E8ECE7"
  dark-text-secondary: "#C9D0CB"
  dark-text-muted: "#93A09A"
  dark-text-faint: "#6B7772"
  dark-rule: "#22302B"
  dark-rule-strong: "#2F3F39"
  dark-primary: "#4CC4A0"
  dark-primary-hover: "#6DD3B3"
  dark-primary-tint: "#14302A"
  dark-primary-ink: "#7FD9BC"
  dark-on-primary: "#06110E"
  dark-warning: "#F5A35C"
  dark-warning-tint: "#3A2510"
  dark-error: "#F97066"
  dark-error-tint: "#3A1714"
typography:
  display:
    fontFamily: Cabinet Grotesk
    fontWeight: 800
    fontSize: clamp(2.6rem, 5.2vw, 4.25rem)
    lineHeight: 0.98
    letterSpacing: -0.035em
  heading:
    fontFamily: Cabinet Grotesk
    fontWeight: 700
    fontSize: 1.75rem
    lineHeight: 1.1
    letterSpacing: -0.02em
  page-title:
    fontFamily: Cabinet Grotesk
    fontWeight: 800
    fontSize: 1.875rem
    lineHeight: 1.05
    letterSpacing: -0.025em
  body:
    fontFamily: General Sans
    fontWeight: 400
    fontSize: 0.9375rem
    lineHeight: 1.55
  body-lg:
    fontFamily: General Sans
    fontWeight: 400
    fontSize: 1.0625rem
    lineHeight: 1.55
  label:
    fontFamily: General Sans
    fontWeight: 600
    fontSize: 0.75rem
    letterSpacing: 0.04em
  mono:
    fontFamily: JetBrains Mono
    fontWeight: 500
    fontFeature: tnum, zero
  micro:
    fontFamily: JetBrains Mono
    fontWeight: 500
    fontSize: 0.65625rem
    letterSpacing: 0.08em
rounded:
  sm: 2px
  md: 4px
  lg: 6px
  phone: 28px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
  3xl: 64px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    borderColor: "{colors.rule-strong}"
    rounded: "{rounded.md}"
  button-danger:
    textColor: "{colors.error}"
    rounded: "{rounded.md}"
  input:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.rule-strong}"
    rounded: "{rounded.md}"
  verified-badge:
    backgroundColor: "{colors.primary-tint}"
    textColor: "{colors.primary-ink}"
    rounded: "{rounded.sm}"
  code-certificate:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.rule}"
    rounded: "{rounded.lg}"
  nav-link:
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.md}"
---

# CampusSign

## Overview

**Creative North Star:** "Every signature is provable." CampusSign borrows its visual language from the documents people already trust, like passports, certificates and banknotes, and executes it with modern SaaS precision. It must never look like a college portal or a DocuSign clone.
**Product context:** Document signing and academic workflow for VIT Pune. Students (often on phones, in class) join classes with codes and later submit forms; faculty (laptops) review, approve and sign; admins approve faculty and read the audit log. Peers: DocuSign, Adobe Sign, Google Classroom.
**Mode per surface:**
- **Operate:** dashboards, class detail, approvals, audit log. This is most of the product.
- **Persuade:** the sign-in page only.
- **Experience:** the join/sign confirmation moment.
**Reference sites:** docusign.com, edu.google.com/workspace-for-education/classroom, linear.app, mercury.com, stripe.com (researched 2026-10-09; we depart from their violet/blue trust gradients).
**Key characteristics:**
- Bond-paper ground, green-black ink, one committed green.
- Class codes, emails, timestamps and IDs in mono, set like serial numbers.
- Fine-line guilloché appears only on surfaces that prove something.
- Hairline-ruled ledgers instead of stacked rounded cards.
- Near-square corners that read as official, not bubbly.

## Colors

**Strategy:** Committed. Ledger green (`primary`) is the only chromatic color in normal use. It covers primary actions, verified marks, the guilloché, and the active nav indicator. Neutrals are tinted toward green so paper and ink read as one material. `warning` and `error` appear only when something is actually wrong. `success` is the same green, because "verified" and "done" are the same idea here.
**Light or dark:** Light is the default. Students use the app in daylit classrooms and corridors, and faculty in offices. Dark is fully supported via `[data-theme="dark"]` and `prefers-color-scheme`. Dark surfaces keep hierarchy by stepping paper → sunken → surface upward in lightness, and the green lifts to `dark-primary` for contrast. It is not a straight inversion.
**Contrast:** text on paper ≥ 15:1; text-muted on surface ≥ 5.5:1; on-primary on primary ≥ 7:1. Never put text-faint on body copy; it is for disabled and tertiary metadata only.

## Typography

The source world is official documents. **Cabinet Grotesk** (Fontshare, ITF Free Font License) is the display voice: tight tracking, real weight contrast against body, used for page titles and headings only. **General Sans** (Fontshare) handles every working surface: body, labels, buttons, tables. **JetBrains Mono** (Google Fonts, OFL) is reserved for anything that identifies a record: class codes, emails in tables, timestamps, IDs, hashes, seat counts. Rule of thumb: if it could be printed on a certificate as a serial number, it's mono.

Loading: self-host woff2 via `next/font/local` (Cabinet Grotesk 700/800, General Sans 400/500/600), and load JetBrains Mono 400/500/600 via `next/font/google`. Use `font-display: swap`. Scale: page-title 30px, heading 28px, body 15px, label 12px caps. Each level differs by size and weight, never weight alone. Micro labels (10.5px mono caps, +0.08em) only sit above certificate-style content.

## Layout

- **Faculty/admin:** a 216px left rail (wordmark, nav with mono counts, signed-in identity at the bottom) plus a main column with 32px padding. Class detail uses a split of `minmax(0,1fr) 340px`, with the code certificate in the right column.
- **Student:** phone-first single column, max 480px, centered on desktop. Multi-step flows (join) get a sticky bottom action bar with a full-width primary button and step counter `1 / 3` in micro mono.
- **Breakpoints:** 640 (phone), 900 (rail collapses to a top bar with a menu), 1100 (split stacks).
- **Spacing:** 4px base. Section rhythm is 64px, and in-page groups use 24–32px. Tables use 12px cell padding.
- Max content width is 1180px.

## Elevation & Depth

Depth is mostly hairlines (`rule`) and paper/surface contrast. Two shadows only:
- `shadow-1`: `0 1px 2px rgba(15,26,23,.06), 0 1px 1px rgba(15,26,23,.04)`, for resting cards.
- `shadow-2`: `0 8px 24px -8px rgba(15,26,23,.18), 0 2px 4px rgba(15,26,23,.06)`, for the code certificate, popovers and dialogs.

There are no zero-offset glows and no frosted glass.

## Shapes

- **Radii:** `sm` 2px (badges, status), `md` 4px (buttons, inputs, nav items), `lg` 6px (certificate, panels, dialogs). The phone frame radius exists only in marketing previews.
- **Nesting:** inner radius = outer radius − gap. Never nest cards.

## Components

- **Buttons:** primary (solid green), secondary (surface + rule-strong border), ghost (text, sunken hover), danger (error text + 35% error border, error-tint hover). The pressed state is a 1px translateY. Focus-visible is a 2px green outline with 2px offset. Disabled is 45% opacity with `not-allowed`, and a pending action shows a progressive label ("Joining…"). There are no gradient buttons, and each view gets one primary.
- **Code certificate:** the hero of class detail. It has a micro label, class/division/year title, and faculty name. The code is large mono with the secret segment on a green-tint underline highlight. A dashed rule separates the meta row (expiry, seats, mode in mono caps), followed by actions: Copy (primary), Rotate (secondary), Set expiry (ghost), Revoke (danger). The background carries the band guilloché at 16% and the rosette at 22%.
- **Verified badge:** a 16-point seal icon plus "Verified faculty" on primary-tint. Use it only for faculty whose approval is real.
- **Status:** a 7px dot plus a label. Active = primary, Pending = warning, Rejected = error, Revoked/Expired = text-faint. Never use colored side stripes.
- **Tables (ledger):** uppercase 11.5px labels in the header, hairline row rules, mono for emails/timestamps, and right-aligned actions. Rows highlight on hover. On mobile, secondary columns hide (`hide-sm`).
- **Inputs:** visible label (600, 13.5px), hint line (muted 12.5px), and error line (error color with icon). Use `aria-invalid` for the error border. Code inputs are mono, uppercase and letter-spaced, and accept any case, spacing or dashes.
- **Notices:** a tinted block with an icon and a bold first sentence. Variants are ok (primary-tint), warn and error.
- **Nav rail item:** the active item gets a sunken background plus an inset 2px green line on the left edge of the item. This is the only allowed accent edge, because it marks position, not a card.
- **Empty states:** one sentence saying what will appear here, plus the action that creates it. No illustrations, no mascots.
- **Loading:** skeleton rows matching the final table geometry. Never block the page with a spinner.

## Guilloché (signature texture)

Generated from real parametric curves: hypotrochoid rosettes and interlaced sine bands. It is rendered as an SVG component with `stroke="currentColor"` in `primary`.
- **Allowed surfaces:** code certificate, class preview card in the join flow, the sign-in brand panel, the confirmation seal, and later the signature certificate and verification pages.
- **Opacity:** 10–22% on surface, and 16% of on-primary on the green panel.
- **Never:** page backgrounds, dashboards, tables, buttons, or decoration on empty space. If a screen isn't proving something, it gets no guilloché.

## Do's and Don'ts

- Do: put every class code, email-in-table, timestamp and ID in JetBrains Mono.
- Do: show who verified something (verified faculty badge + name + email) before any irreversible confirm.
- Do: design empty, loading, error and full/locked states for every screen.
- Do: write copy that says what happened and what to do next ("This code no longer works. Ask Prof. Kulkarni for the current one.").
- Do: keep one primary button per view.
- Don't: purple/violet/indigo anywhere, or blue-to-purple gradients (the e-sign category default).
- Don't: rounded cards with drop shadows as the default container, cards inside cards, or three identical feature tiles.
- Don't: icons in colored circles, emoji, illustrations or stock photos.
- Don't: guilloché as wallpaper.
- Don't: use "seamless", "effortless" or "unlock" in copy.

## Motion

- **Approach:** minimal-functional.
- **Easing:** enter `cubic-bezier(.2,.8,.2,1)`, exit `ease-in`, move `ease-in-out`.
- **Duration:** micro 100ms (hover/press), short 150–200ms (tabs, toasts), medium 250–320ms (dialogs, the seal).
- **The one authored moment:** when a join request, enrollment or (later) signature is confirmed, the seal stamps in. It scales 1.08 → 1 at −6° rotation, fading in from a 1px blur over 320ms, with a mono receipt line underneath (ID, timestamp, actor). With `prefers-reduced-motion`, it appears without animation.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-10-09 | Initial design system created | Created by /design-consultation. Anchor "Every signature is provable"; research showed the category owns violet/blue trust gradients, so we went with the security-print direction instead. User approved the proposal and the HTML preview. |
