import { useState } from 'react';
import { Image, type ImageProps, Platform, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';

/** Image with a graceful fallback — scraped hero URLs go stale all the time. */
export default function LazyImage(props: ImageProps) {
  const [failed, setFailed] = useState(false);

  const source = props.source as { uri?: string } | undefined;
  if (failed || !source || (typeof source === 'object' && !source.uri)) {
    return (
      <View style={[styles.fallback, props.style as any]}>
        <Ionicons name="home-outline" size={32} color={Colors.textSecondary} />
      </View>
    );
  }

  const imageProps = { ...props, onError: () => setFailed(true) };

  if (Platform.OS === 'web') {
    // @ts-ignore -- valid <img> attribute, absent from RN's types
    return <Image {...imageProps} loading="lazy" />;
  }
  return <Image {...imageProps} />;
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: Colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
