import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { parseHistoricalPresentationDocument, parsePresentationDocument } from '@/packages/presentation';
const state = vi.hoisted(() => ({ published: null as unknown, calls: [] as number[], runtime: 'live', authorized: true, filters: [] as [string, string, unknown][] }));
vi.mock('@supabase/ssr', () => ({ createServerClient: (_url: string, _key: string, options: { cookies: { getAll: () => unknown[] } }) => {
  state.calls.push(options.cookies.getAll().length);
  const query = (table: string, data: unknown) => { const q = { select: () => q, eq: (key: string, value: unknown) => { state.filters.push([table, key, value]); return q; }, maybeSingle: async () => ({ data, error: null }) }; return q; };
  return { auth: { getUser: async () => ({ data: { user: { id: 'signed-in-owner' } } }) }, schema: () => ({ from: (table: string) => query(table, table === 'clubs' ? { id: '11111111-1111-4111-8111-111111111111', slug: 'alpha', lifecycle: 'active', public_access: 'live' } : table === 'presentation_state' ? (state.authorized ? { published_document_id: 'explicit-published-id' } : null) : state.published ? { configuration: state.published } : null), rpc: async () => ({ data: state.runtime, error: null }) }) };
} }));
import { middleware } from '@/middleware';
function document(version: 1 | 2) {
  // cinematic@1 is retired: a stored version-1 document parses only through the historical reader.
  const parse = version === 2 ? parsePresentationDocument : parseHistoricalPresentationDocument;
  return parse({ schemaVersion: 1, template: { id: 'cinematic', version }, fontPack: version === 2 ? 'museomoderno-avenir' : 'bebas-inter', theme: {
    surface: { canvas: '#FFFFFF', elevated: '#FFFFFF', subtle: '#FFFFFF', inverse: '#141414' }, text: { primary: '#141414', secondary: '#141414', muted: '#141414', inverse: '#FFFFFF' }, action: { primary: '#E73C2E', primaryHover: '#E73C2E', primaryText: '#FFFFFF', secondary: '#141414' }, border: { subtle: '#141414', strong: '#141414' }, status: { success: '#94C946', warning: '#94C946', danger: '#E73C2E' },
  }, modules: {}, homepage: { sections: [{ id: 'hero', type: 'cinematic.hero', enabled: true, emptyBehavior: 'hide', config: {} }] }, navigation: { groups: [{ id: 'main', label: null, routes: ['home'] }] }, metadata: { recommendationId: null, createdBy: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', createdAt: '2026-10-13T00:00:00.000Z', sourceArtifact: null } }, { surface: 'production' });
}
function request(path: string) { return new NextRequest(`http://alpha.localhost:3198${path}`, { headers: { host: 'alpha.localhost:3198', cookie: 'member=existing-session' } }); }
beforeEach(() => { state.published = null; state.calls = []; state.runtime = 'live'; state.authorized = true; state.filters = []; });
describe('published-template route guard', () => {
  it('rejects new destinations before streaming when no cinematic2 document is published', async () => {
    for (const value of [null, document(1), { template: { id: 'cinematic', version: 2 } }]) {
      state.published = value;
      const response = await middleware(request('/tickets'));
      expect(response.status).toBe(404); expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
      expect(response.headers.get('x-middleware-rewrite')).toBeNull();
    }
  });
  it('enables only validated published cinematic2 using a cookie-free public read', async () => {
    state.published = document(2);
    const response = await middleware(request('/tickets'));
    expect(response.headers.get('x-middleware-rewrite')).toBe('http://alpha.localhost:3198/_clubs/alpha/tickets');
    expect(state.calls).toEqual([1, 0]);
    expect(response.headers.get('x-onzio-cache-tenant')).toBe('11111111-1111-4111-8111-111111111111');
  });
  it('keeps existing tenant routes available without the new template', async () => {
    for (const path of ['/', '/schedule', '/shop', '/contact', '/tryouts']) {
      const response = await middleware(request(path));
      expect(response.headers.get('x-middleware-rewrite')).toContain('/_clubs/alpha');
    }
    expect(state.calls).toEqual([1, 1, 1, 1, 1]);
  });
  it('retains authorized private preview and follows only its published pointer', async () => {
    state.runtime = 'private_preview'; state.published = document(2);
    const response = await middleware(request('/tickets'));
    expect(response.headers.get('x-middleware-rewrite')).toContain('/_clubs/alpha/tickets');
    expect(state.filters).toContainEqual(['presentation_documents', 'id', 'explicit-published-id']);
    state.published = document(1); // a newer private draft cannot enable this path
    expect((await middleware(request('/tickets'))).status).toBe(404);
  });
  it('rejects private preview when member RLS cannot read the pointer', async () => {
    state.runtime = 'private_preview'; state.published = document(2); state.authorized = false;
    const response = await middleware(request('/tickets'));
    expect(response.status).toBe(404);
    expect(state.filters.some(([table]) => table === 'presentation_documents')).toBe(false);
  });
});
