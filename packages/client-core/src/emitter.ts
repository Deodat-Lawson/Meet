/**
 * Minimal typed event emitter.
 *
 * Deliberately dependency-free: this package runs in browsers and in React
 * Native's Hermes runtime, neither of which has Node's `events`.
 */
export type Listener<T> = (payload: T) => void;

export class Emitter<Events> {
  private listeners = new Map<keyof Events, Set<Listener<never>>>();

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<never>);
    return () => this.off(event, listener);
  }

  once<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    const off = this.on(event, (payload) => {
      off();
      listener(payload);
    });
    return off;
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    this.listeners.get(event)?.delete(listener as Listener<never>);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    // Copy first: a listener may unsubscribe itself while we iterate.
    for (const listener of [...set]) {
      try {
        (listener as Listener<Events[K]>)(payload);
      } catch (error) {
        console.error(`[emitter] listener for "${String(event)}" threw`, error);
      }
    }
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}
