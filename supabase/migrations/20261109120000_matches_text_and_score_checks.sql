-- ADMIN-RE-07c: decision 7 of docs/admin-portal-redesign-plan.md. The text
-- limits and the 0-99 score range the admin has enforced in Zod since RE-06
-- and RE-07 (lib/match-text-limits.ts, lib/admin-data-contract.ts
-- matchesMutation) become database checks on onzio.matches.
--
-- Tightens constraints on a populated table, which review-bot-supabase.md
-- hands to a person. Evidence that no row breaks them: Christian's read-only
-- production query on 2026-11-09 (8 rows) found nothing over any limit and no
-- score over 99. Longest values then: opponent 16, short name none, venue 25,
-- competition 29, address 42, city 6, state 2; top score 5.
--
-- Deployed code already refuses these values when it adds a game and when it
-- saves a score. Before this branch's code deploys, an edit of a game's text
-- past a limit through the classic Games page would now fail here instead of
-- saving; this branch caps those inputs as well.
--
-- The existing non-negative score checks stay; these add the upper bound.
-- A null value passes every check, as before. No grant, policy, default or
-- row change.

alter table onzio.matches
  add constraint matches_opponent_length check (char_length(opponent) <= 80),
  add constraint matches_opponent_short_name_length
    check (char_length(opponent_short_name) <= 20),
  add constraint matches_venue_length check (char_length(venue) <= 120),
  add constraint matches_competition_length check (char_length(competition) <= 80),
  add constraint matches_address_length check (char_length(address) <= 120),
  add constraint matches_city_length check (char_length(city) <= 80),
  add constraint matches_state_length check (char_length(state) <= 40),
  add constraint matches_rose_city_score_max check (rose_city_score <= 99),
  add constraint matches_opponent_score_max check (opponent_score <= 99);
