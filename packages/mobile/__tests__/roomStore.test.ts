import type { RoomClient } from '@meet/client-core';
import { useRoomStore } from '../src/store/roomStore';

const asClient = {} as RoomClient;

describe('minimising a meeting', () => {
  /* The hint toast schedules its own dismissal; without this the timer outlives
     the test that started it. */
  beforeEach(() => {
    jest.useFakeTimers();
    useRoomStore.setState({
      client: asClient,
      presentation: 'full',
      panel: 'none',
      toasts: [],
      miniHintPending: true,
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('collapses and restores without touching the connection', () => {
    const before = useRoomStore.getState().client;

    useRoomStore.getState().minimize();
    expect(useRoomStore.getState().presentation).toBe('mini');

    useRoomStore.getState().restore();
    expect(useRoomStore.getState().presentation).toBe('full');
    expect(useRoomStore.getState().client).toBe(before);
  });

  it('has nothing to collapse when there is no meeting', () => {
    useRoomStore.setState({ client: null });

    useRoomStore.getState().minimize();

    expect(useRoomStore.getState().presentation).toBe('full');
  });

  it('closes an open sheet on the way down, since it cannot be drawn small', () => {
    useRoomStore.setState({ panel: 'chat' });

    useRoomStore.getState().minimize();

    expect(useRoomStore.getState().panel).toBe('none');
  });

  it('explains itself the first time and then stays quiet', () => {
    useRoomStore.getState().minimize();
    expect(useRoomStore.getState().toasts).toHaveLength(1);
    expect(useRoomStore.getState().toasts[0].content).toEqual({ key: 'mini.hint' });

    useRoomStore.setState({ toasts: [] });
    useRoomStore.getState().restore();
    useRoomStore.getState().minimize();

    expect(useRoomStore.getState().toasts).toHaveLength(0);
  });

  it('leaves the window when the platform says the window has gone', () => {
    useRoomStore.getState().setPresentation('pip');
    expect(useRoomStore.getState().presentation).toBe('pip');

    useRoomStore.getState().setPresentation('full');
    expect(useRoomStore.getState().presentation).toBe('full');
  });
});
