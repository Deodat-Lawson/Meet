import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { RTCView, type MediaStream } from 'react-native-webrtc';
import { absoluteFill, colors, radius, spacing } from '../theme';
import { MicIcon, MicOffIcon, VideoIcon, VideoOffIcon } from '../components/Icons';
import { LanguageToggle } from '../components/LanguageToggle';
import { fromError, useT, useTranslatable, type TranslatableText } from '../i18n';
import { rnMediaAdapter } from '../adapters/RNMediaAdapter';
import { getServerConfig } from '../config';
import { useRoomStore } from '../store/roomStore';

interface PreJoinScreenProps {
  roomId: string;
  onCancel: () => void;
}

/**
 * Camera check and name entry.
 *
 * Requesting the preview here is also what triggers the Android runtime
 * permission dialogs, so the user grants them before they are visible to others.
 */
export function PreJoinScreen({ roomId, onCancel }: PreJoinScreenProps) {
  const join = useRoomStore((s) => s.join);
  const t = useT();
  const text = useTranslatable();
  const [displayName, setDisplayName] = useState('');
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [preview, setPreview] = useState<MediaStream | null>(null);
  const [passcode, setPasscode] = useState('');
  const [needsPasscode, setNeedsPasscode] = useState(false);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [error, setError] = useState<TranslatableText | null>(null);
  const [joining, setJoining] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let cancelled = false;
    const { httpUrl } = getServerConfig();
    fetch(`${httpUrl}/api/rooms/${encodeURIComponent(roomId)}`)
      .then((response) => response.json())
      .then((data: { hasPasscode: boolean; name?: string }) => {
        if (cancelled) return;
        setNeedsPasscode(data.hasPasscode);
        setRoomName(data.name ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  /* Open the camera preview; re-open when the camera toggle changes. */
  useEffect(() => {
    let cancelled = false;

    const open = async () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (!cancelled) setPreview(null);
      if (!cameraEnabled) return;

      try {
        // The adapter returns the DOM MediaStream type the shared engine uses;
        // RTCView needs react-native-webrtc's shape (it reads `toURL()`), and at
        // runtime registerGlobals() makes these the same object.
        const stream = (await rnMediaAdapter.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 360 } },
          audio: false,
        })) as unknown as MediaStream;
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        setPreview(stream);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(fromError(err, 'mobile.cameraFailed'));
      }
    };

    void open();
    return () => {
      cancelled = true;
    };
  }, [cameraEnabled]);

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    },
    [],
  );

  const handleJoin = async () => {
    const name = displayName.trim();
    if (!name) {
      setError({ key: 'prejoin.enterName' });
      return;
    }
    setJoining(true);
    setError(null);

    try {
      const { httpUrl } = getServerConfig();
      const response = await fetch(`${httpUrl}/api/rooms/${encodeURIComponent(roomId)}/join`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: name, passcode: passcode || undefined }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        setError(body.message ? { text: body.message } : { key: 'prejoin.joinFailed' });
        setJoining(false);
        return;
      }
      const { token } = (await response.json()) as { token: string };

      // Release the preview so the meeting can claim the camera cleanly.
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setPreview(null);

      await join({ roomId, displayName: name, token, micEnabled, cameraEnabled });
    } catch (err) {
      setError(fromError(err, 'prejoin.joinFailed'));
      setJoining(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.preview}>
          {cameraEnabled && preview ? (
            <RTCView streamURL={preview.toURL()} style={StyleSheet.absoluteFill} objectFit="cover" mirror />
          ) : (
            <View style={styles.previewPlaceholder}>
              <VideoOffIcon size={30} color={colors.textDim} />
              <Text style={styles.placeholderText}>{t('prejoin.cameraOff')}</Text>
            </View>
          )}

          <View style={styles.previewControls}>
            <TouchableOpacity
              style={[styles.roundButton, !micEnabled && styles.roundButtonOff]}
              onPress={() => setMicEnabled((on) => !on)}
              accessibilityLabel={micEnabled ? t('prejoin.turnOffMic') : t('prejoin.turnOnMic')}
            >
              {micEnabled ? <MicIcon size={20} /> : <MicOffIcon size={20} color="#fff" />}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.roundButton, !cameraEnabled && styles.roundButtonOff]}
              onPress={() => setCameraEnabled((on) => !on)}
              accessibilityLabel={cameraEnabled ? t('prejoin.turnOffCamera') : t('prejoin.turnOnCamera')}
            >
              {cameraEnabled ? <VideoIcon size={20} /> : <VideoOffIcon size={20} color="#fff" />}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <LanguageToggle style={styles.language} />
          <Text style={styles.title}>{t('prejoin.title')}</Text>
          <Text style={styles.subtitle}>{roomName ?? t('prejoin.meeting', { id: roomId })}</Text>

          <Text style={styles.label}>{t('prejoin.yourName')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('prejoin.namePlaceholder')}
            placeholderTextColor={colors.textFaint}
            value={displayName}
            onChangeText={setDisplayName}
            maxLength={64}
            autoFocus
          />

          {needsPasscode && (
            <>
              <Text style={[styles.label, { marginTop: spacing.md }]}>{t('prejoin.passcode')}</Text>
              <TextInput
                style={styles.input}
                secureTextEntry
                value={passcode}
                onChangeText={setPasscode}
                placeholderTextColor={colors.textFaint}
              />
            </>
          )}

          <TouchableOpacity
            style={[styles.button, styles.buttonPrimary, { marginTop: spacing.lg }]}
            onPress={handleJoin}
            disabled={joining}
          >
            {joining ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonPrimaryText}>{t('prejoin.joinNow')}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={[styles.button, styles.buttonGhost]} onPress={onCancel}>
            <Text style={styles.buttonText}>{t('common.cancel')}</Text>
          </TouchableOpacity>

          {error ? <Text style={styles.error}>{text(error)}</Text> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg, backgroundColor: colors.bg },
  preview: {
    aspectRatio: 16 / 10,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  previewPlaceholder: {
    ...absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
  },
  placeholderText: { color: colors.textDim, fontSize: 14 },
  previewControls: {
    position: 'absolute',
    bottom: spacing.md,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  roundButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(38,43,53,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundButtonOff: { backgroundColor: colors.danger },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  language: { alignSelf: 'flex-end', marginBottom: spacing.md },
  title: { color: colors.text, fontSize: 22, fontWeight: '700', marginBottom: 4 },
  subtitle: { color: colors.textDim, fontSize: 14, marginBottom: spacing.lg },
  label: { color: colors.textDim, fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: {
    height: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    color: colors.text,
    fontSize: 15,
  },
  button: {
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  buttonText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  buttonPrimary: { backgroundColor: colors.accent, marginTop: 0 },
  buttonPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  error: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(232,80,58,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(232,80,58,0.3)',
    color: '#ffb3a7',
    fontSize: 13,
    lineHeight: 18,
  },
});
