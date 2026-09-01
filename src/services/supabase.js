import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Real routes columns: id, wall, tag_color, active, sends, time_created, grade
// There is no wall_section / color / name / is_active / setter / description
// column on routes — this maps the raw row onto the shape the rest of the
// app expects, so every route object (fetched or just-created) looks the same.
function normalizeRoute(route) {
  if (!route) return route;
  const color = route.tag_color || null;
  const label = color
    ? color.charAt(0).toUpperCase() + color.slice(1)
    : (route.grade || 'Route');
  return {
    ...route,
    wall_section: route.wall || '',
    color,
    active: route.active ?? null,
    name: route.name || `${label} route`,
  };
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

/**
 * Sign in with Google OAuth.
 * In Supabase dashboard: Authentication → Providers → Google → enable + add credentials.
 * Add your site URL to the redirect allow-list.
 */
export const signInWithGoogle = () =>
  supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });

export const signOut = () => supabase.auth.signOut();

export const getSession = () => supabase.auth.getSession();

export const onAuthChange = (callback) =>
  supabase.auth.onAuthStateChange((_event, session) => callback(session));

// ─── Profiles ─────────────────────────────────────────────────────────────────
// Table: profiles (id uuid PK → auth.users.id, username text, avatar_url text, bio text, created_at timestamptz)

export const getProfile = (userId) =>
  supabase.from('profiles').select('*').eq('id', userId).single();

export const upsertProfile = (profile) =>
  supabase.from('profiles').upsert(profile, { onConflict: 'id' });

export const updateProfile = (userId, updates) =>
  supabase.from('profiles').update(updates).eq('id', userId);

// ─── Routes ───────────────────────────────────────────────────────────────────
// Table: routes (id uuid PK, wall text, tag_color text, active bool,
//                sends smallint, time_created timestamptz, grade text)

export const getActiveRoutes = () =>
  supabase
    .from('routes')
    .select('*')
    .eq('active', true)
    .then(result => ({
      ...result,
      data: result.data?.map(normalizeRoute) ?? null,
    }));

export const getRoute = (routeId) =>
  supabase
    .from('routes')
    .select('*')
    .eq('id', routeId)
    .single()
    .then(result => ({
      ...result,
      data: normalizeRoute(result.data),
    }));

export const createRoute = (route) =>
  supabase
    .from('routes')
    .insert(route)
    .select()
    .single()
    .then(result => ({
      ...result,
      data: normalizeRoute(result.data),
    }));

export const archiveRoute = (routeId) =>
  supabase.from('routes').update({ active: false }).eq('id', routeId);

// ─── Sends ────────────────────────────────────────────────────────────────────
// Table: sends (id uuid PK, user_id uuid → profiles.id, route_id uuid → routes.id,
//               attempts int, created_at timestamp)

export const logSend = async ({ userId, routeId, attempts = 1 }) => {
  const normalizedAttempts = Number(attempts) || 1;
  const { data: existingSends, error: lookupError } = await supabase
    .from('sends')
    .select('id')
    .eq('user_id', userId)
    .eq('route_id', routeId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (lookupError) throw lookupError;

  if (existingSends?.length) {
    return supabase
      .from('sends')
      .update({ attempts: normalizedAttempts })
      .eq('id', existingSends[0].id)
      .select()
      .maybeSingle();
  }

  return supabase
    .from('sends')
    .insert({
      user_id: userId,
      route_id: routeId,
      attempts: normalizedAttempts,
    })
    .select()
    .maybeSingle();
};

export const deleteSend = (sendId) =>
  supabase.from('sends').delete().eq('id', sendId);

export const getUserSends = (userId) =>
  supabase
    .from('sends')
    .select(`
      *,
      routes (id, grade, tag_color, wall, active)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

export const getRecentSends = (limit = 30) =>
  supabase
    .from('sends')
    .select(`
      *,
      profiles!sends_user_id_fkey (id, username, avatar_url),
      routes (id, wall, grade, tag_color)
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

export const getRouteSends = (routeId) =>
  supabase
    .from('sends')
    .select(`*, profiles (id, username, avatar_url)`)
    .eq('route_id', routeId)
    .order('created_at', { ascending: false });

// ─── Clips ────────────────────────────────────────────────────────────────────
// Table: clips (id uuid PK, user_id uuid → profiles.id, route_id uuid → routes.id,
//               video_url text, caption text, created_at timestamptz)
// Note: there is no thumbnail_url column — don't pass thumbnailUrl to postClip
// until one exists, or the insert will fail on an unknown column.

export const postClip = ({ userId, routeId, videoUrl, caption = '' }) =>
  supabase
    .from('clips')
    .insert({
      user_id: userId,
      route_id: routeId,
      video_url: videoUrl,
      caption,
    })
    .throwOnError();

export const deleteClip = (clipId) =>
  supabase.from('clips').delete().eq('id', clipId);

export const getRecentClips = (limit = 20) =>
  supabase
    .from('clips')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

export const getUserClips = (userId) =>
  supabase
    .from('clips')
    .select(`*, routes (id, grade, tag_color, wall)`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

export const getRouteClips = (routeId) =>
  supabase
    .from('clips')
    .select(`*, profiles (id, username, avatar_url)`)
    .eq('route_id', routeId)
    .order('created_at', { ascending: false });

// ─── Storage helpers (clips bucket) ──────────────────────────────────────────

export const uploadClipVideo = async (userId, file) => {
  const ext = file.name.split('.').pop();
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('clips').upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from('clips').getPublicUrl(path);
  return data.publicUrl;
};