import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { SplashColors } from './splashColors';

// Progress breakpoints (fractions of the full 0-1 splash timeline).
// Values mirror the discrete stages captured in the Figma "Start Splash Art" flow.
const SQUIRCLE_END = 0.219;
const GREEN_CIRCLE_END = 0.328;
const BLUE_CIRCLE_END = 0.4375;
const GRADIENT_CIRCLE_END = 0.5625;

type Props = {
  progress: SharedValue<number>;
};

/**
 * Renders the rotating squircle -> solid circle -> gradient circle sequence
 * from the splash design. Each stage is a stacked, absolutely positioned
 * layer whose opacity crossfades in/out as `progress` sweeps through its
 * range, since gradient color stops can't be interpolated directly.
 */
export function MorphingShape({ progress }: Props) {
  const containerStyle = useAnimatedStyle(() => {
    // Fade the whole shape out as the fullscreen gradient takes over.
    const opacity = interpolate(progress.value, [GRADIENT_CIRCLE_END - 0.06, GRADIENT_CIRCLE_END], [1, 0], 'clamp');
    return { opacity };
  });

  const squircleStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const opacity = interpolate(p, [0, SQUIRCLE_END - 0.04, SQUIRCLE_END], [1, 1, 0], 'clamp');
    const size = interpolate(p, [0, 0.06, 0.11, 0.16, SQUIRCLE_END], [70, 122, 86, 130, 64], 'clamp');
    const rotate = interpolate(p, [0, 0.06, 0.11, 0.16, SQUIRCLE_END], [-23, -23, 60, 135, 180], 'clamp');
    return {
      opacity,
      width: size,
      height: size,
      transform: [{ rotate: `${rotate}deg` }],
    };
  });

  const greenCircleStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const opacity = interpolate(
      p,
      [SQUIRCLE_END - 0.04, SQUIRCLE_END, GREEN_CIRCLE_END - 0.02, GREEN_CIRCLE_END],
      [0, 1, 1, 0],
      'clamp'
    );
    const size = interpolate(p, [SQUIRCLE_END, GREEN_CIRCLE_END], [96, 105], 'clamp');
    return {
      opacity,
      width: size,
      height: size,
      borderRadius: size / 2,
    };
  });

  const blueCircleStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const opacity = interpolate(
      p,
      [GREEN_CIRCLE_END - 0.02, GREEN_CIRCLE_END, BLUE_CIRCLE_END - 0.02, BLUE_CIRCLE_END],
      [0, 1, 1, 0],
      'clamp'
    );
    const size = interpolate(p, [GREEN_CIRCLE_END, BLUE_CIRCLE_END], [105, 133], 'clamp');
    return {
      opacity,
      width: size,
      height: size,
      borderRadius: size / 2,
    };
  });

  const gradientCircleStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const opacity = interpolate(p, [BLUE_CIRCLE_END - 0.02, BLUE_CIRCLE_END], [0, 1], 'clamp');
    const size = interpolate(p, [BLUE_CIRCLE_END, GRADIENT_CIRCLE_END], [133, 194], 'clamp');
    return {
      opacity,
      width: size,
      height: size,
      borderRadius: size / 2,
    };
  });

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      <Animated.View style={[styles.layer, styles.squircleRadius, squircleStyle]}>
        <LinearGradient colors={SplashColors.blueGradient} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View style={[styles.layer, greenCircleStyle, { backgroundColor: SplashColors.green }]} />
      <Animated.View style={[styles.layer, blueCircleStyle]}>
        <LinearGradient colors={SplashColors.blueGradient} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View style={[styles.layer, gradientCircleStyle]}>
        <LinearGradient colors={SplashColors.greenBlueGradient} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  layer: {
    position: 'absolute',
    overflow: 'hidden',
  },
  squircleRadius: {
    borderRadius: 20,
  },
});
