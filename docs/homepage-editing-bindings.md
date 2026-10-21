# Homepage editing bindings

Homepage bindings describe which content an editor piece controls. The installed
contract lives in `lib/homepage-editor/capabilities.ts`, beside the explicit
legacy renderer adapter. The editor hook consumes its element keys for preview
selection. Public and preview pages continue to use the same renderer.

## Ownership and compatibility

Local bindings identify fields in the homepage save model. A heading controls
both hero headline lines. Story text and its CTA share the story visibility
control. Photos identify the ordered collection and, where supported, its season
label. Video bindings cover copy and visibility, never the separately supplied
video source. Shared bindings identify the About, Shop, or Programs editor that
owns the content. Shop ownership includes the content surface and kit variants.

An absent binding means the normal homepage editor does not expose that piece.
It does not establish whether content exists, renders publicly, or can be
maintained by an authorized member. Bindings are not permissions.

A binding is identified by the contract key and element key. The contract has a
positive semantic revision. `sameHomepageBindingMeaning` requires equal known
contract keys and equal positive revisions. A larger revision does not imply
backward compatibility. Legacy profiles distinguish local story, About story,
video, fixed hero, and caption meanings. Equivalent visual templates can share
a profile.

Binding identity records edit meaning independently of content values and visual
release identity. Keep an identity through changes to typography, spacing, or
saved copy that preserve the edit's meaning. Change the semantic revision when
ownership, target fields, interpretation, or available editing actions change.
Equality establishes only the same editing meaning. It establishes neither
content freshness nor authorization, assignment freshness, or installed code.

The source-package tool retains and compares the entire `capabilities.ts` file.
This PR changes those bytes, so older retained source packages require fresh
compatibility review and regeneration with a newly accepted digest. Semantic
binding identity does not replace the existing byte comparison. Historical
packages and receipts remain intact.

## Design choice

| Candidate | Decision |
| --- | --- |
| Element-keyed map consumed by the editor hook | Selected. It replaces the hook's duplicated capability-to-piece expansion and uses the existing piece IDs. |
| Discriminated record list consumed by shared shortcuts | Rejected as the base. Selection would still need its own piece expansion. Its explicit ownership variants and semantic identity rules inform the map. |
| Separate binding module | Deferred. Keeping definitions in the already retained capabilities file preserves the package guard without adding another retention path. |

The map describes existing controls. It does not generate forms, persistence,
page composition, or a new theme family. Legacy capabilities retain their
current callers, including save filtering.

## Integration boundaries

The existing homepage save request, content revision, and `designRevision` remain
unchanged. No binding identity enters RPC arguments, request hashes, actor-scoped
receipts, or browser recovery records in this PR. Exact receipt replay still
precedes current design and stale-content conflicts after authorization. The
legacy SQL restrictions, tenant validation, media validation, and trusted
internal destinations remain authoritative for nonmigrated content.

The next PR must integrate assignment-aware saves without invalidating exact
receipt replay. A later PR must retain incompatible unsaved drafts for explicit
review before applying them. Neither unit can infer safety from UI visibility or
from this contract alone. Local deployment and activation coordination still
need proof before a new authored assignment can become active. Content-policy
migration remains a separate domain-by-domain change with direct-RPC coverage.
