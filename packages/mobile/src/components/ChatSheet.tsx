import React, { useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { RoomClient, RoomState } from '@meet/client-core';
import { colors, radius, spacing } from '../theme';
import { CloseIcon, SendIcon } from './Icons';
import { fromError, useLocaleTag, useT } from '../i18n';
import { useRoomStore } from '../store/roomStore';

export function ChatSheet({ client, room }: { client: RoomClient; room: RoomState }) {
  const setPanel = useRoomStore((s) => s.setPanel);
  const pushToast = useRoomStore((s) => s.pushToast);
  const t = useT();
  const localeTag = useLocaleTag();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await client.sendChatMessage(trimmed);
      setText('');
    } catch (error) {
      pushToast(fromError(error, 'chat.notSent'), 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => setPanel('none')}>
      <Pressable style={styles.backdrop} onPress={() => setPanel('none')}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardWrap}
        >
          <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>{t('chat.title')}</Text>
              <TouchableOpacity onPress={() => setPanel('none')} accessibilityLabel={t('chat.close')}>
                <CloseIcon size={20} color={colors.textDim} />
              </TouchableOpacity>
            </View>

            {room.chat.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>{t('chat.empty')}</Text>
                <Text style={styles.emptyHint}>{t('chat.emptyHint')}</Text>
              </View>
            ) : (
              <FlatList
                ref={listRef}
                data={room.chat}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.list}
                onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
                renderItem={({ item }) => {
                  const isSelf = item.peerId === room.self?.id;
                  return (
                    <View style={styles.message}>
                      <View style={styles.messageHead}>
                        <Text style={[styles.author, isSelf && { color: colors.accent }]}>
                          {isSelf ? t('chat.you') : item.displayName}
                        </Text>
                        {item.to ? <Text style={styles.private}>{t('chat.private')}</Text> : null}
                        <Text style={styles.time}>
                          {new Date(item.timestamp).toLocaleTimeString(localeTag, {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Text>
                      </View>
                      <Text style={styles.messageText}>{item.text}</Text>
                    </View>
                  );
                }}
              />
            )}

            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder={t('chat.placeholder')}
                placeholderTextColor={colors.textFaint}
                value={text}
                onChangeText={setText}
                maxLength={4000}
                multiline
                onSubmitEditing={send}
              />
              <TouchableOpacity
                style={[styles.sendButton, (!text.trim() || sending) && styles.sendButtonDisabled]}
                onPress={send}
                disabled={!text.trim() || sending}
                accessibilityLabel={t('chat.send')}
              >
                <SendIcon size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  keyboardWrap: { justifyContent: 'flex-end' },
  sheet: {
    height: '72%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  list: { padding: spacing.md, gap: spacing.md },
  message: { marginBottom: spacing.md },
  messageHead: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, marginBottom: 3 },
  author: { color: colors.text, fontSize: 12.5, fontWeight: '600' },
  private: { color: colors.warn, fontSize: 11, fontWeight: '600' },
  time: { color: colors.textFaint, fontSize: 11 },
  messageText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
  emptyText: { color: colors.textDim, fontSize: 14 },
  emptyHint: { color: colors.textFaint, fontSize: 12, textAlign: 'center' },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    paddingHorizontal: spacing.md,
    paddingTop: 12,
    paddingBottom: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    color: colors.text,
    fontSize: 14.5,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { opacity: 0.4 },
});
