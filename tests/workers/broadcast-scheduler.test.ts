import { describe, it, expect, vi } from 'vitest';
import {
  buildNamesText,
  dueBroadcasts,
  fireBroadcastNow,
  runBroadcastTick,
} from '../../src/workers/broadcast-scheduler.js';
import type { CampaignRow } from '../../src/db/campaigns.js';
import type { SendflowBroadcast } from '../../src/types/job.js';

function campaign(over: Partial<CampaignRow> & { sendflow_broadcasts: SendflowBroadcast[] }): CampaignRow {
  return {
    id: over.id ?? 'cmp',
    sendflow_release_id: over.sendflow_release_id ?? 'rel-1',
    sendflow_account_id: over.sendflow_account_id ?? 'acc-1',
    sendflow_group_ids: over.sendflow_group_ids ?? ['120363000000000001'],
    sendflow_broadcasts: over.sendflow_broadcasts,
  } as unknown as CampaignRow;
}

describe('dueBroadcasts', () => {
  const b = (o: Partial<SendflowBroadcast>): SendflowBroadcast => ({
    id: o.id ?? 'b1',
    enabled: o.enabled ?? true,
    template_id: o.template_id ?? 't1',
    times: o.times ?? ['09:00'],
  });

  it('matches an enabled broadcast whose times include the slot', () => {
    const c = campaign({ sendflow_broadcasts: [b({ times: ['09:00', '20:00'] })] });
    expect(dueBroadcasts([c], '09:00')).toHaveLength(1);
    expect(dueBroadcasts([c], '20:00')).toHaveLength(1);
    expect(dueBroadcasts([c], '10:00')).toHaveLength(0);
  });

  it('ignores disabled broadcasts and ones without a template', () => {
    const c = campaign({
      sendflow_broadcasts: [
        b({ id: 'off', enabled: false, times: ['09:00'] }),
        b({ id: 'notpl', template_id: '', times: ['09:00'] }),
      ],
    });
    expect(dueBroadcasts([c], '09:00')).toHaveLength(0);
  });

  it('matches a names broadcast that has at least one non-empty variation', () => {
    const c = campaign({
      sendflow_broadcasts: [
        { id: 'n1', enabled: true, kind: 'names', times: ['09:00'], messages: ['Olá INSERIR NOMES'] },
        { id: 'n2', enabled: true, kind: 'names', times: ['09:00'], messages: ['   '] },
      ],
    });
    const due = dueBroadcasts([c], '09:00');
    expect(due).toHaveLength(1);
    expect(due[0]!.broadcast.id).toBe('n1');
  });
});

describe('fireBroadcastNow', () => {
  const namesBroadcast: SendflowBroadcast = {
    id: 'n1',
    enabled: true,
    kind: 'names',
    times: ['09:00'],
    messages: ['Já entraram:\nINSERIR NOMES\n🔗 INSERIR LINK'],
    send_mode: 'random',
  };

  it('posts immediately and returns the resolved preview + names count', async () => {
    const c = campaign({ sendflow_broadcasts: [namesBroadcast] });
    (c as unknown as { checkout_links: string[] }).checkout_links = ['DsybU94'];
    const sendText = vi.fn().mockResolvedValue(true);
    const res = await fireBroadcastNow(c, namesBroadcast, {
      fetchNames: vi.fn().mockResolvedValue(['Ana', 'João']),
      sendText,
      sleepMs: 0,
    });
    expect(res).toMatchObject({ ok: true, posted: 1, namesCount: 2 });
    expect(res.preview).toBe('Já entraram:\n• Ana\n• João\n🔗 https://pay.kiwify.com.br/DsybU94');
    expect(sendText).toHaveBeenCalledTimes(1);
  });

  it('reports no_names when the Sheet has no approved buyers', async () => {
    const c = campaign({ sendflow_broadcasts: [namesBroadcast] });
    const res = await fireBroadcastNow(c, namesBroadcast, {
      fetchNames: vi.fn().mockResolvedValue([]),
      sendText: vi.fn(),
      sleepMs: 0,
    });
    expect(res).toMatchObject({ ok: false, reason: 'no_names', posted: 0 });
  });

  it('reports no_target when release/account/groups are missing', async () => {
    const c = campaign({ sendflow_broadcasts: [namesBroadcast], sendflow_group_ids: [] });
    const res = await fireBroadcastNow(c, namesBroadcast, {
      fetchNames: vi.fn().mockResolvedValue(['Ana']),
      sendText: vi.fn(),
      sleepMs: 0,
    });
    expect(res).toMatchObject({ ok: false, reason: 'no_target' });
  });
});

describe('buildNamesText', () => {
  it('substitutes the name list and link for both token styles', () => {
    const out = buildNamesText(
      'Já entraram:\n{{names}}\n\nGaranta: {{checkout_url}}',
      ['Ana', 'João'],
      'https://pay/x',
    );
    expect(out).toBe('Já entraram:\n• Ana\n• João\n\nGaranta: https://pay/x');
  });

  it('also supports the plain-language tokens INSERIR NOMES / INSERIR LINK', () => {
    const out = buildNamesText('INSERIR NOMES\n🔗 INSERIR LINK', ['Ana'], 'https://pay/x');
    expect(out).toBe('• Ana\n🔗 https://pay/x');
  });
});

describe('runBroadcastTick', () => {
  // 2026-09-01T12:00:00Z == 09:00 in São Paulo (UTC-3).
  const now = '2026-09-01T12:00:00Z';

  const template = {
    id: 't1',
    messages: [
      { type: 'text' as const, text: 'Regras do grupo' },
      { type: 'video' as const, url: 'https://sf/v.mp4', caption: 'assista' },
    ],
  };

  function makeDeps(over: Partial<Parameters<typeof runBroadcastTick>[0]> = {}) {
    const send = vi.fn().mockResolvedValue(true);
    const claim = vi.fn().mockResolvedValue(true);
    const fetchTemplate = vi.fn().mockResolvedValue(template);
    const c = campaign({ sendflow_broadcasts: [{ id: 'b1', enabled: true, template_id: 't1', times: ['09:00'] }] });
    return {
      send,
      claim,
      fetchTemplate,
      deps: {
        now,
        listCampaigns: () => Promise.resolve([c]),
        claim,
        fetchTemplate,
        send,
        sleepMs: 0,
        ...over,
      },
    };
  }

  it('claims and replays the template messages to the group at the due minute', async () => {
    const { deps, send, claim, fetchTemplate } = makeDeps();
    const res = await runBroadcastTick(deps);

    expect(claim).toHaveBeenCalledWith('b1', '2026-09-01 09:00');
    expect(fetchTemplate).toHaveBeenCalledWith('t1');
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][1]).toEqual({
      releaseId: 'rel-1',
      accountId: 'acc-1',
      groupIds: ['120363000000000001'],
    });
    expect(res).toEqual({ fired: 1, posted: 2, failed: 0 });
  });

  it('does not send when the claim is lost (already fired this slot)', async () => {
    const { deps, send } = makeDeps({ claim: vi.fn().mockResolvedValue(false) });
    const res = await runBroadcastTick(deps);
    expect(send).not.toHaveBeenCalled();
    expect(res.fired).toBe(0);
  });

  it('does nothing when no broadcast matches the current minute', async () => {
    const c = campaign({ sendflow_broadcasts: [{ id: 'b1', enabled: true, template_id: 't1', times: ['23:30'] }] });
    const send = vi.fn();
    const res = await runBroadcastTick({
      now,
      listCampaigns: () => Promise.resolve([c]),
      claim: vi.fn().mockResolvedValue(true),
      fetchTemplate: vi.fn(),
      send,
      sleepMs: 0,
    });
    expect(send).not.toHaveBeenCalled();
    expect(res).toEqual({ fired: 0, posted: 0, failed: 0 });
  });

  it('counts a failed send but keeps going', async () => {
    const { deps } = makeDeps({
      send: vi
        .fn()
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('boom')),
    });
    const res = await runBroadcastTick(deps);
    expect(res).toMatchObject({ fired: 1, posted: 1, failed: 1 });
  });

  it('posts a names broadcast with the buyers list read from the Sheet', async () => {
    const c = campaign({
      sendflow_broadcasts: [
        {
          id: 'n1',
          enabled: true,
          kind: 'names',
          times: ['09:00'],
          messages: ['Já entraram:\nINSERIR NOMES\n🔗 INSERIR LINK'],
          send_mode: 'random',
        },
      ],
    });
    (c as unknown as { checkout_links: string[] }).checkout_links = ['DsybU94'];
    const sendText = vi.fn().mockResolvedValue(true);
    const fetchNames = vi.fn().mockResolvedValue(['Ana', 'João']);

    const res = await runBroadcastTick({
      now,
      listCampaigns: () => Promise.resolve([c]),
      claim: vi.fn().mockResolvedValue(true),
      fetchNames,
      sendText,
      sleepMs: 0,
    });

    expect(fetchNames).toHaveBeenCalledTimes(1);
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText.mock.calls[0][0]).toBe(
      'Já entraram:\n• Ana\n• João\n🔗 https://pay.kiwify.com.br/DsybU94',
    );
    expect(sendText.mock.calls[0][1]).toEqual({
      releaseId: 'rel-1',
      accountId: 'acc-1',
      groupIds: ['120363000000000001'],
    });
    expect(res).toMatchObject({ fired: 1, posted: 1, failed: 0 });
  });

  it('skips a names broadcast when there are no buyers yet (no empty list posted)', async () => {
    const c = campaign({
      sendflow_broadcasts: [
        { id: 'n1', enabled: true, kind: 'names', times: ['09:00'], messages: ['INSERIR NOMES'] },
      ],
    });
    const sendText = vi.fn();
    const res = await runBroadcastTick({
      now,
      listCampaigns: () => Promise.resolve([c]),
      claim: vi.fn().mockResolvedValue(true),
      fetchNames: vi.fn().mockResolvedValue([]),
      sendText,
      sleepMs: 0,
    });
    expect(sendText).not.toHaveBeenCalled();
    expect(res).toMatchObject({ fired: 1, posted: 0, failed: 0 });
  });
});
