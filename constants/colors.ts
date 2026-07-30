// Smoky Mountain palette — evergreen, morning mist, warm ember.
// Same token shape as ../mcmichael-munchies/constants/colors.ts so components port cleanly.
export const Colors = {
  primary: '#2f5d50',          // deep evergreen — buttons, active states
  primaryLight: '#4a8a76',
  ember: '#c1502e',            // warm ember — accents, "search" CTA
  emberLight: '#e08a63',
  secondary: '#dfe7e3',        // mist — chips, category tiles
  secondaryDark: '#c9d6d0',
  background: '#f7f9f8',       // cool off-white
  surface: '#ffffff',
  text: '#1f2a27',
  textSecondary: '#6b7c77',
  border: '#d8e0dc',
  cardBackground: '#ffffff',
  tabBar: '#ffffff',
  tabBarActive: '#2f5d50',
  tabBarInactive: '#a3b0ab',
  footer: '#eaf0ed',
  danger: '#b3391c',
  success: '#3f7d5c',
  warning: '#b8860b',
  overlayDark: '#1f2a27',
};

export const Layout = {
  maxWidth: 1140,
  cardMinWidth: 300,
};

/** Availability strip colors, keyed by the A/U/I/O day states. */
export const DayStateColors: Record<string, string> = {
  A: '#4a8a76', // available
  I: '#8fbcab', // check-in only
  O: '#8fbcab', // check-out only
  U: '#e2e6e4', // unavailable
};
