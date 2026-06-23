import { supabase } from './supabase';
import type { Course, Round } from './data';

export type CourseProfile = Course & {
  description?: string | null;
  website_url?: string | null;
  address?: string | null;
};

export type CoursePhoto = {
  id: string;
  course_id: string;
  user_id: string;
  storage_path: string;
  caption: string | null;
  status: string | null;
  is_primary: boolean | null;
  created_at: string;
  url: string | null;
};

export type CourseReview = {
  id: string;
  course_id: string;
  user_id: string;
  rating: number;
  body: string | null;
  created_at: string;
  updated_at: string | null;
  profile?: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};

function missingOptionalBackend(error: unknown) {
  const message = String((error as { message?: string } | null)?.message ?? '').toLowerCase();
  return (
    message.includes('schema cache') ||
    message.includes('does not exist') ||
    message.includes('could not find') ||
    message.includes('column') ||
    message.includes('relation')
  );
}

function normalizeCourseName(value?: string | null) {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function publicCoursePhotoUrl(storagePath?: string | null) {
  if (!storagePath) return null;
  return supabase.storage.from('course-photos').getPublicUrl(storagePath).data.publicUrl;
}

export async function getCourseById(courseId: string) {
  const full = await supabase
    .from('courses')
    .select('id,name,town,state,type,description,website_url,address')
    .eq('id', courseId)
    .maybeSingle<CourseProfile>();

  let course = full.data;
  let error = full.error;

  if (full.error && missingOptionalBackend(full.error)) {
    const fallback = await supabase
      .from('courses')
      .select('id,name,town,state,type')
      .eq('id', courseId)
      .maybeSingle<CourseProfile>();
    course = fallback.data;
    error = fallback.error;
  }

  if (error || !course) return { data: course ?? null, error };
  if (course.description?.trim()) return { data: course, error: null };

  const generated = await supabase.functions.invoke<{ description?: string }>(
    'generate-course-description',
    { body: { courseId } },
  );
  const description = generated.data?.description?.trim();
  if (!description || generated.error) return { data: course, error: null };

  await supabase
    .from('courses')
    .update({
      description,
      description_generated_at: new Date().toISOString(),
      description_source: 'ai',
    })
    .eq('id', course.id);

  return { data: { ...course, description }, error: null };
}

export async function getCoursePhoto(courseId: string) {
  const { data, error } = await supabase
    .from('course_photos')
    .select('id,course_id,user_id,storage_path,caption,status,is_primary,created_at')
    .eq('course_id', courseId)
    .eq('status', 'approved')
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<Omit<CoursePhoto, 'url'>>();

  if (error && missingOptionalBackend(error)) return { data: null, error: null };
  if (error || !data) return { data: null, error };

  return {
    data: { ...data, url: publicCoursePhotoUrl(data.storage_path) },
    error: null,
  };
}

export async function uploadCoursePhoto(courseId: string, userId: string, uri: string) {
  const ext = uri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
  const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg';
  const contentType = safeExt === 'png' ? 'image/png' : safeExt === 'webp' ? 'image/webp' : 'image/jpeg';
  const path = `${courseId}/${userId}/${Date.now()}.${safeExt}`;
  const response = await fetch(uri);
  const blob = await response.blob();
  const uploaded = await supabase.storage.from('course-photos').upload(path, blob, {
    cacheControl: '3600',
    contentType,
    upsert: false,
  });
  if (uploaded.error) return { data: null, error: uploaded.error };

  const saved = await supabase
    .from('course_photos')
    .insert({ course_id: courseId, user_id: userId, storage_path: path, status: 'approved' })
    .select('id,course_id,user_id,storage_path,caption,status,is_primary,created_at')
    .single<Omit<CoursePhoto, 'url'>>();

  if (saved.error || !saved.data) return { data: null, error: saved.error };
  return {
    data: { ...saved.data, url: publicCoursePhotoUrl(saved.data.storage_path) },
    error: null,
  };
}

export async function getCourseOpenRounds(course: Pick<CourseProfile, 'name'>) {
  const { data, error } = await supabase
    .from('rounds')
    .select('*')
    .eq('is_open_board', true)
    .gte('tee_time', new Date().toISOString())
    .order('tee_time', { ascending: true })
    .limit(100)
    .returns<Round[]>();

  if (error || !data) return { data: data ?? [], error };
  const target = normalizeCourseName(course.name);
  return {
    data: data.filter((round) => normalizeCourseName(round.course_text) === target),
    error: null,
  };
}

export async function getCourseReviews(courseId: string) {
  const { data, error } = await supabase
    .from('course_reviews')
    .select('id,course_id,user_id,rating,body,created_at,updated_at')
    .eq('course_id', courseId)
    .order('updated_at', { ascending: false })
    .returns<CourseReview[]>();

  if (error && missingOptionalBackend(error)) return { data: [] as CourseReview[], error: null };
  if (error || !data) return { data: data ?? [], error };

  const userIds = [...new Set(data.map((review) => review.user_id).filter(Boolean))];
  const { data: profiles } = userIds.length
    ? await supabase.from('profiles').select('id,display_name,avatar_url').in('id', userIds)
    : { data: [] as NonNullable<CourseReview['profile']>[] };
  const profileMap = new Map(
    ((profiles ?? []) as NonNullable<CourseReview['profile']>[]).map((profile) => [profile.id, profile]),
  );

  return {
    data: data.map((review) => ({ ...review, profile: profileMap.get(review.user_id) ?? null })),
    error: null,
  };
}

export async function createCourseReview(courseId: string, userId: string, rating: number, body: string | null) {
  return supabase
    .from('course_reviews')
    .upsert(
      { course_id: courseId, user_id: userId, rating, body, updated_at: new Date().toISOString() },
      { onConflict: 'course_id,user_id' },
    )
    .select('id,course_id,user_id,rating,body,created_at,updated_at')
    .single<CourseReview>();
}
