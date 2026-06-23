import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { BottomNav } from '@/components/BottomNav';
import { createCourseReview, getCourseById, getCourseOpenRounds, getCoursePhoto, getCourseReviews, uploadCoursePhoto, type CoursePhoto, type CourseProfile, type CourseReview } from '@/lib/courseProfiles';
import type { Round } from '@/lib/data';
import { colors } from '@/lib/theme';
import { useSession } from '@/lib/useSession';

function locationText(course: CourseProfile) {
  return [course.town, course.state].filter(Boolean).join(', ') || 'Golf course';
}

function roundTime(round: Round) {
  const start = new Date(round.tee_time);
  const end = round.tee_time_end ? new Date(round.tee_time_end) : null;
  const date = start.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const startTime = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const endTime = end ? end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;
  return `${date} - ${endTime ? `${startTime} - ${endTime}` : startTime}`;
}

function Stars({ rating }: { rating: number }) {
  const rounded = Math.round(rating);
  return (
    <View style={styles.stars}>
      {Array.from({ length: 5 }).map((_, index) => (
        <Ionicons key={index} name={index < rounded ? 'star' : 'star-outline'} size={16} color={colors.pine} />
      ))}
    </View>
  );
}

export default function CourseProfileScreen() {
  const { session, loading: sessionLoading } = useSession();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const courseId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [course, setCourse] = useState<CourseProfile | null>(null);
  const [photo, setPhoto] = useState<CoursePhoto | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [reviews, setReviews] = useState<CourseReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewBody, setReviewBody] = useState('');
  const [savingReview, setSavingReview] = useState(false);

  const averageRating = useMemo(() => {
    if (!reviews.length) return null;
    return reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
  }, [reviews]);

  const load = useCallback(async () => {
    if (!courseId) {
      setLoading(false);
      return;
    }
    setRefreshing(true);
    const { data: courseRow, error } = await getCourseById(courseId);
    if (error) Alert.alert('Course error', error.message);
    setCourse(courseRow ?? null);
    if (courseRow) {
      const [photoResult, roundsResult, reviewsResult] = await Promise.all([
        getCoursePhoto(courseRow.id),
        getCourseOpenRounds(courseRow),
        getCourseReviews(courseRow.id),
      ]);
      if (photoResult.error) Alert.alert('Course photo', photoResult.error.message);
      if (roundsResult.error) Alert.alert('Open rounds', roundsResult.error.message);
      if (reviewsResult.error) Alert.alert('Course reviews', reviewsResult.error.message);
      setPhoto(photoResult.data ?? null);
      setRounds(roundsResult.data ?? []);
      setReviews(reviewsResult.data ?? []);
    }
    setRefreshing(false);
    setLoading(false);
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

  if (sessionLoading || loading) {
    return <SafeAreaView style={styles.center}><ActivityIndicator color={colors.pine} /></SafeAreaView>;
  }
  if (!session) return <Redirect href="/" />;

  async function pickPhoto() {
    if (!session?.user.id || !course) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo permission', 'Allow photo access to upload a course photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ['images'],
      quality: 0.88,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    setUploading(true);
    const uploaded = await uploadCoursePhoto(course.id, session.user.id, result.assets[0].uri);
    setUploading(false);
    if (uploaded.error) return Alert.alert('Upload course photo', uploaded.error.message);
    setPhoto(uploaded.data);
  }

  async function saveReview() {
    if (!session?.user.id || !course) return;
    setSavingReview(true);
    const { error } = await createCourseReview(course.id, session.user.id, Math.max(1, Math.min(5, reviewRating)), reviewBody.trim() || null);
    setSavingReview(false);
    if (error) return Alert.alert('Save review', error.message);
    setReviewOpen(false);
    setReviewRating(5);
    setReviewBody('');
    const { data } = await getCourseReviews(course.id);
    setReviews(data ?? []);
  }

  if (!course) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.missing}>
          <Ionicons name="flag-outline" size={38} color={colors.pine} />
          <Text style={styles.missingTitle}>Course not found</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.primaryButton}><Text style={styles.primaryText}>Go back</Text></TouchableOpacity>
        </View>
        <BottomNav />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={20} color={colors.pine} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <View style={styles.hero}>
          {photo?.url ? <Image source={{ uri: photo.url }} style={styles.heroImage} /> : <View style={styles.placeholder}><Ionicons name="golf-outline" size={46} color={colors.pine} /><Text style={styles.placeholderText}>TeeMate course photo</Text></View>}
        </View>

        <Text style={styles.title}>{course.name}</Text>
        <Text style={styles.subtitle}>{locationText(course)}{course.type ? ` - ${course.type}` : ''}</Text>
        <View style={styles.ratingRow}>
          {averageRating ? <><Stars rating={averageRating} /><Text style={styles.ratingText}>{averageRating.toFixed(1)} ({reviews.length})</Text></> : <Text style={styles.ratingText}>No reviews yet</Text>}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity onPress={() => router.push({ pathname: '/rounds', params: { courseId: course.id, courseName: course.name } })} style={styles.primaryButton}>
            <Ionicons name="calendar-outline" size={18} color={colors.cream} />
            <Text style={styles.primaryText}>Post round</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setReviewOpen(true)} style={styles.secondaryButton}><Text style={styles.secondaryText}>Leave review</Text></TouchableOpacity>
          <TouchableOpacity disabled={uploading} onPress={pickPhoto} style={styles.secondaryButton}>{uploading ? <ActivityIndicator color={colors.pine} /> : <Text style={styles.secondaryText}>Upload photo</Text>}</TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>About</Text>
          <Text style={styles.body}>{course.description?.trim() || 'Course details are coming soon.'}</Text>
          {course.address ? <Text style={styles.meta}>Address: {course.address}</Text> : null}
          {course.website_url ? <Text style={styles.link}>{course.website_url}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Open rounds</Text>
          {rounds.length ? rounds.map((round) => <View key={round.id} style={styles.roundRow}><Text style={styles.roundTitle}>{round.course_text || course.name}</Text><Text style={styles.meta}>{round.town || locationText(course)} - {roundTime(round)}</Text></View>) : <Text style={styles.emptyText}>No open rounds posted here yet.</Text>}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Reviews</Text>
          {reviews.length ? reviews.map((review) => <View key={review.id} style={styles.reviewRow}><View style={styles.reviewHeader}><Text style={styles.reviewName}>{review.profile?.display_name || 'TeeMate golfer'}</Text><Stars rating={review.rating} /></View>{review.body ? <Text style={styles.body}>{review.body}</Text> : null}</View>) : <Text style={styles.emptyText}>Be the first to review this course.</Text>}
        </View>
      </ScrollView>
      <ReviewModal visible={reviewOpen} rating={reviewRating} body={reviewBody} saving={savingReview} onClose={() => setReviewOpen(false)} onRating={setReviewRating} onBody={setReviewBody} onSave={saveReview} />
      <BottomNav />
    </SafeAreaView>
  );
}

function ReviewModal({ visible, rating, body, saving, onClose, onRating, onBody, onSave }: { visible: boolean; rating: number; body: string; saving: boolean; onClose: () => void; onRating: (rating: number) => void; onBody: (body: string) => void; onSave: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modal}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}><Ionicons name="close" size={22} color={colors.pine} /></TouchableOpacity>
            <Text style={styles.modalTitle}>Course review</Text>
          </View>
          <View style={styles.ratingChoices}>
            {[1, 2, 3, 4, 5].map((value) => <TouchableOpacity key={value} onPress={() => onRating(value)} style={[styles.ratingChoice, value <= rating && styles.ratingChoiceActive]}><Ionicons name="star" size={22} color={value <= rating ? colors.ink : colors.pine} /></TouchableOpacity>)}
          </View>
          <TextInput value={body} onChangeText={onBody} placeholder="Share a quick note about the course..." placeholderTextColor={colors.muted} style={styles.reviewInput} multiline />
          <TouchableOpacity disabled={saving} onPress={onSave} style={styles.saveButton}>{saving ? <ActivityIndicator color={colors.cream} /> : <Text style={styles.primaryText}>Save review</Text>}</TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 118 },
  backButton: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 5, marginBottom: 12, paddingHorizontal: 12, paddingVertical: 9 },
  backText: { color: colors.pine, fontSize: 13, fontWeight: '900' },
  hero: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 28, borderWidth: 1, height: 230, marginBottom: 16, overflow: 'hidden' },
  heroImage: { height: '100%', width: '100%' },
  placeholder: { alignItems: 'center', backgroundColor: 'rgba(21,64,44,0.1)', flex: 1, gap: 8, justifyContent: 'center' },
  placeholderText: { color: colors.pine, fontSize: 14, fontWeight: '900' },
  title: { color: colors.pine, fontSize: 34, fontWeight: '900' },
  subtitle: { color: colors.muted, fontSize: 14, fontWeight: '800', lineHeight: 20, marginTop: 4 },
  ratingRow: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 10 },
  stars: { flexDirection: 'row', gap: 1 },
  ratingText: { color: colors.muted, fontSize: 13, fontWeight: '900' },
  actions: { gap: 10, marginVertical: 16 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.pine, borderRadius: 16, flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 50, paddingHorizontal: 16 },
  primaryText: { color: colors.cream, fontSize: 15, fontWeight: '900' },
  secondaryButton: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 16, borderWidth: 1, justifyContent: 'center', minHeight: 48, paddingHorizontal: 16 },
  secondaryText: { color: colors.pine, fontSize: 15, fontWeight: '900' },
  card: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 22, borderWidth: 1, gap: 10, marginBottom: 14, padding: 16 },
  cardTitle: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  body: { color: colors.ink, fontSize: 14, lineHeight: 21 },
  meta: { color: colors.muted, fontSize: 12, fontWeight: '800', lineHeight: 18 },
  link: { color: colors.pine, fontSize: 13, fontWeight: '900', textDecorationLine: 'underline' },
  roundRow: { borderTopColor: colors.border, borderTopWidth: 1, gap: 3, paddingTop: 10 },
  roundTitle: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  emptyText: { color: colors.muted, fontSize: 13, fontWeight: '800', lineHeight: 19 },
  reviewRow: { borderTopColor: colors.border, borderTopWidth: 1, gap: 7, paddingTop: 10 },
  reviewHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  reviewName: { color: colors.ink, flex: 1, fontSize: 15, fontWeight: '900' },
  missing: { alignItems: 'center', flex: 1, gap: 12, justifyContent: 'center', padding: 24 },
  missingTitle: { color: colors.pine, fontSize: 24, fontWeight: '900' },
  modal: { flex: 1, backgroundColor: colors.background },
  modalContent: { gap: 14, padding: 20 },
  modalHeader: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  closeButton: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 999, borderWidth: 1, height: 42, justifyContent: 'center', width: 42 },
  modalTitle: { color: colors.pine, fontSize: 26, fontWeight: '900' },
  ratingChoices: { flexDirection: 'row', gap: 8 },
  ratingChoice: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 14, borderWidth: 1, flex: 1, minHeight: 48, justifyContent: 'center' },
  ratingChoiceActive: { backgroundColor: colors.lime, borderColor: colors.pine },
  reviewInput: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 16, borderWidth: 1, color: colors.ink, minHeight: 110, padding: 14, textAlignVertical: 'top' },
  saveButton: { alignItems: 'center', backgroundColor: colors.pine, borderRadius: 16, justifyContent: 'center', minHeight: 52 },
});
