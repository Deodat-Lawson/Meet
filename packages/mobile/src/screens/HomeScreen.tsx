import React, { useState } from 'react';
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
import { normalizeRoomId } from '@meet/protocol';
import { colors, radius, spacing } from '../theme';
import { LogoIcon } from '../components/Icons';
import { getServerConfig, getServerUrl, setServerUrl } from '../config';

export function HomeScreen({ onOpenRoom }: { onOpenRoom: (roomId: string) => void }) {
  const [joinCode, setJoinCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverInput, setServerInput] = useState(getServerUrl());
  const [showServer, setShowServer] = useState(false);

  const createMeeting = async () => {
    setCreating(true);
    setError(null);
    try {
      setServerUrl(serverInput);
      const { httpUrl } = getServerConfig();
      const response = await fetch(`${httpUrl}/api/rooms`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error(`Server responded ${response.status}`);
      const { roomId } = (await response.json()) as { roomId: string };
      onOpenRoom(roomId);
    } catch (err) {
      setError(
        err instanceof Error
          ? `Could not reach the server at ${getServerUrl()}. ${err.message}`
          : 'Could not create the meeting.',
      );
    } finally {
      setCreating(false);
    }
  };

  const joinMeeting = () => {
    setServerUrl(serverInput);
    const raw = joinCode.trim();
    const fromUrl = raw.match(/\/room\/([^/?#]+)/)?.[1];
    const id = normalizeRoomId(fromUrl ?? raw);
    if (!id) {
      setError('Enter a meeting code or link.');
      return;
    }
    onOpenRoom(id);
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <View style={styles.brand}>
            <LogoIcon size={34} />
            <Text style={styles.brandText}>Meet</Text>
          </View>

          <Text style={styles.title}>Start or join a meeting</Text>
          <Text style={styles.subtitle}>
            Video, audio and screen sharing. Share your screen straight from your phone.
          </Text>

          <TouchableOpacity
            style={[styles.button, styles.buttonPrimary]}
            onPress={createMeeting}
            disabled={creating}
            accessibilityRole="button"
          >
            {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonPrimaryText}>New meeting</Text>}
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          <Text style={styles.label}>Join with a code</Text>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.flex]}
              placeholder="abc-defg-hij"
              placeholderTextColor={colors.textFaint}
              value={joinCode}
              onChangeText={setJoinCode}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={joinMeeting}
              returnKeyType="go"
            />
            <TouchableOpacity style={styles.button} onPress={joinMeeting} disabled={!joinCode.trim()}>
              <Text style={styles.buttonText}>Join</Text>
            </TouchableOpacity>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity onPress={() => setShowServer((open) => !open)} style={styles.serverToggle}>
            <Text style={styles.serverToggleText}>{showServer ? 'Hide server settings' : 'Server settings'}</Text>
          </TouchableOpacity>

          {showServer && (
            <View style={styles.serverBox}>
              <Text style={styles.label}>Server address</Text>
              <TextInput
                style={styles.input}
                value={serverInput}
                onChangeText={setServerInput}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="http://192.168.1.10:4000"
                placeholderTextColor={colors.textFaint}
              />
              <Text style={styles.hint}>
                Use your computer's LAN address when running the server locally. 10.0.2.2 reaches the host machine from
                the Android emulator.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.bg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  brandText: { color: colors.text, fontSize: 22, fontWeight: '700' },
  title: { color: colors.text, fontSize: 24, fontWeight: '700', marginBottom: 6 },
  subtitle: { color: colors.textDim, fontSize: 14, lineHeight: 20, marginBottom: spacing.xl },
  label: { color: colors.textDim, fontSize: 13, fontWeight: '600', marginBottom: 6 },
  row: { flexDirection: 'row', gap: spacing.sm },
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
    paddingHorizontal: spacing.lg,
    borderRadius: radius.sm,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  buttonPrimary: { backgroundColor: colors.accent },
  buttonPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginVertical: spacing.lg },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.textFaint, fontSize: 12, letterSpacing: 1 },
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
  serverToggle: { marginTop: spacing.lg, alignItems: 'center' },
  serverToggleText: { color: colors.textFaint, fontSize: 13 },
  serverBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
  },
  hint: { color: colors.textFaint, fontSize: 12, lineHeight: 17, marginTop: spacing.sm },
});
