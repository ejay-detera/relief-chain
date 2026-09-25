import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

type Props = Readonly<{
  children: React.ReactNode;
  /** Stagger delay in ms before this view starts animating in. Keep the total
   * cascade across a screen under ~400ms so it reads as snappy, not slow. */
  delay?: number;
  style?: StyleProp<ViewStyle>;
}>;

/**
 * Wraps content in a subtle fade + slide-up entrance animation. Intended for
 * dashboard cards/sections so content cascades in on mount instead of
 * popping in all at once. Purely a mount-time animation — it does not
 * re-trigger on re-renders (Reanimated's entering animations only run once
 * per mount by design). Timing-based (no spring/bounce) so the motion settles
 * cleanly instead of overshooting.
 */
export function FadeInView({ children, delay = 0, style }: Props) {
  return (
    <Animated.View entering={FadeInDown.duration(280).delay(delay)} style={style}>
      {children}
    </Animated.View>
  );
}
