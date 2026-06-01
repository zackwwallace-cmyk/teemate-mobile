import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors } from '@/lib/theme';
import { supabase } from '@/lib/supabase';

export default function AuthScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<'landing' | 'signup' | 'signin'>(params.mode === 'signup' ? 'signup' : params.mode === 'signin' ? 'signin' : 'landing');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!email || !password) {
      Alert.alert('Missing info', 'Enter your email and password.');
      return;
    }

    setLoading(true);
    const result = mode === 'signup'
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (result.error) {
      Alert.alert('TeeMate', result.error.message);
      return;
    }

    router.replace(mode === 'signup' ? '/onboarding' : '/rounds');
  }

  if (mode === 'landing') {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.landingWrap}>
          <View style={styles.heroBlock}>
            <Text style={styles.heroLine}>Find your</Text>
            <View style={styles.highlightPill}><Text style={styles.highlightText}>TeeMate.</Text></View>
            <Text style={styles.heroSubtitle}>Sign in to keep connecting and scheduling rounds.</Text>
          </View>

          <View style={styles.landingActions}>
            <TouchableOpacity onPress={() => setMode('signup')} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Create account</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMode('signin')} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>I already have an account</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.footerText}>Meetups always happen at public courses. Be kind. Play well.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap}>
        <TouchableOpacity onPress={() => setMode('landing')} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.formHero}>
          <Text style={styles.heroLine}>{mode === 'signup' ? 'Create your' : 'Welcome'}</Text>
          <View style={styles.highlightPill}><Text style={styles.highlightText}>{mode === 'signup' ? 'account.' : 'back.'}</Text></View>
          <Text style={styles.heroSubtitle}>{mode === 'signup' ? 'Start matching with golfers near you.' : 'Sign in to keep connecting and scheduling rounds.'}</Text>
        </View>

        <View style={styles.form}>
          <TextInput autoCapitalize="none" autoComplete="email" keyboardType="email-address" onChangeText={setEmail} placeholder="Email" placeholderTextColor={colors.muted} style={styles.input} value={email} />
          <TextInput autoCapitalize="none" onChangeText={setPassword} placeholder="Password" placeholderTextColor={colors.muted} secureTextEntry style={styles.input} value={password} />
          <TouchableOpacity disabled={loading} onPress={submit} style={styles.primaryButton}>
            {loading ? <ActivityIndicator color={colors.cream} /> : <Text style={styles.primaryButtonText}>{mode === 'signup' ? 'Create account' : 'Sign in'}</Text>}
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => setMode(mode === 'signup' ? 'signin' : 'signup')} style={styles.inlineSwitch}>
          <Text style={styles.switchText}>{mode === 'signup' ? 'I already have an account' : 'Create account'}</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  landingWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 34 },
  heroBlock: { alignItems: 'center', marginBottom: 54 },
  heroLine: { color: colors.pine, fontSize: 48, fontWeight: '900', letterSpacing: -1.2, lineHeight: 54, textAlign: 'center' },
  highlightPill: { backgroundColor: colors.lime, borderRadius: 14, marginTop: -2, paddingHorizontal: 12, paddingVertical: 2 },
  highlightText: { color: colors.ink, fontSize: 48, fontWeight: '900', letterSpacing: -1.2, lineHeight: 58, textAlign: 'center' },
  heroSubtitle: { alignSelf: 'stretch', color: colors.muted, fontSize: 20, lineHeight: 29, marginTop: 28, textAlign: 'left' },
  landingActions: { gap: 14 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.pine, borderRadius: 24, minHeight: 68, justifyContent: 'center', shadowColor: colors.ink, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.14, shadowRadius: 12, elevation: 3 },
  primaryButtonText: { color: colors.cream, fontSize: 18, fontWeight: '900' },
  secondaryButton: { alignItems: 'center', backgroundColor: 'transparent', borderColor: '#CFC7B7', borderRadius: 24, borderWidth: 1, minHeight: 68, justifyContent: 'center' },
  secondaryButtonText: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  footerText: { color: colors.ink, fontSize: 13, lineHeight: 18, marginTop: 34, opacity: 0.84, textAlign: 'center' },
  wrap: { flex: 1, justifyContent: 'center', padding: 24 },
  backButton: { marginBottom: 20 },
  backText: { color: colors.pine, fontSize: 15, fontWeight: '900' },
  formHero: { alignItems: 'center', marginBottom: 24 },
  form: { gap: 12 },
  input: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, color: colors.ink, fontSize: 16, padding: 16 },
  inlineSwitch: { marginTop: 22 },
  switchText: { color: colors.pine, fontSize: 15, fontWeight: '900', textAlign: 'center' },
});