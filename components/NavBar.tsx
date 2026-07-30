import { View, Text, StyleSheet, TouchableOpacity, Platform, useWindowDimensions } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Layout } from '../constants/colors';
import { useUserRole } from '../lib/useUserRole';
import { hoverProps } from '../lib/webHover';

const LINKS: {
  label: string;
  href: string;
  icon: keyof typeof Ionicons.glyphMap;
  match: (p: string) => boolean;
}[] = [
  { label: 'Cabins', href: '/', icon: 'search-outline', match: (p) => p === '/' || p === '/index' },
  { label: 'Trip', href: '/trip', icon: 'calendar-outline', match: (p) => p.startsWith('/trip') },
  { label: 'Keeps', href: '/keeps', icon: 'bookmark-outline', match: (p) => p.startsWith('/keeps') },
  { label: 'Banned', href: '/banned', icon: 'close-circle-outline', match: (p) => p.startsWith('/banned') },
  { label: 'You', href: '/profile', icon: 'person-outline', match: (p) => p.startsWith('/profile') },
];

const COMPACT_BREAKPOINT = 760;

export default function NavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const { isMember } = useUserRole();
  const compact = width < COMPACT_BREAKPOINT;

  if (Platform.OS !== 'web') return null;

  return (
    <View style={styles.nav}>
      <View style={styles.inner}>
        <TouchableOpacity
          style={styles.brand}
          onPress={() => router.push('/')}
          accessibilityRole="link"
          accessibilityLabel="Home"
        >
          <Ionicons name="home" size={compact ? 20 : 24} color={Colors.primary} />
          {!compact && (
            <View>
              <Text style={styles.brandText}>Labor Day Cabins</Text>
              <Text style={styles.brandSub}>Smokies · 1.5 hrs from Knoxville</Text>
            </View>
          )}
        </TouchableOpacity>

        {isMember && (
          <View style={styles.links}>
            {LINKS.map((link) => {
              const active = link.match(pathname);
              return (
                <TouchableOpacity
                  key={link.href}
                  style={[styles.link, active && styles.linkActive]}
                  onPress={() => router.push(link.href as any)}
                  accessibilityRole="link"
                  accessibilityLabel={link.label}
                  accessibilityState={{ selected: active }}
                  {...hoverProps('nav')}
                >
                  {compact ? (
                    <Ionicons
                      name={link.icon}
                      size={21}
                      color={active ? Colors.primary : Colors.textSecondary}
                    />
                  ) : (
                    <Text style={[styles.linkText, active && styles.linkTextActive]}>
                      {link.label}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    zIndex: 1000,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    maxWidth: Layout.maxWidth,
    width: '100%',
    alignSelf: 'center',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandText: { fontSize: 17, fontWeight: '800', color: Colors.text, letterSpacing: -0.3 },
  brandSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  links: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  link: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  linkActive: { backgroundColor: Colors.secondary },
  linkText: { fontSize: 14.5, fontWeight: '500', color: Colors.textSecondary },
  linkTextActive: { color: Colors.primary, fontWeight: '700' },
});
