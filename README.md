# Onzio Platform

Onzio is a secure multi-tenant club website platform built from the production
Rose City FC application.

The repository is contract-first. Phases 1–6 are implemented: database/RLS,
atomic tenant conversion, secure media, authentication/operator workflows, and
tenant-aware Stripe billing. The protected staging gate is next. Only the
later Rose City migration contracts remain intentionally red.

Start with:

1. `AGENTS.md`
2. `HANDOFF.md`
3. `docs/onzio-platform-plan.md`
4. `tests/README.md`
5. `docs/phase-1/rose-city-source-inventory.md`
6. `docs/phase-1/access-matrix.md`
7. `docs/phase-1/threat-model.md`
8. `docs/local-development.md`
9. `docs/phase-7/staging-gate.md` when executing the protected staging gate

Common commands:

```bash
npm install
npm run test:legacy
npx tsc --noEmit
npm run test:contracts
npm run test:architecture
npm run test:db
npm test
npm run lint
npm run build
```

Only contracts assigned to later delivery phases are expected to remain red.
Rose City's legacy regression suite and the completed phase gates must remain
green.
