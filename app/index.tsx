import { Redirect } from 'expo-router';
import { ActivityIndicator, SafeAreaView, StyleSheet } from 'react-native';
import { colors } from '@/lib/theme';
import { useSession } from '@/lib/useSession';

export default function LandingScreen() {
  const { session, loading } = useSession();

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.pine} />
      </SafeAreaView>
    );
  }

  return <Redirect href={session ? '/rounds' : '/auth'} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
});
