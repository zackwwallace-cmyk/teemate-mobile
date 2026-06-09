import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { BottomNav } from '@/components/BottomNav';
import { Logo } from '@/components/Logo';
import { getAllCourses, type Course } from '@/lib/data';
import { colors } from '@/lib/theme';
import { useSession } from '@/lib/useSession';

export default function CoursesScreen() {
  const { session, loading } = useSession();
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');

  async function load() {
    setRefreshing(true);
    const { data } = await getAllCourses();
    setCourses(data ?? []);
    setRefreshing(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return courses;
    return courses.filter((course) => [course.name, course.town, course.state].filter(Boolean).join(' ').toLowerCase().includes(term));
  }, [courses, query]);

  if (loading) return <SafeAreaView style={styles.center}><ActivityIndicator color={colors.pine} /></SafeAreaView>;
  if (!session) return <Redirect href="/" />;

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}>
        <View style={styles.topbar}><Logo /></View>
        <Text style={styles.title}>Courses</Text>
        <Text style={styles.subtitle}>Search courses, view TeeMate reviews, see open rounds, and post a round from a course profile.</Text>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={19} color={colors.muted} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Search courses..." placeholderTextColor={colors.muted} style={styles.searchInput} />
        </View>
        {filtered.map((course) => (
          <TouchableOpacity key={course.id} onPress={() => router.push({ pathname: '/course/[id]', params: { id: course.id } })} style={styles.card}>
            <View style={styles.placeholder}><Ionicons name="golf-outline" size={24} color={colors.pine} /></View>
            <View style={styles.flex}>
              <Text style={styles.name}>{course.name}</Text>
              <Text style={styles.meta}>{[course.town, course.state].filter(Boolean).join(', ') || 'Golf course'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.pine} />
          </TouchableOpacity>
        ))}
        {!filtered.length ? <Text style={styles.empty}>No courses found yet.</Text> : null}
      </ScrollView>
      <BottomNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingBottom: 118 },
  flex: { flex: 1 },
  topbar: { marginBottom: 14 },
  title: { color: colors.pine, fontSize: 34, fontWeight: '900' },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20, marginBottom: 16 },
  searchBox: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 10, marginBottom: 14, paddingHorizontal: 14 },
  searchInput: { color: colors.ink, flex: 1, fontSize: 16, minHeight: 50 },
  card: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 22, borderWidth: 1, flexDirection: 'row', gap: 12, marginBottom: 12, padding: 14 },
  placeholder: { alignItems: 'center', backgroundColor: 'rgba(21,64,44,0.1)', borderRadius: 18, height: 52, justifyContent: 'center', width: 52 },
  name: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  meta: { color: colors.muted, fontSize: 13, fontWeight: '700', marginTop: 3 },
  empty: { color: colors.muted, fontWeight: '800', marginTop: 18, textAlign: 'center' },
});
