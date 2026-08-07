import type { RoomClient } from '@meet/client-core';
import { releaseVideo, resetVideoVisibility, retainVideo } from '../src/videoVisibility';

function fakeClient() {
  const calls: Array<[string, string, boolean]> = [];
  const client = {
    setConsumerVisible: (peerId: string, source: string, visible: boolean) => {
      calls.push([peerId, source, visible]);
      return Promise.resolve();
    },
  } as unknown as RoomClient;
  return { client, calls };
}

describe('video visibility', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetVideoVisibility();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('resumes a consumer once, however many tiles show it', () => {
    const { client, calls } = fakeClient();

    retainVideo(client, 'bob', 'webcam');
    retainVideo(client, 'bob', 'webcam');

    expect(calls).toEqual([['bob', 'webcam', true]]);
  });

  it('keeps a consumer running while any tile still holds it', () => {
    const { client, calls } = fakeClient();

    retainVideo(client, 'bob', 'webcam');
    retainVideo(client, 'bob', 'webcam');
    releaseVideo(client, 'bob', 'webcam');
    jest.advanceTimersByTime(5000);

    expect(calls).toEqual([['bob', 'webcam', true]]);
  });

  it('pauses a consumer nothing is showing any more', () => {
    const { client, calls } = fakeClient();

    retainVideo(client, 'bob', 'webcam');
    releaseVideo(client, 'bob', 'webcam');
    jest.advanceTimersByTime(5000);

    expect(calls).toEqual([
      ['bob', 'webcam', true],
      ['bob', 'webcam', false],
    ]);
  });

  it('does not pause across a swap that puts the same video somewhere else', () => {
    const { client, calls } = fakeClient();

    // The grid unmounts and the floating window mounts, in that order.
    retainVideo(client, 'bob', 'webcam');
    releaseVideo(client, 'bob', 'webcam');
    retainVideo(client, 'bob', 'webcam');
    jest.advanceTimersByTime(5000);

    expect(calls).toEqual([['bob', 'webcam', true]]);
  });

  it('tells the streams of one person apart', () => {
    const { client, calls } = fakeClient();

    retainVideo(client, 'bob', 'webcam');
    retainVideo(client, 'bob', 'screen');
    releaseVideo(client, 'bob', 'webcam');
    jest.advanceTimersByTime(5000);

    expect(calls).toEqual([
      ['bob', 'webcam', true],
      ['bob', 'screen', true],
      ['bob', 'webcam', false],
    ]);
  });
});
