import { describe, it, expect } from 'vitest';
import { resolveSendflowTargets } from '../../src/shared/sendflow-targets.js';

describe('resolveSendflowTargets', () => {
  it('prefers the multi-release list when present', () => {
    const out = resolveSendflowTargets({
      sendflow_targets: [
        { releaseId: 'relA', accountId: 'accA', groupIds: ['120363000000000001'] },
        { releaseId: 'relB', accountId: 'accB', groupIds: ['120363000000000002', '120363000000000003'] },
      ],
      // legacy fields are ignored when the list is set
      sendflow_release_id: 'legacy',
      sendflow_account_id: 'legacyAcc',
      sendflow_group_ids: ['999'],
    });
    expect(out).toEqual([
      { releaseId: 'relA', accountId: 'accA', groupIds: ['120363000000000001'] },
      { releaseId: 'relB', accountId: 'accB', groupIds: ['120363000000000002', '120363000000000003'] },
    ]);
  });

  it('falls back to the legacy single release when no targets are set', () => {
    const out = resolveSendflowTargets({
      sendflow_targets: [],
      sendflow_release_id: 'rel-1',
      sendflow_account_id: 'acc-1',
      sendflow_group_ids: ['120363000000000001'],
    });
    expect(out).toEqual([
      { releaseId: 'rel-1', accountId: 'acc-1', groupIds: ['120363000000000001'] },
    ]);
  });

  it('drops incomplete targets (no release or no groups) and trims', () => {
    const out = resolveSendflowTargets({
      sendflow_targets: [
        { releaseId: '  relA  ', accountId: '  accA ', groupIds: ['g1', ''] },
        { releaseId: '', accountId: 'x', groupIds: ['g2'] }, // no release → dropped
        { releaseId: 'relB', accountId: null, groupIds: [] }, // no groups → dropped
      ],
    });
    expect(out).toEqual([{ releaseId: 'relA', accountId: 'accA', groupIds: ['g1'] }]);
  });

  it('returns an empty list when nothing is configured', () => {
    expect(resolveSendflowTargets({})).toEqual([]);
    expect(resolveSendflowTargets({ sendflow_release_id: 'r', sendflow_group_ids: [] })).toEqual([]);
  });

  it('keeps a legacy target with a null account (removal-only)', () => {
    const out = resolveSendflowTargets({
      sendflow_release_id: 'rel-1',
      sendflow_account_id: null,
      sendflow_group_ids: ['120363000000000001'],
    });
    expect(out).toEqual([{ releaseId: 'rel-1', accountId: null, groupIds: ['120363000000000001'] }]);
  });
});
