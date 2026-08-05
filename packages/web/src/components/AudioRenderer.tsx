import { useEffect, useRef } from 'react';
import type { ConsumerEntry } from '@meet/client-core';
import { webMediaAdapter } from '../adapters/WebMediaAdapter';

/**
 * Plays every remote audio track through its own hidden element.
 *
 * Audio is kept out of the video tiles on purpose: a tile can be unmounted by a
 * layout change or scrolled out of view, and losing someone's voice because their
 * thumbnail scrolled off screen is the worst bug a meeting app can have.
 */
export function AudioRenderer({ consumers, outputDeviceId }: { consumers: ConsumerEntry[]; outputDeviceId?: string }) {
  const audioConsumers = consumers.filter((c) => c.consumer.kind === 'audio');

  return (
    <div aria-hidden style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
      {audioConsumers.map((entry) => (
        <RemoteAudio key={entry.id} entry={entry} outputDeviceId={outputDeviceId} />
      ))}
    </div>
  );
}

function RemoteAudio({ entry, outputDeviceId }: { entry: ConsumerEntry; outputDeviceId?: string }) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.srcObject = entry.stream;

    // Browsers block autoplay with audio until the page has been interacted with.
    // The join click satisfies that, but retry once on the next user gesture.
    const tryPlay = () => element.play().catch(() => undefined);
    tryPlay();

    const onGesture = () => {
      tryPlay();
      document.removeEventListener('click', onGesture);
      document.removeEventListener('keydown', onGesture);
    };
    document.addEventListener('click', onGesture);
    document.addEventListener('keydown', onGesture);

    const unregister = webMediaAdapter.registerAudioElement(element);
    return () => {
      document.removeEventListener('click', onGesture);
      document.removeEventListener('keydown', onGesture);
      unregister();
      element.srcObject = null;
    };
  }, [entry.stream]);

  useEffect(() => {
    if (ref.current && outputDeviceId) void webMediaAdapter.setAudioOutput(outputDeviceId, ref.current);
  }, [outputDeviceId]);

  return <audio ref={ref} autoPlay playsInline />;
}
