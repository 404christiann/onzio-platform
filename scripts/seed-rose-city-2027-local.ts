/** Approved homepage rehearsal only. Hosted URLs are refused before any write.
 * Uses the normal validation/normalization/publication pipeline. Existing club
 * data is never copied, billing is never enabled on a hosted project. */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { validateMediaUpload, type MediaKind } from '@/lib/media-validation';
import { publishAuthorizedMedia } from '@/lib/media-processing';
import { buildStoragePath, type MediaSurface } from '@/lib/storage-path';
import { defaultCinematicHomepageContent, cinematicHomepageStorageRecord } from '@/lib/cinematic-homepage-content';
import { parsePresentationDocument, templateRegistry } from '@/packages/presentation';

const API = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const endpoint = new URL(API);
if (endpoint.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)) throw new Error('Local rehearsal requires loopback Supabase.');
if (!process.argv.includes('--execute-local')) throw new Error('Pass --execute-local to import the local rehearsal.');
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Local service key required.');
const clubId = '32ceba0b-4e25-52c2-bb6b-d82fb87637a7';
const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const client = createClient(API, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket } });
const db = client.schema('onzio');
function id(label: string): string {
  const hex = createHash('sha256').update(`rose-city-2027:${label}`).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
async function upsert(table: string, value: unknown, conflict = 'id') {
  const result = await db.from(table).upsert(value as Record<string, unknown>, { onConflict: conflict });
  if (result.error) throw new Error(`${table}: ${result.error.message}`);
}
async function main() {
const manifest = JSON.parse(await readFile(resolve('assets/rose-city-2027/manifest.json'), 'utf8')) as { assets: Record<string, { inputPath: string; sha256: string; mimeType: string; kind: MediaKind }> };
const used: Record<string, MediaSurface> = {
  crest: 'branding', raffle: 'homepage', ticketMap: 'homepage', trophies: 'homepage', seats: 'homepage',
  slideshow1: 'homepage', slideshow2: 'homepage', slideshow3: 'homepage', slideshow4: 'homepage', slideshow5: 'homepage', slideshow6: 'homepage', slideshow7: 'homepage',
  player2027: 'shop', foothillHeader: 'homepage', heroPoster: 'homepage', episodePoster: 'homepage',
  sponsorChronic: 'branding', sponsorModern: 'branding', sponsorNikys: 'branding', sponsorPlanted: 'branding', sponsorTepitoSelected: 'branding', sponsorPackshot: 'branding',
};
const published: Record<string, { assetId: string; url: string; path: string }> = {};
await upsert('clubs', { id: clubId, slug: 'rose-city', name: 'Rose City FC', kind: 'test', lifecycle: 'active', public_access: 'live', tier: 'pro', primary_color: '#E73C2E', secondary_color: '#141414', store_enabled: true });
// Synthetic subscription exists only on this loopback rehearsal tenant.
await upsert('club_subscriptions', { club_id: clubId, stripe_customer_id: 'cus_rose2027_local', stripe_subscription_id: 'sub_rose2027_local', price_id: 'price_test_pro', tier: 'pro', status: 'active', paid_through: new Date(Date.now() + 30*86400000).toISOString(), cancel_at_period_end: false }, 'club_id');
await upsert('club_domains', { id: id('domain'), club_id: clubId, hostname: 'rose-city.localhost', environment: 'staging', active: true, is_primary: true, verified_at: new Date().toISOString() });
await upsert('club_members', { club_id: clubId, user_id: actorId, role: 'owner', status: 'active' }, 'user_id,club_id');
for (const [key, surface] of Object.entries(used)) {
  const source = manifest.assets[key];
  const bytes = await readFile(resolve(source.inputPath));
  if (createHash('sha256').update(bytes).digest('hex') !== source.sha256) throw new Error(`Unreviewed input: ${key}`);
  const validated = await validateMediaUpload({ bytes, metadata: { fileName: basename(source.inputPath), mimeType: source.mimeType, size: bytes.length, kind: source.kind } });
  const uploadId = id(key === "episodePoster" ? `asset:${key}:${source.sha256}` : `asset:${key}`);
  const stagingPath = buildStoragePath({ clubId, surface, assetId: uploadId, extension: validated.extension });
  const { error } = await client.storage.from('onzio-upload-staging').upload(stagingPath, bytes, { contentType: validated.mimeType, upsert: true });
  if (error) throw error;
  const result = await publishAuthorizedMedia({ version: 1, uploadId, clubId, actorId, surface, kind: source.kind, fileName: basename(source.inputPath), mimeType: validated.mimeType, claimedSize: bytes.length, stagingPath, expiresAt: Date.now() + 60000 });
  // Idempotent publication already has a finalized object; remove rerun input.
  if (result.idempotent) await client.storage.from('onzio-upload-staging').remove([stagingPath]);
  published[key] = { assetId: result.assetId, url: result.publicUrl, path: result.storagePath };
}
const art = (key: string, alt: string) => ({ assetId: published[key].assetId, url: published[key].url, alt });
await upsert('site_branding', { club_id: clubId, club_logo_asset_id: published.crest.assetId, club_logo_path: published.crest.path, footer_tagline: 'Pasadena, California' }, 'club_id');
await upsert('club_identity', { club_id: clubId, short_name: 'Rose City FC', initials: 'RCFC', founded_year: 2018, city: 'Pasadena', state: 'California', venue: 'Robinson Stadium', time_zone: 'America/Los_Angeles' }, 'club_id');
await upsert('homepage_hero_content', { club_id: clubId, eyebrow: '', headline_line_one: '', headline_line_two: '', intro: '', primary_cta_label: 'SHOP', primary_cta_href: '/shop', secondary_cta_label: 'MEET THE SQUAD', secondary_cta_href: '/roster' }, 'club_id');
await upsert('homepage_slideshow_settings', { club_id: clubId, season_label: '' }, 'club_id');
for (const [index, number] of [3,1,2,4,5,6,7].entries()) await upsert('homepage_slideshow_photos', { id: id(`photo:${number}`), club_id: clubId, media_asset_id: published[`slideshow${number}`].assetId, url: published[`slideshow${number}`].url, alt: `Rose City FC match photograph ${number}`, sort_order: index });
await upsert('shop_kit_section', { id: id('shop-section'), club_id: clubId, surface: 'home', kit_variant: 'home', eyebrow: 'ROSE CITY FC MATCH HOME 2027', title: 'CITY OF ROSES', description: 'Represent the city of Pasadena with the red Rose City FC “City of Roses” jersey. Be part of the team and represent Pasadena with us. Personalize your Rose City FC jersey with your own name and number. You are who we play for!', bullet_points: ['Authentic match jersey','Any name & number','League patch','Team sponsor','Raffle ticket included'], store_note: 'Sold exclusively at Niky’s Sports\n33 E Colorado Blvd, Pasadena, CA', cta_label: 'BUY NOW', cta_link: '/shop' });
await upsert('shop_kit_photos', { id: id('player-photo'), club_id: clubId, surface: 'home', kit_variant: 'home', url: published.player2027.url, media_asset_id: published.player2027.assetId, sort_order: 0 });
await upsert('behind_the_rose_section', { club_id: clubId, visible: true, eyebrow: 'BEHIND THE ROSE - SEASON - EPISODE 1', title: 'BEHIND THE ROSE', description: 'Go behind the scenes with Pasadena’s Rose City FC as they battle\nduring the 2024 UPSL Final. A cinematic view brings you even\ncloser to the City of Roses.', video_url: 'https://www.youtube.com/embed/fJf_A4LdKDw?rel=0', video_title: 'Rose City FC Behind the Rose S1 E1', caption: '' }, 'club_id');
const sponsors = [ ['Chronic Tacos','sponsorChronic'], ['Modern Woodmen','sponsorModern'], ["Niky’s Sports",'sponsorNikys'], ['Planted Beauty','sponsorPlanted'], ['Tepito Coffee','sponsorTepitoSelected'], ['The Packshot Agency','sponsorPackshot'] ];
for (const [index, [name,key]] of sponsors.entries()) await upsert('site_sponsor_logos', { id: id(`sponsor:${key}`), club_id: clubId, name, placement: 'carousel', sort_order: index, logo_url: published[key].url, media_asset_id: published[key].assetId });
const socialSource = JSON.parse(await readFile(resolve('assets/rose-city-2027/existing-social-links.json'), 'utf8')) as { rows: Record<string, unknown>[] };
for (const row of socialSource.rows) await upsert('site_social_links', { ...row, club_id: clubId }, 'club_id,id');
const content = defaultCinematicHomepageContent();
content.raffle = art('raffle','Automatically entered into raffle with ticket purchase: Samsung television, Ray-Ban Meta Wayfarer, PlayStation 5, STATSports tracker, MacBook Air, Xbox Series X, and win prizes with tennis balls');
content.ticket = { ...art('ticketMap','Rose City Futbol Club Under the Lights, Robinson Stadium Pasadena, supplied ticket with stadium map, Foothill Transit route and venue information'), visible: true };
content.match = { heading: 'NEXT HOME MATCH', buttonLabel: 'Buy Tickets', buttonHref: '/tickets', emptyMessage: 'The next home match will be announced soon.' };
content.prices = { heading: 'TICKET PRICES', rows: [
 { id: 'general', label: 'General Seats', price: '$5', description: 'No bad view at Robinson Stadium', note: '', accent: 'aqua' },
 { id: 'pcc', label: 'PCC Students Free', price: '', description: 'Pasadena City College students & staff', note: '*Must show school ID to receive ticket', accent: 'none' },
 { id: 'pusd', label: 'PUSD Students Free', price: '', description: 'Pasadena Unified School District students', note: '*Must show school ID to receive ticket', accent: 'none' },
 { id: 'tennis', label: 'Tennis Ball Throw', price: '$5', description: 'Closet ball to the center circle wins. You are playing\nagainst everyone with a tennis ball.', note: '', accent: 'lime' },
], footnote: '$5 each tennis ball' };
content.championship = { league: 'UPSL SOCAL NORTH CONFERENCE', year: '2024', title: 'CHAMPIONS', body: 'Rose City FC captured the 2024 UPSL SoCal North\nConference Championship, cementing our place as Pasadena’s\npremier club. The journey continues - and the best is still ahead.', trophy: art('trophies',"Rose City FC's conference and national championship trophies, with green club jersey") };
content.navigation.labels = { 'stadium-group': 'ROBINSON STADIUM', stadium: 'ROBINSON STADIUM' };
content.navigation.destinations = { tryouts: 'https://docs.google.com/forms/d/1qs_nBHqzLAISgW-B-f2i5Ep5leScHDTHODKf-Bbir0M/viewform?edit_requested=true', mediaCredentials: 'https://forms.gle/jG5yF7kjhC93MLsA6', nationalAnthem: 'https://forms.gle/tAezhCRdXH1Z1bMR7' };
content.sponsors = { heading: 'POWERED BY OUR PARTNERS' };
content.presentation = { headerPartner: art('foothillHeader','Foothill Transit'), heroPoster: art('heroPoster','Rose City players preparing their boots on the team bench'), seatsBackground: art('seats',''), episodePoster: art('episodePoster','Rose City players celebrating with their championship trophy'), heroVideoGuid: 'd17c6dc6-ab9a-4b22-a7dd-1e55b4f1ad91', heroVideoLibraryId: '723074', sponsorTreatments: { [id('sponsor:sponsorChronic')]: 'dark-lettering', [id('sponsor:sponsorPackshot')]: 'invert' } };
await upsert('homepage_revamp_content', { club_id: clubId, ...cinematicHomepageStorageRecord(content) }, 'club_id');
const template = templateRegistry['cinematic@2'];
const config = parsePresentationDocument({ schemaVersion: 1, template: { id: 'cinematic', version: 2 }, fontPack: template.defaultFontPack,
 theme: { surface: {canvas:'#F7F7F7',elevated:'#FFFFFF',subtle:'#F7F7F7',inverse:'#141414'},text:{primary:'#141414',secondary:'#3C3C3C',muted:'#B8B8B8',inverse:'#F7F7F7'},action:{primary:'#E73C2E',primaryHover:'#E73C2E',primaryText:'#F7F7F7',secondary:'#141414'},border:{subtle:'#B8B8B8',strong:'#3C3C3C'},status:{success:'#94C946',warning:'#94C946',danger:'#CA2F3B'} },
 modules: { roster:true,schedule:true,store:true,sponsors:true,tryouts:true,contact:true,affiliations:true }, homepage:{sections:template.defaultSections.map((type,index)=>({id:`section-${index}`,type,enabled:true,emptyBehavior:'hide',config:{}}))},navigation:{groups:[{id:'main',label:null,routes:template.defaultRoutes}]},metadata:{recommendationId:null,createdBy:actorId,createdAt:'2026-10-13T00:00:00.000Z',sourceArtifact:'Rose City approved 2027 homepage preview'} }, {surface:'production'});
const digest = createHash('sha256').update(JSON.stringify(config)).digest('hex');
const documentId = id('presentation-document');
const existing = await db.from('presentation_documents').select('id').eq('id',documentId).maybeSingle();
if (existing.error) throw existing.error;
if (!existing.data) await upsert('presentation_documents', { id: documentId, club_id: clubId, version: 1, schema_version: 1, template_id: 'cinematic', template_version: 2, configuration: config, configuration_digest: digest, created_by: actorId });
await upsert('presentation_state', { club_id: clubId, draft_document_id: documentId, published_document_id: documentId, updated_by: actorId }, 'club_id');
await writeFile(resolve('assets/rose-city-2027/local-import-receipt.json'), JSON.stringify({ localOnly: true, clubId, template: 'cinematic@2', mediaCount: Object.keys(published).length, media: published, configurationDigest: digest, noSyntheticMatches: true, hostedChanges: false },null,2)+'\n');
console.log(JSON.stringify({ localOnly: true, clubId, template: 'cinematic@2', publishedMedia: Object.keys(published).length }));

}
main().catch(error => { console.error(error); process.exitCode = 1; });
