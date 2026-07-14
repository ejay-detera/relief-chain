import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { GradientFill } from './GradientFill';
import { LogoReveal } from './LogoReveal';
import { MorphingShape } from './MorphingShape';
import { useSplashProgress } from './useSplashProgress';

/**
 * Startup splash animation: rotating squircle -> morphing/growing circle
 * -> fullscreen gradient -> crossfade to white with the Relief Chain logo.
 *
 * Drop-in replacement for the previous `AnimatedSplashOverlay`. Keeps the
 * same "hide native splash on first layout, animate, then unmount" contract
 * so nothing else in the app (routing, auth) needs to change.
 */
export function StartSplash() {
  const [animate, setAnimate] = useState(false);
  const [visible, setVisible] = useState(true);
  const hasHiddenNativeSplash = useRef(false);

  const handleFinished = useCallback(() => {
    setVisible(false);
  }, []);

  const progress = useSplashProgress(animate, handleFinished);

  if (!visible) return null;

  return (
    <View
      style={styles.container}
      onLayout={() => {
        if (hasHiddenNativeSplash.current) return;
        hasHiddenNativeSplash.current = true;
        SplashScreen.hideAsync().finally(() => {
          setAnimate(true);
        });
      }}>
      <MorphingShape progress={progress} />
      <GradientFill progress={progress} />
      <LogoReveal progress={progress} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#FFFFFF',
    zIndex: 1000,
  },
});
