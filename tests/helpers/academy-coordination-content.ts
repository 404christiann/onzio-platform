import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import type { Client } from "pg";
import { z } from "zod";
import { generateRegistrationStatusToken, hashRegistrationStatusToken } from "../../lib/registration-status-token";
import type { Database, TablesInsert } from "../../lib/database.generated";
import { academyProofParametersSchema, type AcademyProofParameters } from "../../scripts/pilot-academy-documents";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const identifier = z.string().regex(/^[a-z][a-z0-9_]*$/);
const relationSchema = z.object({ schema: identifier, name: identifier }).strict();
const billing = new Set(["club_subscriptions", "stripe_events", "club_stripe_connect"]);
const authority = new Set(["onzio.presentation_state", "onzio.audit_events", "onzio_private.homepage_assignment_epochs"]);
const image = "/images/shop/rosecityshirt1.webp";
const secondImage = "/images/shop/rosecityshirt2.jpeg";
const clubLogo = "/images/logo/rosecityLogo.png";
type Table = keyof Database["onzio"]["Tables"];

async function tenantRelations(db: Client) {
  return z.array(relationSchema).parse((await db.query(`select n.nspname as schema,c.relname as name
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('onzio','onzio_private') and c.relkind in ('r','p')
      and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='club_id' and not a.attisdropped)
    order by n.nspname,c.relname`)).rows);
}

export async function academyTenantFingerprint(db: Client, clubs: readonly string[], includeAuthority = false) {
  const groups: Record<"content" | "billing" | "editor" | "authority", unknown[]> = { content: [], billing: [], editor: [], authority: [] };
  const clubRows = (await db.query("select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) as data from onzio.clubs t where id=any($1::uuid[])", [clubs])).rows[0].data;
  groups.content.push({ table: "onzio.clubs", rows: clubRows });
  for (const relation of await tenantRelations(db)) {
    const table = `${relation.schema}.${relation.name}`;
    if (!includeAuthority && authority.has(table)) continue;
    // Audit rows accumulate in the shared local database (tens of thousands per club), so hashing each one
    // gets slower every run. A per-club count and highest id still prove none was added or removed.
    const query = table === "onzio.audit_events"
      ? `select coalesce(jsonb_agg(jsonb_build_object('club_id',club_id,'rows',rows,'max_id',max_id) order by club_id),'[]'::jsonb) as data
          from (select club_id, count(*) as rows, max(id) as max_id from onzio.audit_events where club_id=any($1::uuid[]) group by club_id) t`
      : `select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) as data from "${relation.schema}"."${relation.name}" t where club_id=any($1::uuid[])`;
    const rows = (await db.query(query, [clubs])).rows[0].data;
    const category = authority.has(table) ? "authority" : billing.has(relation.name) ? "billing" : relation.schema === "onzio_private" ? "editor" : "content";
    groups[category].push({ table, rows });
  }
  return { content: hash(groups.content), billing: hash(groups.billing), editor: hash(groups.editor), authority: hash(groups.authority) };
}

export async function academySchemaFingerprint(db: Client, proofSchema: string) {
  assert(/^site_coordination_[a-f0-9]{32}$/.test(proofSchema));
  const rows = (await db.query(`with namespaces as (
      select oid,nspname,nspacl from pg_namespace where nspname !~ '^pg_' and nspname<>'information_schema' and nspname<>$1
    ) select jsonb_build_object(
      'schemas',(select jsonb_agg(jsonb_build_array(nspname,nspacl) order by nspname) from namespaces),
      'relations',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relacl) order by n.nspname,c.relname) from pg_class c join namespaces n on n.oid=c.relnamespace where c.relkind in ('r','p','v','m','S')),
      'columns',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) order by n.nspname,c.relname,a.attnum) from pg_class c join namespaces n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where c.relkind in ('r','p','v','m')),
      'constraints',(select jsonb_agg(jsonb_build_array(n.nspname,c.conname,pg_get_constraintdef(c.oid)) order by n.nspname,c.conname,c.oid) from pg_constraint c join namespaces n on n.oid=c.connamespace),
      'functions',(select jsonb_agg(jsonb_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid),p.proacl) order by n.nspname,p.proname,p.oid) from pg_proc p join namespaces n on n.oid=p.pronamespace where p.prokind in ('f','p')),
      'policies',(select jsonb_agg(to_jsonb(p) order by p.schemaname,p.tablename,p.policyname) from pg_policies p join namespaces n on n.nspname=p.schemaname),
      'triggers',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)) order by n.nspname,c.relname,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid join namespaces n on n.oid=c.relnamespace where not t.tgisinternal)
    ) as data`, [proofSchema])).rows[0].data;
  return hash(rows);
}

async function ownedClub(db: Client, clubId: string) {
  const rows = (await db.query("select id,kind,slug from onzio.clubs where id=$1", [z.uuid().parse(clubId)])).rows;
  if (!rows.length) return false;
  assert.deepEqual(rows, [{ id: clubId, kind: "test", slug: "pilot" }], "Full Academy fixtures require their own disposable test club");
  return true;
}

export async function populateAcademyContent(db: Client, clubId: string): Promise<AcademyProofParameters> {
  assert(await ownedClub(db, clubId), "Disposable club must exist before fixture population");
  async function insert<T extends Table>(table: T, row: TablesInsert<T> & object) {
    identifier.parse(table);
    const entries = Object.entries(row);
    for (const [column] of entries) identifier.parse(column);
    await db.query(`insert into onzio."${table}" (${entries.map(([column]) => `"${column}"`).join(",")}) values(${entries.map((_, index) => `$${index + 1}`).join(",")})`,
      entries.map(([, value]) => value !== null && typeof value === "object" ? JSON.stringify(value) : value));
  }
  const seasonId = randomUUID(), playerId = randomUUID(), keeperId = randomUUID(), fixtureId = randomUUID();
  const programId = randomUUID(), formId = randomUUID(), priceId = randomUUID();
  const token = generateRegistrationStatusToken();
  const parameters = academyProofParametersSchema.parse({ programSlug: "proof-academy-program", formSlug: "proof-academy-registration", playerId, fixtureId, confirmationToken: token });
  await db.query("begin");
  try {
    await db.query("update onzio.clubs set name='Academy proof club',store_enabled=true where id=$1 and kind='test' and slug='pilot'", [clubId]);
    await db.query("insert into onzio.homepage_hero_content(club_id,headline_line_one,headline_line_two,intro) values($1,'Academy','proof home','A populated local proof homepage.') on conflict(club_id) do update set headline_line_one=excluded.headline_line_one,headline_line_two=excluded.headline_line_two,intro=excluded.intro", [clubId]);
    await db.query("insert into onzio.homepage_story_section(club_id,heading,body_primary,body_secondary,visible) values($1,'Academy proof story','A populated homepage story.','Current club content survives rollback.',true) on conflict(club_id) do update set heading=excluded.heading,body_primary=excluded.body_primary,body_secondary=excluded.body_secondary,visible=true", [clubId]);
    await insert("site_branding", { club_id: clubId, club_logo_path: clubLogo, inverse_logo_path: clubLogo, footer_tagline: "Academy proof footer" });
    await insert("site_social_links", { club_id: clubId, id: "instagram", label: "Proof social", href: "https://instagram.com/academyproof", icon: "/images/logo/instagramLogo.svg" });
    for (const placement of ["carousel", "footer"]) await insert("site_sponsor_logos", { club_id: clubId, placement, name: "Proof Sponsor", logo_url: image });
    await insert("about_page_content", { club_id: clubId, hero_title: "Academy proof story", story_paragraphs: ["A populated story for local acceptance."], feature_image_url: image, values_heading: "Proof values", values: [{ title: "Together", description: "A populated Academy value." }], closing_text: "Academy proof closing", closing_cta_label: "Contact", closing_cta_href: "/contact" });
    await insert("club_logo_page_content", { club_id: clubId, annotated_image_url: image, map_image_url: secondImage, features: [{ title: "Proof crest feature", description: "A populated crest detail.", icon_url: image, icon_size: 48, icon_scale: 1, patch_url: image }], color_cards: [{ label: "Proof navy", image_url: image }] });
    await insert("contact_profile", { club_id: clubId, public_email: "proof@example.test", public_phone: "+15550105353", service_area: "Proof city", hours: "Weekdays by appointment" });
    await insert("contact_page_content", { club_id: clubId, eyebrow: "Contact", headline: "Academy proof contact", intro: "A populated contact page." });
    await insert("programs_page_content", { club_id: clubId, hero_eyebrow: "Programs", hero_headline_line_one: "Academy", hero_headline_line_two: "proof programs", hero_intro: "Find the Academy proof program." });
    await insert("tryouts_page_content", { club_id: clubId, intro_with_tryouts: "Academy proof tryouts", intro_no_tryouts: "Academy proof tryouts information" });
    await insert("seasons", { id: seasonId, club_id: clubId, label: "Proof season", start_year: 2026, end_year: 2027, active: true });
    for (const [id, name, position, number] of [[playerId, "Proof Player", "Forward", 9], [keeperId, "Proof Keeper", "Goalkeeper", 1]] as const) {
      await insert("players", { id, club_id: clubId, name, position, number, age: 22, photo_url: image, active: true });
      await insert("player_photos", { club_id: clubId, player_id: id, url: image });
    }
    await insert("player_season_stats", { club_id: clubId, player_id: playerId, season_id: seasonId, goals: 3, assists: 2, mins: 180 });
    await insert("goalkeeper_season_stats", { club_id: clubId, player_id: keeperId, season_id: seasonId, saves: 5, clean_sheets: 1, mins: 180 });
    await insert("staff", { club_id: clubId, name: "Proof Coach", role: "Head coach", initials: "PC", photo_url: image, active: true });
    const now = Date.now();
    for (const [id, days, score] of [[fixtureId, -3, 2], [randomUUID(), 7, null]] as const) await insert("matches", { id, club_id: clubId, season_id: seasonId, date: new Date(now + days * 86400000).toISOString().slice(0, 10), time: "15:00", opponent: "Proof Opponent", home: true, venue: "Proof ground", rose_city_score: score, opponent_score: score === null ? null : 1 });
    await insert("league_standings_settings", { club_id: clubId, title: "Proof standings", eyebrow: "League", intro: "Local acceptance standings." });
    await insert("league_standings", { club_id: clubId, team_name: "Academy proof club", logo_url: image, played: 2, wins: 1, draws: 1, losses: 0, points: 4, is_club: true });
    for (const surface of ["home", "shop"]) for (const kit_variant of surface === "home" ? ["home"] : ["home", "third", "away"]) {
      await insert("shop_kit_section", { club_id: clubId, surface, kit_variant, title: kit_variant === "home" ? "Home kit pilot" : `Proof ${kit_variant} kit`, description: "A populated Academy kit.", bullet_points: ["Club crest", "Match fit"], cta_label: "View home kit", cta_link: "/shop" });
      for (const [sort_order, url] of [image, secondImage].entries()) await insert("shop_kit_photos", { club_id: clubId, surface, kit_variant, url, sort_order });
    }
    await insert("club_stripe_connect", { club_id: clubId, stripe_account_id: `acct_proof${clubId.replaceAll("-", "")}`, environment: "test", charges_enabled: true, details_submitted: true, payouts_enabled: true });
    await insert("registration_forms", { id: formId, club_id: clubId, slug: parameters.formSlug, title: "Academy proof registration", description: "A disposable local registration form.", participant_mode: "adult_only", status: "draft", waiver_text: "Synthetic acceptance waiver." });
    const fields = [["registrant_name", "Registrant name", "name", "adult"], ["registrant_email", "Registrant email", "email", "adult"], ["registrant_phone", "Registrant phone", "phone", "adult"], ["emergency_contact_name", "Emergency contact name", "name", "all"], ["emergency_contact_phone", "Emergency contact phone", "phone", "all"], ["consent_signature", "Consent signature", "signature", "all"]] as const;
    for (const [position, [field_key, label, field_type, participant_scope]] of fields.entries()) await insert("registration_form_fields", { club_id: clubId, form_id: formId, field_key, label, field_type, participant_scope, position, required: true, is_core: field_key !== "consent_signature" });
    await insert("registration_price_options", { id: priceId, club_id: clubId, form_id: formId, label: "Proof registration fee", amount_cents: 1250, active: true });
    await db.query("update onzio.registration_forms set status='open' where club_id=$1 and id=$2", [clubId, formId]);
    await insert("registrations", { club_id: clubId, form_id: formId, price_option_id: priceId, participant_type: "adult", status: "paid", paid_at: new Date().toISOString(), stripe_checkout_session_id: `cs_test_proof${formId.replaceAll("-", "")}`, stripe_payment_intent_id: `pi_proof${formId.replaceAll("-", "")}`, answers: {}, registrant_email: "proof@example.test", price_label: "Proof registration fee", amount_cents: 1250, waiver_accepted_at: new Date().toISOString(), status_token_hash: hashRegistrationStatusToken(token), registrant_email_status: "skipped", admin_email_status: "skipped" });
    await insert("programs", { id: programId, club_id: clubId, slug: parameters.programSlug, display_title: "Academy proof program", nav_label: "Academy proof program", summary: "A populated Academy pathway.", body: "Local full-site acceptance content.", highlights: ["Two weekly sessions.", "An Academy development pathway."], registration_form_id: formId, registration_enabled: true });
    await insert("program_media", { club_id: clubId, program_id: programId, url: image, alt: "Proof training", sort_order: 0 });
    await insert("tryouts", { club_id: clubId, program_id: programId, registration_form_id: formId, headline: "Academy proof tryouts", intro: "Meet the Academy proof team.", status: "open", location: "Proof ground", event_date: new Date(now + 7 * 86400000).toISOString().slice(0, 10), cta_label: "Register" });
    await insert("club_subscriptions", { club_id: clubId, stripe_customer_id: `cus_proof${clubId.replaceAll("-", "")}`, stripe_subscription_id: `sub_proof${clubId.replaceAll("-", "")}`, price_id: "price_proofAcademy", status: "active", paid_through: new Date(now + 30 * 86400000).toISOString() });
    await insert("stripe_events", { id: `evt_proof${clubId.replaceAll("-", "")}`, club_id: clubId, environment: "test", event_type: "customer.subscription.updated", stripe_created_at: new Date().toISOString(), payload_digest: "a".repeat(64), outcome: "applied" });
    await db.query("commit");
  } catch (error) { await db.query("rollback"); throw error; }
  return parameters;
}

export async function removeAcademyContent(db: Client, clubId: string) {
  if (!await ownedClub(db, clubId)) return;
  await db.query("update onzio.registration_forms set status='closed' where club_id=$1 and status<>'closed'", [clubId]);
  const order: readonly Table[] = ["tryouts", "program_media", "programs", "registrations", "registration_form_fields", "registration_price_options", "registration_forms", "club_stripe_connect", "stripe_events", "club_subscriptions", "player_match_stats", "goalkeeper_match_stats", "player_season_stats", "goalkeeper_season_stats", "player_photos", "matches", "players", "staff", "seasons", "shop_kit_photos", "shop_kit_section", "league_standings", "league_standings_settings", "site_sponsor_logos", "site_social_links", "site_branding", "about_page_content", "club_logo_page_content", "contact_profile", "contact_page_content", "programs_page_content", "tryouts_page_content"];
  for (const table of order) await db.query(`delete from onzio."${table}" where club_id=$1`, [clubId]);
  for (const relation of await tenantRelations(db)) if (relation.schema === "onzio_private" && !authority.has(`${relation.schema}.${relation.name}`)) {
    await db.query(`delete from "${relation.schema}"."${relation.name}" where club_id=$1`, [clubId]);
  }
}
