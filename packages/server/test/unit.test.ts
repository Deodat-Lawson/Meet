import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  generateRoomId,
  isValidRoomId,
  normalizeRoomId,
  qualityFromScore,
  spatialLayerForWidth,
  initialsFor,
  colorForPeer,
  formatDuration,
  ROUTER_CODECS,
  WEBCAM_SIMULCAST_ENCODINGS,
  SCREEN_SIMULCAST_ENCODINGS,
} from '@meet/protocol';
import { issueJoinToken, verifyJoinToken } from '../src/auth.js';

describe('room ids', () => {
  it('generates ids in the readable xxx-xxxx-xxx shape', () => {
    for (let i = 0; i < 200; i++) {
      const id = generateRoomId();
      assert.match(id, /^[a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3}$/);
      assert.ok(isValidRoomId(id));
    }
  });

  it('omits characters that are easy to misread aloud', () => {
    // No l/1, no 0/o — meeting codes get read over the phone.
    const ids = Array.from({ length: 300 }, () => generateRoomId()).join('');
    assert.ok(!ids.includes('l'), 'lowercase L is ambiguous with 1');
    assert.ok(!ids.includes('0'), 'zero is ambiguous with O');
    assert.ok(!ids.includes('1'), 'one is ambiguous with l');
  });

  it('normalises user-pasted ids', () => {
    assert.equal(normalizeRoomId('  ABC-DEFG-HIJ '), 'abc-defg-hij');
    assert.equal(normalizeRoomId('abc defg hij'), 'abcdefghij');
  });

  it('rejects ids that could escape a path segment', () => {
    assert.ok(!isValidRoomId('../etc/passwd'));
    assert.ok(!isValidRoomId('a/b'));
    assert.ok(!isValidRoomId(''));
    assert.ok(!isValidRoomId('ab'));
  });
});

describe('join tokens', () => {
  it('round-trips claims', () => {
    const token = issueJoinToken({ roomId: 'abc-defg-hij', displayName: 'Alex' });
    const claims = verifyJoinToken(token);
    assert.equal(claims?.roomId, 'abc-defg-hij');
    assert.equal(claims?.displayName, 'Alex');
  });

  it('rejects a tampered token', () => {
    const token = issueJoinToken({ roomId: 'abc-defg-hij', displayName: 'Alex' });
    const [header, payload, signature] = token.split('.');
    const forged = `${header}.${Buffer.from(
      JSON.stringify({ roomId: 'other-room', displayName: 'Mallory' }),
    ).toString('base64url')}.${signature}`;
    assert.equal(verifyJoinToken(forged), null);
  });

  it('rejects garbage', () => {
    assert.equal(verifyJoinToken('not-a-token'), null);
    assert.equal(verifyJoinToken(''), null);
  });
});

describe('simulcast layer selection', () => {
  it('maps rendered width onto a spatial layer', () => {
    // A thumbnail must not pull the top layer; a full-screen tile must.
    assert.equal(spatialLayerForWidth(160, 3), 0);
    assert.equal(spatialLayerForWidth(500, 3), 1);
    assert.equal(spatialLayerForWidth(1280, 3), 2);
  });

  it('collapses correctly for two-layer sources like screen share', () => {
    assert.equal(spatialLayerForWidth(320, 2), 0);
    assert.equal(spatialLayerForWidth(1280, 2), 1);
  });

  it('always returns a layer that exists', () => {
    for (const layers of [1, 2, 3]) {
      for (const width of [1, 100, 640, 1920, 4096]) {
        const layer = spatialLayerForWidth(width, layers);
        assert.ok(layer >= 0 && layer < layers, `layer ${layer} out of range for ${layers} layers`);
      }
    }
  });
});

describe('media configuration', () => {
  it('advertises Opus plus at least one video codec the browsers all support', () => {
    const mimes = ROUTER_CODECS.map((codec) => codec.mimeType.toLowerCase());
    assert.ok(mimes.includes('audio/opus'));
    assert.ok(mimes.includes('video/vp8'), 'VP8 is the universal fallback');
    assert.ok(mimes.includes('video/h264'), 'H264 is needed for older Safari and some Android hardware');
  });

  it('orders the webcam ladder from lowest to highest bitrate', () => {
    const bitrates = WEBCAM_SIMULCAST_ENCODINGS.map((encoding) => encoding.maxBitrate);
    assert.deepEqual([...bitrates].sort((a, b) => a - b), bitrates);
  });

  it('gives screen share more bitrate headroom than the camera', () => {
    const topScreen = Math.max(...SCREEN_SIMULCAST_ENCODINGS.map((e) => e.maxBitrate));
    const topCamera = Math.max(...WEBCAM_SIMULCAST_ENCODINGS.map((e) => e.maxBitrate));
    assert.ok(topScreen > topCamera, 'shared text needs more bitrate than a talking head');
  });

  it('enables Opus DTX so silent participants cost almost nothing', () => {
    const opus = ROUTER_CODECS.find((codec) => codec.mimeType === 'audio/opus');
    assert.equal((opus?.parameters as { usedtx?: number })?.usedtx, 1);
  });
});

describe('presentation helpers', () => {
  it('derives sensible initials', () => {
    assert.equal(initialsFor('Alex Rivera'), 'AR');
    assert.equal(initialsFor('Cher'), 'CH');
    assert.equal(initialsFor('  Ada  Lovelace  '), 'AL');
    assert.equal(initialsFor(''), '?');
  });

  it('gives a peer the same colour every time', () => {
    assert.equal(colorForPeer('peer-1'), colorForPeer('peer-1'));
    assert.notEqual(colorForPeer('peer-1'), colorForPeer('peer-2'));
  });

  it('formats meeting duration', () => {
    assert.equal(formatDuration(0), '0:00');
    assert.equal(formatDuration(65_000), '1:05');
    assert.equal(formatDuration(3_725_000), '1:02:05');
  });

  it('buckets connection scores', () => {
    assert.equal(qualityFromScore(10), 'excellent');
    assert.equal(qualityFromScore(7), 'good');
    assert.equal(qualityFromScore(4), 'poor');
    assert.equal(qualityFromScore(1), 'critical');
    assert.equal(qualityFromScore(undefined), 'disconnected');
  });
});
