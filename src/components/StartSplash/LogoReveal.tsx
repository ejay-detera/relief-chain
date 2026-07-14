import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

const LOGO_FADE_START = 0.7;
const LOGO_FADE_END = 0.85;

// Logo.svg's native aspect ratio (329 x 185) preserved at display size.
const LOGO_WIDTH = 220;
const LOGO_HEIGHT = Math.round((LOGO_WIDTH * 185) / 329);

type Props = {
  progress: SharedValue<number>;
};

/**
 * Fades and scales the Relief Chain logo in over the (already white)
 * splash background as the final beat of the sequence.
 */
export function LogoReveal({ progress }: Props) {
  const logoStyle = useAnimatedStyle(() => {
    const opacity = interpolate(progress.value, [LOGO_FADE_START, LOGO_FADE_END], [0, 1], 'clamp');
    const scale = interpolate(progress.value, [LOGO_FADE_START, LOGO_FADE_END], [0.85, 1], 'clamp');
    return { opacity, transform: [{ scale }] };
  });

  return (
    <Animated.View style={[styles.container, logoStyle]}>
      <Image source={require('@/assets/public/Logo.svg')} style={styles.logo} contentFit="contain" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: LOGO_WIDTH,
    height: LOGO_HEIGHT,
  },
});
