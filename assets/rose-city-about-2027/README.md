# Approved About content and photograph

`copy.json` preserves the old public About page's story, values and closing button. Christian approved the new styling and explicitly requested Robinson Stadium in both former Arcadia City Hall Stadium mentions. `original-photo.webp` is the unchanged original public About photograph downloaded from the old site's versioned public media URL recorded in the outer design exploration's `source-receipt.json`.

Original photo SHA256: `00f66a5cab24dbf438831843aa0978f5f76b69d94335271bf80ac3b1ee3b4739`.

`scripts/seed-rose-city-about-2027-local.ts` refuses non-loopback targets, ports other than55321/55322, non-test/non-Rose City tenants, and existing editable About content. It validates and publishes only this photo through the existing media pipeline and inserts only this About row. Other page, player, season, match and branding snapshots are compared before/after. No broad homepage seed or hosted import.

The isolated rehearsal import receipt is in ignored `output/rose-city-about-local-import.json`. Actual admin replacement was tested using these same original bytes. The final published asset identity changed normally; independently checked normalized photo and delivery checksums match the original import. Final copy and photo evidence: outer `review-notes/about-2027/implemented/persistence.json`.
