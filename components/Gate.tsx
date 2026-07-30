import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { signInWithGoogle, useUserRole } from '../lib/useUserRole';
import { hoverProps } from '../lib/webHover';

/**
 * Wraps every screen. Three states, because "signed in" and "allowed in" are
 * different things here — Google will happily authenticate anyone, and the
 * allowlist is what actually grants access.
 */
export default function Gate({ children }: { children: React.ReactNode }) {
  const { loading, isSignedIn, isMember, isPending, email } = useUserRole();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  if (!isSignedIn) {
    return (
      <View style={styles.center}>
        <Ionicons name="home" size={44} color={Colors.primary} />
        <Text style={styles.title}>Labor Day Cabin Finder</Text>
        <Text style={styles.body}>
          Cabins within about an hour and a half of Knoxville, in one place, so we stop
          arguing over six different tabs.
        </Text>
        <TouchableOpacity
          style={styles.googleBtn}
          onPress={signInWithGoogle}
          accessibilityRole="button"
          {...hoverProps('btn')}
        >
          <Ionicons name="logo-google" size={17} color="#fff" />
          <Text style={styles.googleText}>Sign in with Google</Text>
        </TouchableOpacity>
        <Text style={styles.fine}>Invite only — your email has to be on the list.</Text>
      </View>
    );
  }

  if (isPending || !isMember) {
    return (
      <View style={styles.center}>
        <Ionicons name="hourglass-outline" size={44} color={Colors.ember} />
        <Text style={styles.title}>You're not on the list yet</Text>
        <Text style={styles.body}>
          {email} is signed in, but it hasn't been added to the allowlist. Ask Zach to add
          it, then reload.
        </Text>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
    backgroundColor: Colors.background,
  },
  title: { fontSize: 22, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  body: {
    fontSize: 14.5,
    color: Colors.textSecondary,
    textAlign: 'center',
    maxWidth: 420,
    lineHeight: 21,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: Colors.primary,
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 10,
    marginTop: 8,
  },
  googleText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  fine: { fontSize: 12, color: Colors.textSecondary },
});
