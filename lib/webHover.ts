/**
 * react-native-web forwards `dataSet` to the DOM as data-* attributes, which is
 * how the hover styles in app/_layout.tsx hook onto elements. React Native's own
 * types don't know about it, so this returns a widened object — spreading it
 * keeps the call sites free of scattered @ts-ignore comments.
 */
export function hoverProps(kind: 'card' | 'chip' | 'btn' | 'icon' | 'nav'): object {
  return { dataSet: { hover: kind } };
}
