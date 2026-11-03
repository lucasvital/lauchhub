/**
 * A single SendFlow destination: one release, the connected account that posts
 * messages from it, and the WhatsApp group GIDs within that release.
 *
 * A campaign can have SEVERAL of these (groups spread across multiple SendFlow
 * releases), stored in `campaigns.sendflow_targets`. The legacy single-release
 * fields (`sendflow_release_id` / `sendflow_account_id` / `sendflow_group_ids`)
 * are kept for back-compat and resolve to a one-element list.
 */
export interface SendflowTarget {
  releaseId: string;
  /** Null = removal only (posting messages needs an account). */
  accountId: string | null;
  groupIds: string[];
}

/** Shape resolveSendflowTargets reads — a campaign row or a job config slice. */
export interface SendflowTargetSource {
  sendflow_targets?: SendflowTarget[] | null;
  sendflow_release_id?: string | null;
  sendflow_account_id?: string | null;
  sendflow_group_ids?: string[] | null;
}

/**
 * The effective list of SendFlow targets for a campaign/job. Prefers the
 * multi-release `sendflow_targets`; when none are set, falls back to the legacy
 * single release/account/groups so existing campaigns keep working unchanged.
 * Every returned target has a non-empty releaseId and at least one group.
 */
export function resolveSendflowTargets(src: SendflowTargetSource): SendflowTarget[] {
  const multi = (src.sendflow_targets ?? [])
    .map((t) => ({
      releaseId: (t?.releaseId ?? '').trim(),
      accountId: t?.accountId ? String(t.accountId).trim() || null : null,
      groupIds: (t?.groupIds ?? []).filter(Boolean),
    }))
    .filter((t) => t.releaseId && t.groupIds.length > 0);
  if (multi.length > 0) return multi;

  const groupIds = (src.sendflow_group_ids ?? []).filter(Boolean);
  if (src.sendflow_release_id && groupIds.length > 0) {
    return [
      {
        releaseId: src.sendflow_release_id,
        accountId: src.sendflow_account_id ?? null,
        groupIds,
      },
    ];
  }
  return [];
}
