import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { copyPlayToPlaybook, snapshotPlayForCopy, type PlayCopySource } from './play-copy';

function makeSource(): PlayCopySource {
  return {
    name: 'Cross',
    play: {
      players: [
        {
          id: 'qb', label: 'QB', team: 'offense', start: { x: 0.5, y: 0.7 },
          startAction: { type: 'pass', targetId: 'receiver' }
        },
        {
          id: 'receiver', label: 'WR', team: 'offense', start: { x: 0.2, y: 0.6 },
          route: [{ to: { x: 0.8, y: 0.3 }, speed: 6, delay: 1, routeStyle: 'dotted' }]
        },
        {
          id: 'defender', label: 'D1', team: 'defense', start: { x: 0.3, y: 0.3 },
          assignment: { type: 'man', targetId: 'receiver', speed: 5 }
        }
      ]
    },
    notes: 'Wait for the crossing route.',
    tags: [{ name: 'Pass', color: '#3b82f6' }, { name: 'Favorite', color: '#ec4899' }]
  };
}

type RequestLog = { url: URL; method: string; body: unknown; prefer: string | null };

function makeClient(options: { failTags?: boolean; failPlay?: boolean } = {}) {
  const requests: RequestLog[] = [];
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    requests.push({
      url, method,
      body: init?.body ? JSON.parse(String(init.body)) : null,
      prefer: new Headers(init?.headers).get('prefer')
    });
    if (url.pathname.endsWith('/playbook_tags') && method === 'GET') {
      return Response.json([{ name: 'PASS', sort_order: 20 }]);
    }
    if ((url.pathname.endsWith('/playbook_tags') && options.failTags) ||
        (url.pathname.endsWith('/plays') && options.failPlay)) {
      return Response.json({ message: 'Permission denied', code: '42501' }, { status: 403 });
    }
    if (url.pathname.endsWith('/plays')) {
      return Response.json({ id: 'copy-id', name: 'Cross copy' }, { status: 201 });
    }
    return new Response(null, { status: 201 });
  });
  const client = createClient('https://play-copy.test', 'test-key', {
    global: { fetch: fetchMock },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  return { client, requests };
}

describe('copying plays between playbooks', () => {
  it('keeps an independent source snapshot when the editor loads or edits another play', async () => {
    const source = makeSource();
    const snapshot = snapshotPlayForCopy(source);
    source.play.players[1].route![0].to.x = 0.1;
    source.play.players[0].startAction!.targetId = 'different-player';
    source.tags[1].name = 'Changed';
    source.notes = 'Destination notes';
    const { client, requests } = makeClient();

    await copyPlayToPlaybook(client, snapshot, 'destination-id', 'Cross copy', 'coach-id');

    const insert = requests.find((request) => request.url.pathname.endsWith('/plays'))!;
    expect(insert.method).toBe('POST');
    expect(insert.body).toMatchObject({
      playbook_id: 'destination-id',
      name: 'Cross copy',
      notes: 'Wait for the crossing route.',
      tags: ['PASS', 'Favorite'],
      data: { players: [
        { startAction: { type: 'pass', targetId: 'receiver' } },
        { route: [{ to: { x: 0.8, y: 0.3 }, speed: 6, delay: 1, routeStyle: 'dotted' }] },
        { assignment: { type: 'man', targetId: 'receiver', speed: 5 } }
      ] }
    });
    expect(insert.body).not.toHaveProperty('id');
    expect(insert.body).not.toHaveProperty('sort_order');
    expect(requests.every((request) => request.method === 'GET' || request.method === 'POST')).toBe(true);
  });

  it('adds missing tag definitions while keeping destination tags and colors', async () => {
    const source = makeSource();
    source.tags.push({ name: ' pass ', color: '#000000' });
    const { client, requests } = makeClient();

    await copyPlayToPlaybook(client, source, 'destination-id', ' Cross copy ', 'coach-id');

    expect(requests[0].url.searchParams.get('playbook_id')).toBe('eq.destination-id');
    const tagInsert = requests.find((request) => request.method === 'POST' && request.url.pathname.endsWith('/playbook_tags'))!;
    expect(tagInsert.body).toEqual([{
      playbook_id: 'destination-id', name: 'Favorite', color: '#ec4899', sort_order: 30, created_by: 'coach-id'
    }]);
    expect(tagInsert.prefer).toContain('resolution=ignore-duplicates');
    const playInsert = requests.find((request) => request.url.pathname.endsWith('/plays'))!;
    expect(playInsert.body).toMatchObject({ name: 'Cross copy', tags: ['PASS', 'Favorite'] });
    expect(source.tags[0].name).toBe('Pass');
  });

  it('copies plays without tags without needing tag writes', async () => {
    const source = makeSource();
    source.tags = [];
    const { client, requests } = makeClient();

    await expect(copyPlayToPlaybook(client, source, 'empty-playbook', source.name, 'coach-id'))
      .resolves.toEqual({ id: 'copy-id', name: 'Cross copy' });

    expect(requests).toHaveLength(1);
    expect(requests[0].body).toMatchObject({ playbook_id: 'empty-playbook', tags: [] });
  });

  it('does not insert an incomplete play when its tags cannot be copied', async () => {
    const { client, requests } = makeClient({ failTags: true });

    await expect(copyPlayToPlaybook(client, makeSource(), 'destination-id', 'Cross copy', 'coach-id'))
      .rejects.toMatchObject({ code: '42501' });

    expect(requests.some((request) => request.url.pathname.endsWith('/plays'))).toBe(false);
  });

  it('reports destination permission failures without changing the source', async () => {
    const source = makeSource();
    const original = JSON.stringify(source);
    const { client, requests } = makeClient({ failPlay: true });

    await expect(copyPlayToPlaybook(client, source, 'read-only-book', 'Cross copy', 'coach-id'))
      .rejects.toMatchObject({ code: '42501' });

    expect(JSON.stringify(source)).toBe(original);
    expect(requests.filter((request) => request.url.pathname.endsWith('/plays'))).toHaveLength(1);
  });
});
