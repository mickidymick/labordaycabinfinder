import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import Gate from '../components/Gate';
import { supabase, type Company, type Profile } from '../lib/supabase';
import { useUserRole } from '../lib/useUserRole';

export default function AdminScreen() {
  return (
    <Gate>
      <Admin />
    </Gate>
  );
}

function Admin() {
  const { isAdmin } = useUserRole();
  const [allowed, setAllowed] = useState<{ email: string; note: string | null }[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [a, p, c] = await Promise.all([
      supabase.from('allowed_emails').select('email, note').order('email'),
      supabase.from('profiles').select('*').order('created_at'),
      supabase.from('companies').select('*').order('name'),
    ]);
    setAllowed(a.data ?? []);
    setProfiles((p.data ?? []) as Profile[]);
    setCompanies((c.data ?? []) as Company[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!isAdmin) {
    return (
      <View style={styles.center}>
        <Ionicons name="lock-closed-outline" size={40} color={Colors.textSecondary} />
        <Text style={styles.emptyTitle}>Admins only</Text>
      </View>
    );
  }

  const addEmail = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    setError(null);
    // The allowed_emails insert trigger promotes them straight to `member`,
    // even if they already signed in and got parked in `pending`.
    const { error } = await supabase.from('allowed_emails').insert({ email });
    if (error) setError(error.message);
    else {
      setNewEmail('');
      await load();
    }
  };

  const removeEmail = async (email: string) => {
    await supabase.from('allowed_emails').delete().eq('email', email);
    await load();
  };

  const toggleCompany = async (company: Company) => {
    await supabase.from('companies').update({ enabled: !company.enabled }).eq('id', company.id);
    await load();
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Admin</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Who can get in</Text>
        <Text style={styles.cardSub}>
          Google will authenticate anyone. This list is what actually grants access —
          everyone else is parked in "pending" and sees nothing.
        </Text>

        <View style={styles.addRow}>
          <TextInput
            style={styles.input}
            value={newEmail}
            onChangeText={setNewEmail}
            placeholder="friend@gmail.com"
            placeholderTextColor={Colors.textSecondary}
            autoCapitalize="none"
            keyboardType="email-address"
            accessibilityLabel="Email to allow"
          />
          <TouchableOpacity style={styles.addBtn} onPress={addEmail}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addBtnText}>Allow</Text>
          </TouchableOpacity>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {allowed.map((a) => {
          const profile = profiles.find((p) => p.email?.toLowerCase() === a.email.toLowerCase());
          return (
            <View key={a.email} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{a.email}</Text>
                <Text style={styles.rowMeta}>
                  {profile ? `signed in · ${profile.role}` : 'has not signed in yet'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => removeEmail(a.email)}>
                <Ionicons name="trash-outline" size={17} color={Colors.danger} />
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Sources</Text>
        <Text style={styles.cardSub}>
          Disabled sources are skipped by both search and the nightly refresh. Ones marked
          "no calendar" can list cabins but can't confirm your dates.
        </Text>

        {companies.map((c) => (
          <View key={c.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{c.name}</Text>
              <Text style={styles.rowMeta}>
                {c.adapter}
                {c.supports_availability ? ' · real availability' : ' · no calendar'}
                {c.last_warmed_at
                  ? ` · warmed ${new Date(c.last_warmed_at).toLocaleDateString()}`
                  : ' · never warmed'}
              </Text>
            </View>
            <Switch
              value={c.enabled}
              onValueChange={() => toggleCompany(c)}
              trackColor={{ true: Colors.primaryLight, false: Colors.border }}
              thumbColor={c.enabled ? Colors.primary : '#f4f3f4'}
              accessibilityLabel={`Enable ${c.name}`}
            />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 14, maxWidth: 760, width: '100%', alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  title: { fontSize: 24, fontWeight: '800', color: Colors.text },

  card: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 15,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  cardSub: { fontSize: 12.5, color: Colors.textSecondary, marginTop: 3, lineHeight: 18 },

  addRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 9,
    fontSize: 14,
    color: Colors.text,
    backgroundColor: Colors.background,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.primary,
    paddingHorizontal: 15,
    borderRadius: 8,
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13.5 },
  error: { color: Colors.danger, fontSize: 12.5, marginTop: 8 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginTop: 10,
  },
  rowTitle: { fontSize: 14, fontWeight: '600', color: Colors.text },
  rowMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
});
