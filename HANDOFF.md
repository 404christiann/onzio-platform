## 2026-11-09 - ADMIN-RE-07c database checks on game text and scores

- **Status:** `in_progress` on branch `claude/admin-re-07c-matches-checks`
  from `main` `a85ce6b`, PR open. **Migration**
  `20261109120000_matches_text_and_score_checks.sql`, so `GATE-MIGRATE`.
  It tightens constraints, so the bot hands it to Christian first.
- **Why it's safe:** Christian's read-only production query (2026-11-09)
  found 0 of 8 games over any limit and no score over 99.
- **What it adds:** CHECKs on `onzio.matches` for the seven text limits and
  scores ≤ 99; the Zod limits now hold on edits too, and the classic Games
  edit form caps its inputs.
- **Exact next step:** Christian's go, then the bot backs up, dry-runs,
  applies and merges. RE-10 after that, on Christian's go.

