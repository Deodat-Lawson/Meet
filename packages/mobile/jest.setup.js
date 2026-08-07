/* eslint-env jest */
/**
 * Stubs for the two things a test process does not have: the WebRTC native
 * module, and the Picture-in-Picture module that only exists on a device.
 *
 * Both are replaced rather than avoided, so the tests exercise the same tree
 * the app renders instead of a parallel one written for testing.
 */

jest.mock('react-native-webrtc', () => ({
  RTCView: 'RTCView',
  registerGlobals: jest.fn(),
  mediaDevices: {
    getUserMedia: jest.fn(async () => ({ getTracks: () => [], toURL: () => 'stream://mock' })),
    getDisplayMedia: jest.fn(async () => ({ getTracks: () => [], toURL: () => 'stream://mock' })),
    enumerateDevices: jest.fn(async () => []),
  },
  setSpeakerphoneOn: jest.fn(),
}));

jest.mock('./specs/NativeMeetPip', () => ({ __esModule: true, default: null }));
