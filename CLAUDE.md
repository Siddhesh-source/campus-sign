# CampusSign

Document signing and academic workflow platform for VIT Pune. Faculty create classes with join codes, students join and submit academic documents, faculty review and digitally sign them, and a permissioned blockchain keeps a tamper-evident record of approvals.

Roles: **student**, **faculty**, **administrator**. Role comes from verified permissions, never user choice.

Product bar: premium, modern SaaS with its own distinct visual identity — not a college portal, not a template. Design must stay consistent across every phase. `DESIGN.md` is the source of truth for the design system; read it before any UI work.

## gstack workflow (required for this project)

gstack is installed at `~/.claude/skills/gstack`. Use these skills at these points:

| When | Skill |
|---|---|
| Any UI decision (new screen, layout, component direction) | `/design-shotgun` to explore variants, then lock the choice |
| Design system / visual identity changes | `/design-consultation` (writes `DESIGN.md`) |
| After building UI | `/design-review` (live visual QA + fixes) |
| Product scope / overall decisions while building a spec | `/plan-ceo-review` |
| Engineering plan for each phase | `/plan-eng-review` — single pass |
| Bugs / failing builds | `/investigate` |
| Before merging | `/review`; security-sensitive changes also `/cso` |
| Web browsing | `/browse` (never `mcp__claude-in-chrome__*`) |

## Design System
Read DESIGN.md before visual or UI work: it defines the fonts, colors, spacing, and
aesthetic direction. Ask the user before departing from it. When reviewing or QA-ing
UI, flag code that doesn't match DESIGN.md.

## Git rules (strict)

- All commits and pushes use the repo owner's own git identity (`git config user.name` / `user.email`, currently Siddhesh-source) and their gh/SSH credentials. Never override author or committer.
- **No AI attribution anywhere**: no `Co-Authored-By: Claude` lines, no "Generated with Claude Code" footers, no watermarks in commits, PRs, code comments, or the UI.
- Remote: `origin` → `github.com/Siddhesh-source/campus-sign`.
