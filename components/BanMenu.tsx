import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Layout } from '../constants/colors';
import { BAN_DURATIONS, BAN_REASONS, BAN_SCOPES } from '../constants/cabins';
import type { BanDuration, BanScope, ListingWithMeta } from '../lib/supabase';
import { hoverProps } from '../lib/webHover';

type Props = {
  listing: ListingWithMeta;
  visible: boolean;
  onClose: () => void;
  onConfirm: (req: { scope: BanScope; duration: BanDuration; reason: string | null }) => Promise<void>;
};

/** Scope × duration picker. Two axes, so it's a small sheet rather than a menu. */
export default function BanMenu({ listing, visible, onClose, onConfirm }: Props) {
  const [scope, setScope] = useState<BanScope>('listing');
  const [duration, setDuration] = useState<BanDuration>('season');
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    await onConfirm({ scope, duration, reason });
    setBusy(false);
    onClose();
  };

  // Property scope only means something once a cabin has been matched across
  // sources; say so rather than offering a control that quietly does nothing.
  const propertyUnmatched = !listing.property_id;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <ScrollView>
            <View style={styles.header}>
              <Ionicons name="close-circle" size={22} color={Colors.danger} />
              <Text style={styles.title} numberOfLines={2}>Hide “{listing.name}”</Text>
            </View>

            <Text style={styles.label}>How much to hide</Text>
            {BAN_SCOPES.map((s) => {
              const disabled = s.value === 'property' && propertyUnmatched;
              const active = scope === s.value;
              return (
                <TouchableOpacity
                  key={s.value}
                  style={[styles.option, active && styles.optionActive, disabled && styles.optionDisabled]}
                  onPress={() => !disabled && setScope(s.value)}
                  disabled={disabled}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active, disabled }}
                >
                  <Ionicons
                    name={active ? 'radio-button-on' : 'radio-button-off'}
                    size={18}
                    color={disabled ? Colors.border : active ? Colors.primary : Colors.textSecondary}
                  />
                  <View style={styles.optionBody}>
                    <Text style={[styles.optionLabel, disabled && styles.mutedText]}>
                      {s.value === 'company' ? `All of ${listing.company_name}` : s.label}
                    </Text>
                    <Text style={styles.optionHint}>
                      {disabled
                        ? "This cabin hasn't been matched to other sites yet"
                        : s.hint}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            <Text style={styles.label}>For how long</Text>
            <View style={styles.durationRow}>
              {BAN_DURATIONS.map((d) => {
                const active = duration === d.value;
                return (
                  <TouchableOpacity
                    key={d.value}
                    style={[styles.duration, active && styles.durationActive]}
                    onPress={() => setDuration(d.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.durationLabel, active && styles.durationLabelActive]}>
                      {d.label}
                    </Text>
                    <Text style={[styles.durationHint, active && styles.durationHintActive]}>
                      {d.hint}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.label}>Why? (optional, but future-you will thank you)</Text>
            <View style={styles.reasons}>
              {BAN_REASONS.map((r) => {
                const active = reason === r;
                return (
                  <TouchableOpacity
                    key={r}
                    style={[styles.reason, active && styles.reasonActive]}
                    onPress={() => setReason(active ? null : r)}
                    {...hoverProps('chip')}
                  >
                    <Text style={[styles.reasonText, active && styles.reasonTextActive]}>{r}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.actions}>
              <TouchableOpacity style={styles.cancel} onPress={onClose}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirm} onPress={submit} disabled={busy}>
                <Text style={styles.confirmText}>{busy ? 'Hiding…' : 'Hide it'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(31,42,39,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 460,
    maxHeight: '90%',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  title: { fontSize: 17, fontWeight: '700', color: Colors.text, flex: 1 },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 18,
    marginBottom: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 6,
  },
  optionActive: { borderColor: Colors.primary, backgroundColor: Colors.secondary },
  optionDisabled: { opacity: 0.55 },
  optionBody: { flex: 1 },
  optionLabel: { fontSize: 14, fontWeight: '600', color: Colors.text },
  optionHint: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  mutedText: { color: Colors.textSecondary },

  durationRow: { flexDirection: 'row', gap: 8 },
  duration: {
    flex: 1,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  durationActive: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  durationLabel: { fontSize: 14, fontWeight: '700', color: Colors.text },
  durationLabelActive: { color: '#fff' },
  durationHint: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 2 },
  durationHintActive: { color: 'rgba(255,255,255,0.85)' },

  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  reason: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  reasonActive: { backgroundColor: Colors.ember, borderColor: Colors.ember },
  reasonText: { fontSize: 12.5, color: Colors.text },
  reasonTextActive: { color: '#fff', fontWeight: '600' },

  actions: { flexDirection: 'row', gap: 10, marginTop: 22 },
  cancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  cancelText: { fontWeight: '600', color: Colors.text },
  confirm: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.danger,
    alignItems: 'center',
  },
  confirmText: { fontWeight: '700', color: '#fff' },
});
