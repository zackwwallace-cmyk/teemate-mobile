import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Logo } from '@/components/Logo';
import { colors } from '@/lib/theme';
import { TEEMATE_PLUS_PRODUCTS } from '@/lib/premium';
import { getTeeMateStoreProducts, purchaseTeeMatePlus, restoreTeeMatePlus } from '@/lib/storeBilling';
import { useSession } from '@/lib/useSession';

const benefits = ['Unlimited partner requests', 'Advanced partner filters', 'Profile boosts', 'See who wants to play', 'TeeMate+ badge', 'Early access to new features'];

export default function UpgradeScreen() {
  const router = useRouter();
  const { session, loading } = useSession();
  const [busyPlan, setBusyPlan] = useState<'monthly' | 'yearly' | 'restore' | null>(null);
  const [monthlyPrice, setMonthlyPrice] = useState(TEEMATE_PLUS_PRODUCTS.monthly.price);
  const [yearlyPrice, setYearlyPrice] = useState(TEEMATE_PLUS_PRODUCTS.yearly.price);
  const [purchaseReady, setPurchaseReady] = useState(false);

  useEffect(() => {
    async function loadProducts() {
      if (!session?.user.id) return;
      try {
        const products = await getTeeMateStoreProducts();
        setMonthlyPrice(products.monthly?.localizedPrice ?? TEEMATE_PLUS_PRODUCTS.monthly.price);
        setYearlyPrice(products.yearly?.localizedPrice ?? TEEMATE_PLUS_PRODUCTS.yearly.price);
        setPurchaseReady(Boolean(products.monthly || products.yearly));
      } catch (error: any) {
        console.log('Store billing products error:', error?.message ?? error);
      }
    }
    loadProducts();
  }, [session?.user.id]);

  if (loading) return <SafeAreaView style={styles.center}><ActivityIndicator color={colors.pine} /></SafeAreaView>;
  if (!session) return <Redirect href="/" />;

  async function choosePlan(plan: 'monthly' | 'yearly') {
    if (!session?.user.id) return;
    setBusyPlan(plan);
    try {
      const { error, purchase } = await purchaseTeeMatePlus(session.user.id, plan);
      if (error) throw error;
      if (!purchase) return Alert.alert('Purchase not active', 'The store did not return an active TeeMate+ purchase. Try Restore purchases or contact support.');
      Alert.alert('TeeMate+ unlocked', 'Your TeeMate+ subscription is active.', [{ text: 'Continue', onPress: () => router.back() }]);
    } catch (error: any) {
      if (!String(error?.message ?? '').toLowerCase().includes('cancel')) Alert.alert('Purchase failed', error?.message ?? 'Something went wrong starting the purchase.');
    } finally {
      setBusyPlan(null);
    }
  }

  async function restore() {
    if (!session?.user.id) return;
    setBusyPlan('restore');
    try {
      const { error, purchase } = await restoreTeeMatePlus(session.user.id);
      if (error) throw error;
      Alert.alert(purchase ? 'Purchases restored' : 'No active purchase found', purchase ? 'TeeMate+ is active on your account.' : 'We did not find an active TeeMate+ subscription for this store account.');
    } catch (error: any) {
      Alert.alert('Restore failed', error?.message ?? 'Something went wrong restoring purchases.');
    } finally {
      setBusyPlan(null);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topbar}><TouchableOpacity onPress={() => router.back()} style={styles.backButton}><Ionicons name="arrow-back" size={22} color={colors.pine} /></TouchableOpacity><Logo /><View style={styles.backButton} /></View>
        <View style={styles.hero}><View style={styles.icon}><Ionicons name="flash" size={34} color={colors.pine} /></View><Text style={styles.title}>Upgrade to TeeMate+</Text><Text style={styles.subtitle}>Send unlimited partner requests, boost your profile, and find the right golfers faster.</Text>{!purchaseReady ? <Text style={styles.setupNote}>Store subscriptions must be configured in App Store Connect and Google Play Console before launch.</Text> : null}</View>
        <View style={styles.planRow}><PlanCard title="Monthly" price={monthlyPrice} button="Choose monthly" onPress={() => choosePlan('monthly')} loading={busyPlan === 'monthly'} /><PlanCard title="Yearly" price={yearlyPrice} badge="Best value" helper="Save about 17%" button="Choose yearly" onPress={() => choosePlan('yearly')} loading={busyPlan === 'yearly'} featured /></View>
        <View style={styles.benefitsCard}><Text style={styles.benefitsTitle}>Included with TeeMate+</Text>{benefits.map((benefit) => <View key={benefit} style={styles.benefitRow}><Ionicons name="checkmark-circle" size={20} color={colors.pine} /><Text style={styles.benefitText}>{benefit}</Text></View>)}</View>
        <TouchableOpacity disabled={busyPlan === 'restore'} onPress={restore} style={styles.restoreButton}>{busyPlan === 'restore' ? <ActivityIndicator color={colors.pine} /> : <Text style={styles.restoreText}>Restore purchases</Text>}</TouchableOpacity>
        <Text style={styles.footer}>Android subscriptions use Google Play Billing. iPhone subscriptions use Apple In-App Purchase.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function PlanCard({ title, price, badge, helper, button, onPress, featured, loading }: { title: string; price: string; badge?: string; helper?: string; button: string; onPress: () => void; featured?: boolean; loading?: boolean }) { return <View style={[styles.planCard, featured && styles.planFeatured]}>{badge ? <Text style={styles.planBadge}>{badge}</Text> : null}<Text style={styles.planTitle}>{title}</Text><Text style={styles.planPrice}>{price}</Text>{helper ? <Text style={styles.planHelper}>{helper}</Text> : <Text style={styles.planHelper}>Flexible monthly access</Text>}<TouchableOpacity disabled={loading} onPress={onPress} style={[styles.planButton, featured && styles.planButtonFeatured]}>{loading ? <ActivityIndicator color={colors.cream} /> : <Text style={styles.planButtonText}>{button}</Text>}</TouchableOpacity></View>; }

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.background }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }, content: { padding: 20, paddingBottom: 36 }, topbar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 22 }, backButton: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 999, borderWidth: 1, height: 42, justifyContent: 'center', width: 42 }, hero: { alignItems: 'center', marginBottom: 22 }, icon: { alignItems: 'center', backgroundColor: colors.lime, borderRadius: 999, height: 72, justifyContent: 'center', marginBottom: 14, width: 72 }, title: { color: colors.pine, fontSize: 34, fontWeight: '900', textAlign: 'center' }, subtitle: { color: colors.muted, fontSize: 16, lineHeight: 23, marginTop: 8, textAlign: 'center' }, setupNote: { backgroundColor: '#FEF3C7', borderRadius: 14, color: '#78350F', fontSize: 12, fontWeight: '800', lineHeight: 18, marginTop: 12, overflow: 'hidden', padding: 12, textAlign: 'center' }, planRow: { gap: 12 }, planCard: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 24, borderWidth: 1, padding: 18 }, planFeatured: { borderColor: colors.pine, borderWidth: 2 }, planBadge: { alignSelf: 'flex-start', backgroundColor: colors.lime, borderRadius: 999, color: colors.ink, fontSize: 11, fontWeight: '900', marginBottom: 10, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5 }, planTitle: { color: colors.ink, fontSize: 20, fontWeight: '900' }, planPrice: { color: colors.pine, fontSize: 28, fontWeight: '900', marginTop: 5 }, planHelper: { color: colors.muted, fontSize: 13, fontWeight: '800', marginTop: 4 }, planButton: { alignItems: 'center', backgroundColor: colors.pine, borderRadius: 17, justifyContent: 'center', marginTop: 16, minHeight: 52 }, planButtonFeatured: { backgroundColor: colors.pine }, planButtonText: { color: colors.cream, fontSize: 15, fontWeight: '900' }, benefitsCard: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 24, borderWidth: 1, gap: 12, marginTop: 16, padding: 18 }, benefitsTitle: { color: colors.ink, fontSize: 18, fontWeight: '900', marginBottom: 2 }, benefitRow: { alignItems: 'center', flexDirection: 'row', gap: 10 }, benefitText: { color: colors.ink, flex: 1, fontSize: 15, fontWeight: '800' }, restoreButton: { alignItems: 'center', justifyContent: 'center', marginTop: 18, minHeight: 46 }, restoreText: { color: colors.pine, fontSize: 15, fontWeight: '900' }, footer: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 6, textAlign: 'center' } });
