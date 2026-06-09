import { supabase } from './supabase';
import type { Course, Profile, Round } from './data';

export type CoursePhoto = {
  url: string;
  source: string;
  attribution: string | null;
  source_url?: string | null;
};

export type CourseReview = {
  id: string;
  course_id: string;
  user_id: string;
  rating: number;
  condition_rating: number | null;
  pace_rating: number | null;
  value_rating: number | null;
  difficulty_rating: number | null;
  body: string | null;
  created_at: string;
  reviewer?: Pick<Profile, 'id' | 'display_name' | 'avatar_url'> | null;
};

export type CreateCourseReviewInput = {
  courseId: string;
  userId: string;
  rating: number;
  conditionRating?: number | null;
  paceRating?: number | null;
  valueRating?: number | null;
  difficultyRating?: number | null;
  body?: string | null;
};

function isMissingCourseProfilesTable(error: any) {
  const message = String(error?.message ?? '').toLowerCase();
  return message.includes('course_reviews') || message.includes('course_photos') || message.includes('schema cache') || message.includes('does not exist');
}

function roundExpirationCutoffIso() {
  return new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
}

function buildCourseQuery(course: Course) {
  return [course.name, course.town, course.state, 'golf course'].filter(Boolean).join(' ');
}

export function defaultCourseDescription(course: Course, reviews: CourseReview[] = []) {
  const location = [course.town, course.state].filter(Boolean).join(', ');
  if (!reviews.length) {
    return `${course.name} is a golf course${location ? ` in ${location}` : ''}. TeeMate users can post rounds here, leave golf-specific reviews, add photos, and connect with other golfers who play this course.`;
  }

  const avg = reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length;
  const topMentions = reviews
    .map((review) => review.body?.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(' ');

  return `Based on ${reviews.length} TeeMate ${reviews.length === 1 ? 'review' : 'reviews'}, ${course.name} is rated ${avg.toFixed(1)} out of 5 by local golfers.${topMentions ? ` Players mention: ${topMentions}` : ''}`;
}

export async function getCourseById(courseId: string) {
  return supabase.from('courses').select('id,name,town,state,type').eq('id', courseId).maybeSingle<Course>();
}

export async function getCourseOpenRounds(course: Course) {
  const cutoff = roundExpirationCutoffIso();
  return supabase
    .from('rounds')
    .select('*')
    .eq('is_open_board', true)
    .gte('tee_time', cutoff)
    .ilike('course_text', `%${course.name}%`)
    .order('tee_time', { ascending: true })
    .limit(10)
    .returns<Round[]>();
}

export async function getCourseReviews(courseId: string) {
  const { data, error } = await supabase
    .from('course_reviews')
    .select('*')
    .eq('course_id', courseId)
    .order('created_at', { ascending: false })
    .returns<CourseReview[]>();

  if (error) {
    if (isMissingCourseProfilesTable(error)) return { data: [] as CourseReview[], error: null };
    return { data: null, error };
  }

  const userIds = [...new Set((data ?? []).map((review) => review.user_id).filter(Boolean))];
  const { data: profiles } = userIds.length
    ? await supabase.from('profiles').select('id,display_name,avatar_url').in('id', userIds)
    : { data: [] as any[] };
  const profileMap = new Map((profiles ?? []).map((profile: any) => [profile.id, profile]));

  return { data: (data ?? []).map((review) => ({ ...review, reviewer: profileMap.get(review.user_id) ?? null })), error: null };
}

export async function createCourseReview(input: CreateCourseReviewInput) {
  const payload = {
    course_id: input.courseId,
    user_id: input.userId,
    rating: input.rating,
    condition_rating: input.conditionRating ?? null,
    pace_rating: input.paceRating ?? null,
    value_rating: input.valueRating ?? null,
    difficulty_rating: input.difficultyRating ?? null,
    body: input.body?.trim() || null,
  };

  return supabase.from('course_reviews').upsert(payload, { onConflict: 'course_id,user_id' }).select('*').single<CourseReview>();
}

export function summarizeCourseReviews(reviews: CourseReview[]) {
  if (!reviews.length) return { average: 0, count: 0 };
  const average = reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length;
  return { average, count: reviews.length };
}

async function getCachedCoursePhoto(courseId: string) {
  const { data, error } = await supabase
    .from('course_photos')
    .select('url,source,attribution,source_url')
    .eq('course_id', courseId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<CoursePhoto>();

  if (error && isMissingCourseProfilesTable(error)) return null;
  return data ?? null;
}

async function cacheCoursePhoto(courseId: string, photo: CoursePhoto) {
  try {
    await supabase.from('course_photos').upsert({ course_id: courseId, ...photo }, { onConflict: 'course_id,url' });
  } catch (error: any) {
    console.log('Course photo cache error:', error?.message ?? error);
  }
}

async function findOpenversePhoto(course: Course): Promise<CoursePhoto | null> {
  const query = encodeURIComponent(buildCourseQuery(course));
  const url = `https://api.openverse.org/v1/images/?q=${query}&page_size=1&source=wikimedia&license_type=commercial,modification`;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) return null;
  const json = await response.json();
  const item = json?.results?.[0];
  if (!item?.url) return null;
  return {
    url: item.url,
    source: item.source || 'Openverse / Wikimedia Commons',
    attribution: item.attribution || item.creator || null,
    source_url: item.foreign_landing_url || null,
  };
}

async function findWikimediaPhoto(course: Course): Promise<CoursePhoto | null> {
  const query = encodeURIComponent(buildCourseQuery(course));
  const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${query}&gsrnamespace=6&gsrlimit=1&prop=imageinfo&iiprop=url|extmetadata|canonicaltitle&format=json&origin=*`;
  const response = await fetch(searchUrl, { headers: { Accept: 'application/json' } });
  if (!response.ok) return null;
  const json = await response.json();
  const page = Object.values(json?.query?.pages ?? {})[0] as any;
  const image = page?.imageinfo?.[0];
  if (!image?.url) return null;
  const meta = image.extmetadata ?? {};
  return {
    url: image.url,
    source: 'Wikimedia Commons',
    attribution: meta.Artist?.value?.replace(/<[^>]+>/g, '') || meta.Credit?.value?.replace(/<[^>]+>/g, '') || null,
    source_url: image.descriptionurl || null,
  };
}

export async function getCoursePhoto(course: Course): Promise<CoursePhoto | null> {
  const cached = await getCachedCoursePhoto(course.id);
  if (cached) return cached;

  try {
    const photo = (await findOpenversePhoto(course)) ?? (await findWikimediaPhoto(course));
    if (photo) await cacheCoursePhoto(course.id, photo);
    return photo;
  } catch (error: any) {
    console.log('Course photo lookup error:', error?.message ?? error);
    return null;
  }
}
