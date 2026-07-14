import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { SplashColors } from './splashColors';

const FADE_IN_START = 0.5;
const FADE_IN_END = 0.5625;
const FADE_OUT_START = 0.65;
const FADE_OUT_END = 0.75;

type Props = {
  progress: SharedValue<number>;
};

/**
 * Fullscreen green -> blue gradient that takes over once the growing
 * circle from MorphingShape has expanded past the viewport, then fades
 * out to reveal the white background + logo.
 */
export function GradientFill({ progress }: Props) {
  const style = useAnimatedStyle(() => {
    const opacity = interpolate(
      progress.value,
      [FADE_IN_START, FADE_IN_END, FADE_OUT_START, FADE_OUT_END],
      [0, 1, 1, 0],
      'clamp'
    );
    return { opacity };
  });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      <LinearGradient colors={SplashColors.greenBlueGradient} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}
