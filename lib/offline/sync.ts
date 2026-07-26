import { authedFetch } from "@/lib/apiClient";
import {
  getAllPending,
  getPendingByModule,
  queuePending,
  removePending,
  updatePendingStatus,
  type PendingAction,
} from "@/lib/offline/db";

function generateOfflineId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return "off-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function isOnline() {
  return typeof navigator === "undefined" || navigator.onLine;
}

// The one entry point every module's write handler calls when a save can't
// reach the server right now (either navigator.onLine is already false, or
// the live authedFetch attempt itself threw a network error). Returns the
// offline_id so the caller can track this specific action in its own
// optimistic UI (e.g. to cancel it later if the underlying record gets
// deleted before it ever syncs — see cancelPendingAction below).
export async function queueOfflineAction(
  module: string,
  action: string,
  endpoint: string,
  payload: Record<string, any>
) {
  const offlineId = generateOfflineId();

  await queuePending({
    offline_id: offlineId,
    module,
    action,
    endpoint,
    payload,
    sync_status: "pending",
    attempt_count: 0,
    created_at: new Date().toISOString(),
  });

  // Fire-and-forget — if we're actually online right now (rare: queued due
  // to a transient fetch failure rather than a real outage) this drains
  // immediately instead of waiting for the next poll/online event.
  void syncPendingActions();

  return offlineId;
}

// A record still sitting in the outbox (never reached the server) can just
// be dropped locally instead of queuing a "delete" for a row that was never
// created — used by modules where a just-recorded, not-yet-synced entry can
// be removed by the user before it ever syncs (e.g. Income & Expenditure).
export async function cancelPendingAction(offlineId: string) {
  await removePending(offlineId);
}

type SyncResult = {
  synced: string[];
  failed: string[];
};

// Drains the ENTIRE shared outbox (every module), replaying each queued
// write through the same authenticated API route an online save would hit —
// never falls back to a direct Supabase write. Mirrors
// lib/kiosk/sync.ts's syncPendingRecords(): one record's failure never
// blocks the rest of the batch, and failed records simply stay in the
// queue to be retried on the next sync pass rather than being dropped.
export async function syncPendingActions(module?: string): Promise<SyncResult> {
  const result: SyncResult = { synced: [], failed: [] };

  if (!isOnline()) return result;

  const pending: PendingAction[] = module ? await getPendingByModule(module) : await getAllPending();
  if (!pending.length) return result;

  for (const record of pending) {
    try {
      await updatePendingStatus(record.offline_id, "syncing");

      const response = await authedFetch(record.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record.payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || `Sync failed (HTTP ${response.status}).`);
      }

      await removePending(record.offline_id);
      result.synced.push(record.offline_id);
    } catch (error) {
      console.error("[offline sync] failed to sync action", record.module, record.action, error);
      await updatePendingStatus(
        record.offline_id,
        "failed",
        error instanceof Error ? error.message : "Sync failed."
      );
      result.failed.push(record.offline_id);
    }
  }

  return result;
}
