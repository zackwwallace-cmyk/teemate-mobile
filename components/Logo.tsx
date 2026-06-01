import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/lib/theme';

export function Logo() {
  return (
    <View style={styles.wrap}>
      <View style={styles.mark}>
        <View style={styles.dot} />
        <Text style={styles.markText}>T</Text>
      </View>
      <Text style={styles.wordmark}>TeeMate</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  mark: { alignItems: 'center', backgroundColor: colors.pine, borderRadius: 999, height: 34, justifyContent: 'center', position: 'relative', width: 34 },
  dot: { backgroundColor: colors.cream, borderRadius: 999, height: 8, left: 7, position: 'absolute', top: 6, width: 8 },
  markText: { color: colors.lime, fontSize: 18, fontWeight: '900' },
  wordmark: { color: colors.pine, fontSize: 22, fontWeight: '900', letterSpacing: -0.4 },
});
