import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import Gate from '../components/Gate';
import { signOut, useUserRole } from '../lib/useUserRole';
import { useTripConfig, formatDateRange } from '../lib/useTripConfig';
import { useBans } from '../lib/useBans';
import { useKeeps } from '../lib/useKeeps';

export default function ProfileScreen() {
  return (
    <Gate>
      <ProfileBody />
    </Gate>
  );
}

function ProfileBody() {
  const router = useRouter();
  const { profile, email, isAdmin } = useUserRole();
  const { config } = useTripConfig();
  const { bans } = useBans(config?.season_year ?? null);
  const { keeps } = useKeeps();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={26} color={Colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{profile?.full_name || email}</Text>
          <Text style={styles.role}>
            {email} · {profile?.role}
          </Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <StatCard label="Keeps" value={keeps.length} />
        <StatCard label="Bans" value={bans.length} />
        <StatCard label="Trip" value={config?.season_year ?? '—'} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>This year's trip</Text>
        <Text style={styles.cardBody}>{formatDateRange(config)}</Text>
        <TouchableOpacity onPress={() => router.push('/trip')}>
          <Text style={styles.link}>Edit trip settings</Text>
        </TouchableOpacity>
      </View>

      {isAdmin && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Admin</Text>
          <Text style={styles.cardBody}>Manage who can get in and which sources run.</Text>
          <TouchableOpacity onPress={() => router.push('/admin')}>
            <Text style={styles.link}>Open admin</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={styles.signOut} onPress={signOut}>
        <Ionicons name="log-out-outline" size={17} color={Colors.danger} />
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 14, maxWidth: 720, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: Colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 20, fontWeight: '800', color: Colors.text },
  role: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },

  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  statValue: { fontSize: 22, fontWeight: '800', color: Colors.primary },
  statLabel: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  card: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 15,
    gap: 4,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  cardBody: { fontSize: 13.5, color: Colors.textSecondary },
  link: { fontSize: 13.5, color: Colors.primary, fontWeight: '700', marginTop: 6 },

  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 13,
    borderRadius: 10,
    marginTop: 8,
  },
  signOutText: { color: Colors.danger, fontWeight: '700' },
});
