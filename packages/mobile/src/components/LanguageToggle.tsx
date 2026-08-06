import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { LOCALES, LOCALE_LABELS, LOCALE_SHORT_LABELS } from '@meet/protocol';
import { colors, radius, spacing } from '../theme';
import { useLocale, useSetLocale, useT } from '../i18n';

interface LanguageToggleProps {
  /** Two-glyph labels for the meeting header, where space is contested. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * The language switcher.
 *
 * A segmented control rather than a picker: with two languages both options fit
 * on screen, so switching is one tap and there is no modal to dismiss.
 */
export function LanguageToggle({ compact = false, style }: LanguageToggleProps) {
  const locale = useLocale();
  const setLocale = useSetLocale();
  const t = useT();

  return (
    <View style={[styles.group, compact && styles.groupCompact, style]} accessibilityRole="radiogroup">
      {LOCALES.map((code) => {
        const active = code === locale;
        return (
          <TouchableOpacity
            key={code}
            style={[styles.option, compact && styles.optionCompact, active && styles.optionActive]}
            onPress={() => setLocale(code)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={t('language.switchTo', { language: LOCALE_LABELS[code] })}
          >
            <Text style={[styles.label, compact && styles.labelCompact, active && styles.labelActive]}>
              {compact ? LOCALE_SHORT_LABELS[code] : LOCALE_LABELS[code]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 2,
    padding: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  groupCompact: { padding: 2 },
  option: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  optionCompact: { paddingHorizontal: spacing.sm, paddingVertical: 4 },
  optionActive: { backgroundColor: colors.accent },
  label: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
  labelCompact: { fontSize: 12 },
  labelActive: { color: '#fff' },
});
