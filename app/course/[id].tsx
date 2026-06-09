import { Ionicons } from '@expo/vector-icons';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { BottomNav } from '@/components/BottomNav';
import { createCourseReview, defaultCourseDescription, getCourseById, getCourseOpenRounds, getCoursePhoto, getCourseReviews, summarizeCourseReviews, type CoursePhoto, type CourseReview } from '@/lib/courseProfiles';
import { type Course, type Round } from '@/lib/data';
import { colors } from '@/lib/theme';
import { useSession } from '@/lib/useSession';

function prettyRound(round: Round) {
  const start = new Date(round.tee_time);
  const date = start.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const time = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${date} • ${time}`;
}

function stars(value: number) {
  const rounded = Math.round(value || 0);
  return '★★★★★'.slice(0, rounded) + '☆☆☆☆☆'.slice(0, Math.max(0, 5 - rounded));
}

export default function CourseProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, loading } = useSession();
  const router = useRouter();
  const [course, setCourse] = useState<Course | null>(null);
  const [photo, setPhoto] = useState<CoursePhoto | null>(null);
  const [reviews, setReviews] = useState<CourseReview[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [rating, setRating] = useState('5');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!id) return;
    setRefreshing(true);
    const { data: courseRow, error } = await getCourseById(id);
    if (error) Alert.alert('Course error', error.message);
    setCourse(courseRow ?? null);
    if (courseRow) {
      const [{ data: reviewRows }, { data: openRounds }, nextPhoto] = await Promise.all([
        getCourseReviews(courseRow.id),
        getCourseOpenRounds(courseRow),
        getCoursePhoto(courseRow),
      ]);
      setReviews(reviewRows ?? []);
      setRounds(openRounds ?? []);
      setPhoto(nextPhoto);
    }
    setRefreshing(false);
  }

  useEffect(() => { load(); }, [id]);

  if (loading) return <SafeAreaView style={styles.center}><ActivityIndicator color={colors.pine} /></SafeAreaView>;
  if (!session) return <Redirect href="/" />;
  if (!course && refreshing) return <SafeAreaView style={styles.center}><ActivityIndicator color={colors.pine} /></SafeAreaView>;

  const summary = summarizeCourseReviews(reviews);
  const description = course ? defaultCourseDescription(course, reviews) : '';

  async function saveReview() {
    if (!course || !session.user.id) return;
    const numericRating = Math.max(1, Math.min(5, Number(rating) || 5));
    setSaving(true);
    const { error } = await createCourseReview({ courseId: course.id, userId: session.user.id, rating: numericRating, body });
    setSaving(false);
    if (error) return Alert.alert('Review error', error.message.includes('course_reviews') ? 'Course reviews table needs to be added in Supabase first.' : error.message);
    setBody('');
    setRating('5');
    setReviewOpen(false);
    await load();
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}><Ionicons name="chevron-back" size={20} color={colors.pine} /><Text style={styles.backText}>Back</Text></TouchableOpacity>
        <View style={styles.heroImage}>
          {photo?.url ? <Image source={{ uri: photo.url }} style={styles.image} /> : <View style={styles.placeholder}><Ionicons name="golf-outline" size={42} color={colors.pine} /><Text style={styles.placeholderText}>TeeMate course profile</Text></View>}
        </View>
        {photo?.source ? <Text style={styles.credit}>Photo source: {photo.source}{photo.attribution ? ` • ${photo.attribution}` : ''}</Text> : <Text style={styles.credit}>No free course photo found yet — showing TeeMate placeholder.</Text>}
        <Text style={styles.title}>{course?.name || 'Course'}</Text>
        <Text style={styles.meta}>{[course?.town, course?.state].filter(Boolean).join(', ') || 'Golf course'}</Text>
        <View style={styles.ratingBox}>
          <Text style={styles.rating}>{summary.count ? summary.average.toFixed(1) : 'New'}</Text>
          <View style={styles.flex}><Text style={styles.stars}>{summary.count ? stars(summary.average) : 'No TeeMate reviews yet'}</Text><Text style={styles.small}>{summary.count} TeeMate {summary.count === 1 ? 'review' : 'reviews'}</Text></View>
        </View>
        <Text style={styles.section}>Course summary</Text>
        <Text style={styles.description}>{description}</Text>
        <View style={styles.actions}>
          <TouchableOpacity onPress={() => router.push({ pathname: '/rounds', params: { courseId: course?.id, courseName: course?.name } })} style={styles.primary}><Text style={styles.primaryText}>Post round here</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setReviewOpen(true)} style={styles.secondary}><Text style={styles.secondaryText}>Leave review</Text></TouchableOpacity>
        </View>
        <Text style={styles.section}>Open rounds here</Text>
        {rounds.map((round) => <TouchableOpacity key={round.id} onPress={() => router.push('/rounds' as any)} style={styles.roundCard}><Text style={styles.roundTitle}>{prettyRound(round)}</Text><Text style={styles.roundMeta}>{round.open_slots} open {round.open_slots === 1 ? 'slot' : 'slots'}</Text></TouchableOpacity>)}
        {!rounds.length ? <Text style={styles.empty}>No open rounds here yet.</Text> : null}
        <Text style={styles.section}>TeeMate reviews</Text>
        {reviews.map((review) => <View key={review.id} style={styles.review}><Text style={styles.reviewName}>{review.reviewer?.display_name || 'TeeMate golfer'}</Text><Text style={styles.reviewStars}>{stars(review.rating)}</Text>{review.body ? <Text style={styles.reviewBody}>{review.body}</Text> : null}</View>)}
        {!reviews.length ? <Text style={styles.empty}>Be the first to review this course.</Text> : null}
      </ScrollView>
      <Modal visible={reviewOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setReviewOpen(false)}>
        <SafeAreaView style={styles.modal}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <TouchableOpacity onPress={() => setReviewOpen(false)} style={styles.close}><Ionicons name="close" size={22} color={colors.pine} /></TouchableOpacity>
            <Text style={styles.modalTitle}>Leave a course review</Text>
            <Text style={styles.label}>Rating 1-5</Text>
            <TextInput value={rating} onChangeText={setRating} keyboardType="number-pad" placeholder="5" placeholderTextColor={colors.muted} style={styles.input} />
            <Text style={styles.label}>Review</Text>
            <TextInput value={body} onChangeText={setBody} multiline placeholder="How was the course? Conditions, pace, value, difficulty..." placeholderTextColor={colors.muted} style={[styles.input, styles.multiline]} />
            <TouchableOpacity disabled={saving} onPress={saveReview} style={styles.primary}>{saving ? <ActivityIndicator color={colors.cream} /> : <Text style={styles.primaryText}>Post review</Text>}</TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
      <BottomNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingBottom: 118 },
  flex: { flex: 1 },
  back: { alignItems: 'center', flexDirection: 'row', gap: 4, marginBottom: 12 },
  backText: { color: colors.pine, fontWeight: '900' },
  heroImage: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 26, borderWidth: 1, height: 190, overflow: 'hidden' },
  image: { height: '100%', width: '100%' },
  placeholder: { alignItems: 'center', backgroundColor: 'rgba(21,64,44,0.1)', flex: 1, justifyContent: 'center', gap: 8 },
  placeholderText: { color: colors.pine, fontWeight: '900' },
  credit: { color: colors.muted, fontSize: 10, marginTop: 6 },
  title: { color: colors.pine, fontSize: 32, fontWeight: '900', marginTop: 16 },
  meta: { color: colors.muted, fontSize: 15, fontWeight: '800', marginTop: 2 },
  ratingBox: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 22, borderWidth: 1, flexDirection: 'row', gap: 14, marginTop: 14, padding: 14 },
  rating: { color: colors.pine, fontSize: 28, fontWeight: '900' },
  stars: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  small: { color: colors.muted, fontSize: 12, fontWeight: '700', marginTop: 3 },
  section: { color: colors.ink, fontSize: 19, fontWeight: '900', marginTop: 20, marginBottom: 8 },
  description: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  primary: { alignItems: 'center', backgroundColor: colors.pine, borderRadius: 16, flex: 1, justifyContent: 'center', minHeight: 50 },
  primaryText: { color: colors.cream, fontWeight: '900' },
  secondary: { alignItems: 'center', borderColor: colors.pine, borderRadius: 16, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 50 },
  secondaryText: { color: colors.pine, fontWeight: '900' },
  roundCard: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginBottom: 8, padding: 13 },
  roundTitle: { color: colors.ink, fontWeight: '900' },
  roundMeta: { color: colors.muted, fontSize: 12, fontWeight: '700', marginTop: 3 },
  review: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginBottom: 10, padding: 13 },
  reviewName: { color: colors.ink, fontWeight: '900' },
  reviewStars: { color: colors.pine, fontWeight: '900', marginTop: 4 },
  reviewBody: { color: colors.muted, lineHeight: 20, marginTop: 6 },
  empty: { color: colors.muted, fontWeight: '800', marginBottom: 6 },
  modal: { flex: 1, backgroundColor: colors.background },
  modalContent: { gap: 12, padding: 20, paddingBottom: 34 },
  close: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 999, borderWidth: 1, height: 42, justifyContent: 'center', width: 42 },
  modalTitle: { color: colors.pine, fontSize: 27, fontWeight: '900' },
  label: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  input: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 14, borderWidth: 1, color: colors.ink, fontSize: 16, padding: 13 },
  multiline: { minHeight: 110, textAlignVertical: 'top' },
});
