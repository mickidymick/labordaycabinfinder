import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Layout } from '../constants/colors';
import { AMENITIES, TOWNS } from '../constants/cabins';
import Gate from '../components/Gate';
import ChipRow from '../components/ChipRow';
import { useTripConfig, nightCount } from '../lib/useTripConfig';
import type { TripConfig } from '../lib/supabase';
import { hoverProps } from '../lib/webHover';

export default function TripScreen() {
  return (
    <Gate>
      <TripEditor />
    </Gate>
  );
}

/** One shared config for the whole group — whoever edits last wins, on purpose. */
function TripEditor() {
  const { config, loading, saving, error, save } = useTripConfig();
  const [draft, setDraft] = useState<TripConfig | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { if (config && !draft) setDraft(config); }, [config, draft]);

  if (loading || !draft) {
    return <View style={styles.screen}><Text style={styles.muted}>Loading…</Text></View>;
  }

  const set = <K extends keyof TripConfig>(key: K, value: TripConfig[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  const toggleArray = (key: 'required_amenities' | 'towns') => (value: string) =>
    setDraft((d) => {
      if (!d) return d;
      const list = d[key] ?? [];
      return {
        ...d,
        [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
      };
    });

  const onSave = async () => {
    const ok = await save({
      season_year: draft.season_year,
      check_in: draft.check_in,
      check_out: draft.check_out,
      guests: draft.guests,
      min_bedrooms: draft.min_bedrooms,
      max_nightly_rate: draft.max_nightly_rate,
      max_total: draft.max_total,
      required_amenities: draft.required_amenities,
      towns: draft.towns,
      max_drive_minutes: draft.max_drive_minutes,
      min_rating: draft.min_rating,
    });
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  };

  const nights = nightCount(draft);
  const datesValid = draft.check_out > draft.check_in;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>The trip</Text>
      <Text style={styles.subtitle}>
        Everyone shares these. Change them and the whole group's results change — that's
        the point.
      </Text>

      <Section title="Dates">
        <View style={styles.row}>
          <Field
            label="Check in"
            value={draft.check_in}
            placeholder="YYYY-MM-DD"
            onChange={(v) => set('check_in', v)}
          />
          <Field
            label="Check out"
            value={draft.check_out}
            placeholder="YYYY-MM-DD"
            onChange={(v) => set('check_out', v)}
          />
          <Field
            label="Season year"
            value={String(draft.season_year)}
            onChange={(v) => set('season_year', Number(v) || draft.season_year)}
          />
        </View>
        {!datesValid ? (
          <Text style={styles.warn}>Check-out has to be after check-in.</Text>
        ) : (
          <Text style={styles.hint}>
            {nights} night{nights === 1 ? '' : 's'}. Bumping the season year retires every
            "this year only" ban.
          </Text>
        )}
      </Section>

      <Section title="The group">
        <View style={styles.row}>
          <Field
            label="People"
            value={String(draft.guests)}
            onChange={(v) => set('guests', Number(v) || 0)}
          />
          <Field
            label="Min bedrooms"
            value={draft.min_bedrooms == null ? '' : String(draft.min_bedrooms)}
            placeholder="any"
            onChange={(v) => set('min_bedrooms', v ? Number(v) : null)}
          />
          <Field
            label="Min rating"
            value={draft.min_rating == null ? '' : String(draft.min_rating)}
            placeholder="any"
            onChange={(v) => set('min_rating', v ? Number(v) : null)}
          />
        </View>
      </Section>

      <Section title="Budget">
        <View style={styles.row}>
          <Field
            label="Max per night ($)"
            value={draft.max_nightly_rate == null ? '' : String(draft.max_nightly_rate)}
            placeholder="no cap"
            onChange={(v) => set('max_nightly_rate', v ? Number(v) : null)}
          />
          <Field
            label="Max trip total ($)"
            value={draft.max_total == null ? '' : String(draft.max_total)}
            placeholder="no cap"
            onChange={(v) => set('max_total', v ? Number(v) : null)}
          />
          <Field
            label="Max drive (min)"
            value={draft.max_drive_minutes == null ? '' : String(draft.max_drive_minutes)}
            placeholder="90"
            onChange={(v) => set('max_drive_minutes', v ? Number(v) : null)}
          />
        </View>
        <Text style={styles.hint}>
          Drive time is estimated from coordinates, not routed — 90 minutes is roughly the
          1.5-hour ring around Knoxville.
        </Text>
      </Section>

      <Section title="Requirements">
        <ChipRow
          label="Must have"
          items={AMENITIES}
          selected={draft.required_amenities ?? []}
          onToggle={toggleArray('required_amenities')}
        />
        <ChipRow
          label="Towns (none selected = anywhere in range)"
          items={TOWNS}
          selected={draft.towns ?? []}
          onToggle={toggleArray('towns')}
        />
      </Section>

      {error ? <Text style={styles.warn}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.save, (!datesValid || saving) && styles.saveDisabled]}
        onPress={onSave}
        disabled={!datesValid || saving}
        {...hoverProps('btn')}
      >
        <Ionicons name={saved ? 'checkmark' : 'save-outline'} size={17} color="#fff" />
        <Text style={styles.saveText}>
          {saving ? 'Saving…' : saved ? 'Saved' : 'Save for everyone'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={Colors.textSecondary}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 16, maxWidth: 800, width: '100%', alignSelf: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: Colors.text },
  subtitle: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20, marginTop: -8 },
  muted: { color: Colors.textSecondary, padding: 20 },

  section: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 14,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 4 },

  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  field: { flexGrow: 1, flexBasis: 150 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 5,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 9,
    fontSize: 14,
    color: Colors.text,
    backgroundColor: Colors.background,
  },
  hint: { fontSize: 12, color: Colors.textSecondary, marginTop: 10, lineHeight: 17 },
  warn: { fontSize: 12.5, color: Colors.danger, marginTop: 10, fontWeight: '600' },

  save: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 10,
  },
  saveDisabled: { opacity: 0.5 },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
