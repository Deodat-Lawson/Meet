import type { RoomClient } from '@meet/client-core';
import type { ProducerSource } from '@meet/protocol';

/**
 * Reference-counted consumer visibility, with the release deferred.
 *
 * A tile pauses its consumer when it unmounts, which is right when it scrolled
 * off screen and wrong when the same person is about to reappear one frame
 * later in the floating window. Collapsing the meeting swaps a grid of tiles
 * for a single one; without this, the person still on screen would be paused
 * and resumed across that swap — two signalling round trips and a black frame
 * in the window the user is looking at.
 *
 * So a release waits a moment before taking effect, and a retain in the
 * meantime cancels it. Videos that really did go away still pause, a fraction
 * of a second later, and keep saving the downstream bandwidth they were meant
 * to save.
 */
const RELEASE_GRACE_MS = 400;

const retained = new Map<string, number>();
const pendingReleases = new Map<string, ReturnType<typeof setTimeout>>();
/** What the client was last told, so a cancelled release asks for nothing. */
const resumed = new Set<string>();

const keyFor = (peerId: string, source: ProducerSource) => `${peerId}:${source}`;

export function retainVideo(client: RoomClient, peerId: string, source: ProducerSource): void {
  const key = keyFor(peerId, source);

  const pending = pendingReleases.get(key);
  if (pending) {
    clearTimeout(pending);
    pendingReleases.delete(key);
  }

  retained.set(key, (retained.get(key) ?? 0) + 1);
  if (resumed.has(key)) return;
  resumed.add(key);
  void client.setConsumerVisible(peerId, source, true);
}

export function releaseVideo(client: RoomClient, peerId: string, source: ProducerSource): void {
  const key = keyFor(peerId, source);
  const next = Math.max(0, (retained.get(key) ?? 0) - 1);
  retained.set(key, next);
  if (next > 0 || pendingReleases.has(key)) return;

  pendingReleases.set(
    key,
    setTimeout(() => {
      pendingReleases.delete(key);
      if ((retained.get(key) ?? 0) > 0) return;
      resumed.delete(key);
      void client.setConsumerVisible(peerId, source, false);
    }, RELEASE_GRACE_MS),
  );
}

/** Forgets everything; the counts belong to one client, not to the process. */
export function resetVideoVisibility(): void {
  for (const timer of pendingReleases.values()) clearTimeout(timer);
  pendingReleases.clear();
  retained.clear();
  resumed.clear();
}
