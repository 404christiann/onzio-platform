# Guided admin reference

Christian selected **B — Guided** on 2026-10-11. `directions.html` is the exact
standalone A/B comparison that was reviewed. Choose B in its direction control.
It includes Dashboard, Roster, and a simplified Homepage editor at desktop and
phone widths, with sample-only interactions.

This is a design artifact. It does not contact Supabase/Stripe or call
application APIs. The actual implementation must preserve the complete field,
route, theme, dashboard, save, recovery, and authorization contracts described
in `docs/admin-guided-redesign-plan.md`; do not copy its fictional content into
application source.

Serve the archived comparison from this worktree:

```bash
python3 -m http.server 8768 --bind 127.0.0.1 --directory design-previews/admin-guided-redesign
```

Open `http://127.0.0.1:8768/directions.html`. The original comparison server
uses port 8767. Assets and icons are embedded; no external dependency or network
connection is required. Switching direction or using the screen selector
reloads the sample frames and resets their session edits.

The preview uses the existing Lucide drawings. Application integration will
use the icon-update chat's approved icon module and mappings when ready.
See the Guided plan's coordination section.
