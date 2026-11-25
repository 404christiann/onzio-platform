# docs

Internal ops docs live in the private `onzio-ops` repo: `HANDOFF.md`, every
`STATUS.md` / `DECISIONS.md`, rollback and operator SQL, runbooks, handoffs and
verification screenshots. They keep the same paths there. Clone it next to this
repo as `../onzio-ops`; tests that read operator or rollback SQL use it when
present (or `ONZIO_OPS_DIR`) and skip otherwise.
