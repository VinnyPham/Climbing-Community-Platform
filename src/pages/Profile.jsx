import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase — replace with your project URL and anon key
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ── Grade color map (V-scale) ──────────────────────────────────────────────
const GRADE_COLORS = {
  "VB-V0": "#F8F7F4",
  "V0-V1": "#FFD600",
  "V1-V2": "#4BCF00",
  "V2-V4": "#F44336",
  "V4-V6": "#2196F3",
  "V5-V7": "#FF6D00",
  "V7-V9": "#9C27B0",
  "V9-V11": "#141414",
  VB: "#F8F7F4",
  V0: "#F8F7F4",
  V1: "#FFD600",
  V2: "#4BCF00",
  V3: "#F44336",
  V4: "#2196F3",
  V5: "#FF6D00",
  V6: "#2196F3",
  V7: "#9C27B0",
  V8: "#9C27B0",
  V9: "#141414",
  V10: "#141414",
  V11: "#141414",
};

const GRADE_ORDER = [
  "VB-V0",
  "V0-V1",
  "V1-V2",
  "V2-V4",
  "V4-V6",
  "V5-V7",
  "V7-V9",
  "V9-V11",
  "VB",
  "V0",
  "V1",
  "V2",
  "V3",
  "V4",
  "V5",
  "V6",
  "V7",
  "V8",
  "V9",
  "V10",
  "V11",
];

function parseGradeValue(code) {
  if (code === "VB") return -1;
  return Number(code.replace(/^V/, ""));
}

function normalizeGrade(grade) {
  if (!grade || typeof grade !== "string") return null;
  const normalized = grade.trim().toUpperCase().replace(/\s+/g, "");

  if (normalized === "VB") return "VB";
  if (/^V\d{1,2}$/.test(normalized)) return normalized;

  const match = normalized.match(/^(VB|V\d{1,2})-(VB|V\d{1,2})$/);
  if (!match) return null;

  const [, first, second] = match;
  const firstValue = parseGradeValue(first);
  const secondValue = parseGradeValue(second);

  if (firstValue > secondValue) {
    return `${second}-${first}`;
  }
  return `${first}-${second}`;
}

function dedupeSendsByRoute(sends = []) {
  const seen = new Set();
  return sends.filter((entry) => {
    const routeKey = entry.route_id ?? entry.routes?.id;
    if (!routeKey || seen.has(routeKey)) return false;
    seen.add(routeKey);
    return true;
  });
}

// Clip video_urls are public Supabase Storage URLs, e.g.
// https://<project>.supabase.co/storage/v1/object/public/clips/<uid>/<file>
// Storage.remove() needs just the "<uid>/<file>" part, not the full URL.
function extractClipStoragePath(url) {
  if (!url) return null;
  const marker = "/object/public/clips/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  try {
    return decodeURIComponent(url.slice(idx + marker.length));
  } catch {
    return url.slice(idx + marker.length);
  }
}

// ── Tiny stat card ─────────────────────────────────────────────────────────
function StatCard({ label, value, accent }) {
  return (
    <div style={{
      flex: 1,
      background: "#1A1A1A",
      borderRadius: 14,
      padding: "14px 10px",
      textAlign: "center",
      border: "1px solid #2A2A2A",
      borderTop: `3px solid ${accent ?? "#FFD600"}`,
    }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: "#F8F7F4", letterSpacing: -0.5 }}>
        {value ?? "—"}
      </div>
      <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 3, textTransform: "uppercase", letterSpacing: 0.8 }}>
        {label}
      </div>
    </div>
  );
}

// ── Grade pill ─────────────────────────────────────────────────────────────
function GradePill({ grade, count }) {
  const color = GRADE_COLORS[grade] ?? "#9CA3AF";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      background: "#1A1A1A", borderRadius: 12, padding: "9px 13px",
      border: "1px solid #2A2A2A",
    }}>
      <div style={{
        width: 10, height: 10, borderRadius: "50%",
        background: color, flexShrink: 0,
      }} />
      <span style={{ fontWeight: 700, color: "#F8F7F4", fontSize: 14 }}>{grade}</span>
      <div style={{
        flex: 1, height: 4, borderRadius: 2,
        background: "#2A2A2A", overflow: "hidden",
      }}>
        <div style={{
          width: `${Math.min(count * 10, 100)}%`,
          height: "100%", background: color,
          borderRadius: 2, transition: "width 0.6s ease",
        }} />
      </div>
      <span style={{ color: "#9CA3AF", fontSize: 12, minWidth: 20, textAlign: "right" }}>
        {count}
      </span>
    </div>
  );
}

// ── Log entry row ──────────────────────────────────────────────────────────
function LogRow({
  entry, isEditing, editAttempts, onStartEdit, onCancelEdit, onChangeAttempts, onSaveEdit, saving, error,
  isDeleting, onRequestDelete, onCancelDelete, onConfirmDelete, deleting,
}) {
  const grade = normalizeGrade(entry.grade ?? entry.routes?.grade);
  const color = GRADE_COLORS[grade] ?? "#aaa";
  const date = new Date(entry.created_at).toLocaleDateString("en-US", {
    month: "short", day: "numeric",
  });

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 10,
      padding: "12px 0", borderBottom: "1px solid #2A2A2A",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: `${color}22`, border: `1.5px solid ${color}`,
        }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, color: "#F8F7F4", fontSize: 14 }}>
            {grade ?? "Unknown grade"}
          </div>
          <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>
            {isEditing
              ? "Editing send…"
              : isDeleting
                ? "Delete this send? Any linked clip will be removed too."
                : `${entry.attempts} ${entry.attempts === 1 ? "try" : "tries"} · ${date}`}
          </div>
        </div>
        {isDeleting ? (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => onConfirmDelete(entry.id)}
              disabled={deleting}
              style={{
                border: "1px solid #2A2A2A",
                borderRadius: 10,
                padding: "8px 12px",
                fontSize: 12,
                color: "#141414",
                background: "#FFD600",
                cursor: "pointer",
              }}
            >
              {deleting ? "Deleting…" : "Confirm"}
            </button>
            <button
              onClick={onCancelDelete}
              disabled={deleting}
              style={{
                border: "1px solid #2A2A2A",
                borderRadius: 10,
                padding: "8px 12px",
                fontSize: 12,
                color: "#9CA3AF",
                background: "transparent",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        ) : !isEditing ? (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onStartEdit}
              style={{
                border: "1px solid #2A2A2A",
                borderRadius: 12,
                padding: "8px 12px",
                fontSize: 12,
                color: "#F8F7F4",
                background: "transparent",
                cursor: "pointer",
              }}
            >
              Edit
            </button>
            <button
              onClick={() => onRequestDelete(entry.id)}
              style={{
                border: "1px solid #2A2A2A",
                borderRadius: 12,
                padding: "8px 12px",
                fontSize: 12,
                color: "#F8F7F4",
                background: "transparent",
                cursor: "pointer",
              }}
            >
              Delete
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => onChangeAttempts(Math.max(1, Number(editAttempts) - 1))}
              disabled={saving}
              style={{
                width: 32, height: 32, borderRadius: 10,
                border: "1px solid #2A2A2A", background: "transparent",
                color: "#F8F7F4", cursor: "pointer",
              }}
            >
              −
            </button>
            <input
              value={editAttempts}
              onChange={(e) => onChangeAttempts(Number(e.target.value) || 1)}
              style={{
                width: 48, textAlign: "center",
                borderRadius: 10, border: "1px solid #2A2A2A",
                background: "#141414", color: "#F8F7F4", padding: "8px 6px",
              }}
            />
            <button
              onClick={() => onSaveEdit(entry.id)}
              disabled={saving}
              style={{
                border: "1px solid #2A2A2A",
                borderRadius: 10,
                padding: "8px 12px",
                fontSize: 12,
                color: "#141414",
                background: "#FFD600",
                cursor: "pointer",
              }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={onCancelEdit}
              disabled={saving}
              style={{
                border: "1px solid #2A2A2A",
                borderRadius: 10,
                padding: "8px 12px",
                fontSize: 12,
                color: "#9CA3AF",
                background: "transparent",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
      {error && (
        <div style={{ color: "#F97316", fontSize: 12, marginLeft: 48 }}>
          {error}
        </div>
      )}
    </div>
  );
}

// ── Main Profile component ─────────────────────────────────────────────────
export default function Profile() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [statsError, setStatsError] = useState(null);
  const [activeTab, setActiveTab] = useState("stats"); // stats | log

  const [editingSendId, setEditingSendId] = useState(null);
  const [editAttempts, setEditAttempts] = useState(1);
  const [sendSaving, setSendSaving] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [deletingSendId, setDeletingSendId] = useState(null); // id pending confirmation
  const [sendDeleting, setSendDeleting] = useState(false);

  // ── Edit state ───────────────────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [draftUsername, setDraftUsername] = useState("");
  const [draftAvatarFile, setDraftAvatarFile] = useState(null);
  const [draftAvatarPreview, setDraftAvatarPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const fileInputRef = useRef(null);

  // ── Auth ────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Load data when session exists ───────────────────────────────────────
  useEffect(() => {
  console.log("EFFECT RUNNING, supabase version check");
  if (!session) { setLoading(false); return; }
  (async () => {
    setLoading(true);
    const uid = session.user.id;

    let { data: prof, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", uid)
      .maybeSingle();
    if (error) {
      console.error("Profile load error:", error);
    }

    if (!prof) {
      const { data: newProf, error: insertErr } = await supabase
        .from("profiles")
        .insert({ id: uid, display_name: session.user.user_metadata?.full_name })
        .select()
        .maybeSingle();
      if (insertErr) {
        console.error("Profile insert error:", insertErr);
      }
      prof = newProf;
    }
    setProfile(prof);

    const { data: sends, error: sendsError } = await supabase
      .from("sends")
      .select(`*, routes(*)`)
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(50);
    console.log("Profile sends load", { uid, count: sends?.length, sendsError });
    if (sendsError) {
      console.error("Profile sends load error:", sendsError);
      setStatsError(sendsError.message || "Unable to load sends.");
    } else {
      setStatsError(null);
    }
    const dedupedSends = dedupeSendsByRoute(sends ?? []);
    setLogs(dedupedSends.map(entry => ({
      ...entry,
      route_name: entry.routes?.name ?? "Unnamed route",
      grade: normalizeGrade(entry.routes?.grade ?? entry.grade),
    })));
    setLoading(false);
  })();
}, [session]);

  const signInWithGoogle = async () => {
    setSigningIn(true);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.href },
    });
    setSigningIn(false);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setLogs([]);
  };

  // ── Edit handlers ────────────────────────────────────────────────────────
  const openEdit = () => {
    setDraftUsername(profile?.username ?? "");
    setDraftAvatarFile(null);
    setDraftAvatarPreview(null);
    setSaveError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraftAvatarFile(null);
    setDraftAvatarPreview(null);
    setSaveError(null);
  };

  const beginEditSend = (entry) => {
    setEditingSendId(entry.id);
    setEditAttempts(entry.attempts ?? 1);
    setSendError(null);
  };

  const cancelEditSend = () => {
    setEditingSendId(null);
    setSendError(null);
  };

  const requestDeleteSend = (entryId) => {
    setDeletingSendId(entryId);
    setSendError(null);
  };

  const cancelDeleteSend = () => {
    setDeletingSendId(null);
  };

  // Deletes any clip(s) logged for the same (user, route) as this send.
  // Clips aren't linked to a specific send id — they're keyed by
  // (user_id, route_id), same pairing sends are deduped by — so this is the
  // correct scope for "the video that goes with this send". Removes the
  // storage file first, then the clips row. Throws on the first failure so
  // the caller can decide whether to still proceed with deleting the send.
  const deleteClipsForRoute = async (uid, routeId) => {
    if (!routeId) return;

    const { data: relatedClips, error: lookupError } = await supabase
      .from("clips")
      .select("id, video_url")
      .eq("user_id", uid)
      .eq("route_id", routeId);

    if (lookupError) throw lookupError;
    if (!relatedClips?.length) return;

    for (const clip of relatedClips) {
      const storagePath = extractClipStoragePath(clip.video_url);
      if (storagePath) {
        const { error: removeError } = await supabase.storage.from("clips").remove([storagePath]);
        if (removeError) {
          throw new Error(
            `Couldn't remove the clip file — this is likely a Storage policy on the 'clips' bucket blocking deletes for this user. (${removeError.message})`
          );
        }
      }

      const { error: clipDeleteError, count } = await supabase
        .from("clips")
        .delete({ count: "exact" })
        .eq("id", clip.id)
        .eq("user_id", uid);

      if (clipDeleteError) throw clipDeleteError;
      if (!count) {
        throw new Error(
          "Clip file was removed, but the clip record itself didn't delete — this is almost always a Row Level Security policy on 'clips' blocking deletes. Make sure there's a DELETE policy like: using (auth.uid() = user_id)."
        );
      }
    }
  };

  const confirmDeleteSend = async (entryId) => {
    setSendDeleting(true);
    setSendError(null);
    try {
      const uid = session?.user?.id;
      if (!uid) throw new Error("You need to be signed in to delete a send.");

      const entry = logs.find((item) => item.id === entryId);
      const routeId = entry?.route_id ?? entry?.routes?.id ?? null;

      // Clean up the linked clip first. If this fails we still go ahead and
      // delete the send below (better than leaving the user stuck), but we
      // surface the clip error afterward instead of silently swallowing it.
      let clipWarning = null;
      try {
        await deleteClipsForRoute(uid, routeId);
      } catch (clipErr) {
        clipWarning = clipErr.message ?? "Couldn't remove the linked clip.";
      }

      const { error, count } = await supabase
        .from("sends")
        .delete({ count: "exact" })
        .eq("id", entryId)
        .eq("user_id", uid);

      if (error) throw error;
      if (!count) {
        throw new Error(
          "Delete didn't go through — this is almost always a Row Level Security policy on 'sends' blocking deletes. Make sure there's a DELETE policy like: using (auth.uid() = user_id)."
        );
      }

      setLogs((prev) => prev.filter((item) => item.id !== entryId));
      setDeletingSendId(null);
      if (editingSendId === entryId) setEditingSendId(null);

      // Home.jsx listens for these to refetch its clip list and leaderboard —
      // it has no other way to know a send (and its clip) just disappeared,
      // especially if it's still mounted in the background.
      window.dispatchEvent(new Event('clip-added'));
      window.dispatchEvent(new Event('send-added'));

      if (clipWarning) {
        setSendError(`Send deleted, but: ${clipWarning}`);
      }
    } catch (err) {
      setSendError(err.message ?? "Unable to delete send.");
    } finally {
      setSendDeleting(false);
    }
  };

  const saveEditedSend = async (entryId) => {
    setSendSaving(true);
    setSendError(null);
    try {
      const attempts = Number(editAttempts) || 1;
      const uid = session?.user?.id;
      const entry = logs.find((item) => item.id === entryId);

      if (!uid) throw new Error("You need to be signed in to edit a send.");
      if (!entry) throw new Error("Send not found.");

      // Filter by user_id as well as id. This is defense-in-depth (RLS should
      // already scope this), and it also means that if RLS is misconfigured
      // we fail with a clearer error instead of silently updating 0 rows.
      const { data, error } = await supabase
        .from("sends")
        .update({ attempts })
        .eq("id", entryId)
        .eq("user_id", uid)
        .select("*")
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        // Supabase/PostgREST returns no error AND no row here when the
        // UPDATE matched 0 rows. Given we already confirmed the row exists
        // in `logs` and belongs to this user, the near-certain cause is
        // Row Level Security on the `sends` table blocking the UPDATE (or
        // its RETURNING/select) for this user.
        throw new Error(
          "Update didn't go through — this is almost always a Row Level Security policy on 'sends' blocking updates. Make sure there's an UPDATE policy like: using (auth.uid() = user_id) with check (auth.uid() = user_id)."
        );
      }

      setLogs((prev) => prev.map((item) =>
        item.id === entryId ? { ...item, attempts } : item
      ));
      setEditingSendId(null);
    } catch (err) {
      setSendError(err.message ?? "Unable to save changes.");
    } finally {
      setSendSaving(false);
    }
  };

  const handleAvatarPick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDraftAvatarFile(file);
    setDraftAvatarPreview(URL.createObjectURL(file));
  };

  const saveProfile = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const uid = session.user.id;
      let avatarUrl = profile?.avatar_url ?? null;

      // Upload new avatar if picked
      if (draftAvatarFile) {
        const ext = draftAvatarFile.name.split(".").pop();
        const path = `${uid}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("avatars")
          .upload(path, draftAvatarFile, { upsert: true });
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
        avatarUrl = urlData.publicUrl;
      }

      // Validate username (alphanumeric + underscore, 3-20 chars)
      const trimmed = draftUsername.trim();
      if (trimmed && !/^[a-zA-Z0-9_]{3,20}$/.test(trimmed)) {
        throw new Error("Username must be 3–20 characters: letters, numbers, or underscores.");
      }

      const { data: updatedRows, error: dbErr } = await supabase
        .from("profiles")
        .upsert({ id: uid, username: trimmed || null, avatar_url: avatarUrl }, { onConflict: "id" })
        .select()
        .maybeSingle();
      if (dbErr) throw dbErr;
      if (!updatedRows) {
        throw new Error("Profile update returned no row.");
      }

      console.log("Updated profile:", updatedRows);
      setProfile(updatedRows);
      setEditing(false);
    } catch (err) {
      setSaveError(err.message ?? "Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  };

  // ── Derived stats ────────────────────────────────────────────────────────
  const totalSends = logs.length;
  const gradeCounts = logs.reduce((acc, l) => {
    const grade = normalizeGrade(l.grade ?? l.routes?.grade);
    if (grade) acc[grade] = (acc[grade] ?? 0) + 1;
    return acc;
  }, {});
  const highestGrade = GRADE_ORDER.slice().reverse().find(g => gradeCounts[g] > 0);
  const thisWeek = logs.filter(l => {
    const d = new Date(l.created_at);
    if (Number.isNaN(d.valueOf())) return false;
    const now = new Date();
    const diff = (now - d) / (1000 * 60 * 60 * 24);
    return diff <= 7;
  }).length;

  // ── Styles ────────────────────────────────────────────────────────────────
  const s = {
    root: {
      minHeight: "100dvh",
      background: "#141414",
      color: "#F8F7F4",
      fontFamily: "'Inter', system-ui, sans-serif",
      maxWidth: 430,
      margin: "0 auto",
      paddingBottom: 90,
    },
    header: {
      background: "#1A1A1A",
      borderBottom: "1px solid #2A2A2A",
      padding: "24px 20px 20px",
      position: "relative",
    },
    avatar: {
      width: 72, height: 72, borderRadius: "50%",
      border: "2px solid #FFD600",
      objectFit: "cover",
      background: "#1A1A1A",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 28, fontWeight: 800, color: "#FFD600",
    },
    name: { fontSize: 22, fontWeight: 800, letterSpacing: -0.5, marginTop: 8 },
    handle: { fontSize: 13, color: "#9CA3AF", marginTop: 2 },
    signOutBtn: {
      position: "absolute", top: 20, right: 20,
      background: "transparent", border: "1px solid #2A2A2A",
      color: "#9CA3AF", borderRadius: 999, padding: "6px 12px",
      fontSize: 12, cursor: "pointer",
    },
    section: { padding: "0 20px", marginTop: 20 },
    sectionTitle: {
      fontSize: 11, fontWeight: 700, color: "#9CA3AF",
      textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 12,
    },
    tabRow: {
      display: "flex", gap: 0,
      background: "#1A1A1A", borderRadius: 12,
      padding: 4, margin: "0 20px", marginTop: 20,
      border: "1px solid #2A2A2A",
    },
    tab: (active) => ({
      flex: 1, padding: "9px 0", textAlign: "center",
      borderRadius: 9, fontSize: 13, fontWeight: 600,
      cursor: "pointer", border: "none",
      background: active ? "#FFD600" : "transparent",
      color: active ? "#141414" : "#9CA3AF",
      transition: "all 0.2s",
    }),
    loginCard: {
      margin: "60px 20px 0",
      background: "#1A1A1A",
      border: "1px solid #2A2A2A",
      borderRadius: 20,
      padding: "36px 24px",
      textAlign: "center",
    },
    googleBtn: {
      marginTop: 24, width: "100%",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
      background: "#F8F7F4", color: "#141414",
      border: "none", borderRadius: 14,
      padding: "14px 20px", fontSize: 15, fontWeight: 600,
      cursor: "pointer",
    },
  };

  // ── Not signed in ────────────────────────────────────────────────────────
  if (!session && !loading) {
    return (
      <div style={s.root}>
        <div style={{
          height: 3,
          background: "#FFD600",
        }} />
        <div style={s.loginCard}>
          <div style={{ fontSize: 36, marginBottom: 16, color: "#FFD600" }}>◉</div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.3 }}>
            Track your sends
          </div>
          <div style={{ fontSize: 14, color: "#9CA3AF", marginTop: 8, lineHeight: 1.5 }}>
            Sign in to log climbs, track your progress, and compete on the leaderboard.
          </div>
          <button
            onClick={signInWithGoogle}
            style={s.googleBtn}
            disabled={signingIn}
          >
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
              <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/>
            </svg>
            {signingIn ? "Signing in…" : "Continue with Google"}
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ ...s.root, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#555", fontSize: 14 }}>Loading…</div>
      </div>
    );
  }

  const avatarUrl = profile?.avatar_url ?? session?.user?.user_metadata?.avatar_url;
  const displayName = profile?.username ?? profile?.display_name ?? session?.user?.user_metadata?.full_name ?? "Climber";
  const email = session?.user?.email ?? "";

  // ── Signed-in view ───────────────────────────────────────────────────────
  return (
    <div style={s.root}>
      <div style={{
        height: 3,
        background: "#FFD600",
      }} />

      {/* Header */}
      <div style={s.header}>
        <button onClick={signOut} style={s.signOutBtn}>Sign out</button>

        {/* Avatar + name row */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Avatar — tappable when editing */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            {(draftAvatarPreview || avatarUrl)
              ? <img
                  src={draftAvatarPreview ?? avatarUrl}
                  alt="avatar"
                  style={{ ...s.avatar, cursor: editing ? "pointer" : "default" }}
                  onClick={() => editing && fileInputRef.current?.click()}
                />
              : <div
                  style={{ ...s.avatar, cursor: editing ? "pointer" : "default" }}
                  onClick={() => editing && fileInputRef.current?.click()}
                >
                  {displayName.charAt(0).toUpperCase()}
                </div>
            }
            {editing && (
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  position: "absolute", bottom: 0, right: 0,
                  width: 24, height: 24, borderRadius: "50%",
                  background: "#FFD600", border: "2px solid #141414",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", fontSize: 12, color: "#141414",
                }}
              >
                +
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleAvatarPick}
            />
          </div>

          {/* Name / username */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {editing ? (
              <div>
                <div style={{ fontSize: 11, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
                  Username
                </div>
                <input
                  value={draftUsername}
                  onChange={e => setDraftUsername(e.target.value)}
                  placeholder="your_username"
                  maxLength={20}
                  style={{
                    width: "100%", boxSizing: "border-box",
                    background: "#141414", border: "1.5px solid #FFD600",
                    borderRadius: 10, padding: "9px 12px",
                    color: "#F8F7F4", fontSize: 15, fontWeight: 700,
                    outline: "none", letterSpacing: -0.2,
                  }}
                />
                {saveError && (
                  <div style={{ fontSize: 12, color: "#F97316", marginTop: 6 }}>
                    {saveError}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div style={s.name}>{displayName}</div>
                <div style={s.handle}>{email}</div>
                {highestGrade && (
                  <div style={{
                    marginTop: 6, display: "inline-flex", alignItems: "center", gap: 5,
                    background: `${GRADE_COLORS[highestGrade]}22`,
                    border: `1px solid ${GRADE_COLORS[highestGrade]}`,
                    borderRadius: 20, padding: "2px 10px",
                  }}>
                    <span style={{ fontSize: 10, color: GRADE_COLORS[highestGrade], fontWeight: 700 }}>
                      ▲ {highestGrade}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Edit / Save / Cancel buttons */}
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          {editing ? (
            <>
              <button
                onClick={saveProfile}
                disabled={saving}
                style={{
                  flex: 1, padding: "10px 0", borderRadius: 12,
                  background: "#FFD600", border: "none",
                  color: "#141414", fontWeight: 700, fontSize: 14, cursor: "pointer",
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={cancelEdit}
                disabled={saving}
                style={{
                  flex: 1, padding: "10px 0", borderRadius: 12,
                  background: "#1A1A1A", border: "1px solid #2A2A2A",
                  color: "#9CA3AF", fontWeight: 600, fontSize: 14, cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={openEdit}
              style={{
                padding: "9px 20px", borderRadius: 12,
                background: "#1A1A1A", border: "1px solid #2A2A2A",
                color: "#9CA3AF", fontWeight: 600, fontSize: 13, cursor: "pointer",
              }}
            >
              Edit profile
            </button>
          )}
        </div>
      </div>

      {/* Stat row */}
      <div style={{ display: "flex", gap: 8, padding: "0 20px", marginTop: 4 }}>
        <StatCard label="Total sends" value={totalSends} accent="#E94560" />
        <StatCard label="This week" value={thisWeek} accent="#4D96FF" />
        <StatCard label="Top grade" value={highestGrade} accent={GRADE_COLORS[highestGrade] ?? "#C77DFF"} />
      </div>
      {statsError && (
        <div style={{ padding: "10px 20px", color: "#E94560", fontSize: 13 }}>
          {statsError}
        </div>
      )}

      {/* Tab switcher */}
      <div style={s.tabRow}>
        <button style={s.tab(activeTab === "stats")} onClick={() => setActiveTab("stats")}>
          Grade Breakdown
        </button>
        <button style={s.tab(activeTab === "log")} onClick={() => setActiveTab("log")}>
          Climb Log
        </button>
      </div>

      {/* ── Grade breakdown tab ── */}
      {activeTab === "stats" && (
        <div style={s.section}>
          <div style={s.sectionTitle}>Sends by grade</div>
          {GRADE_ORDER.filter(g => gradeCounts[g] > 0).length === 0 ? (
            <div style={{
              textAlign: "center", padding: "36px 0",
              color: "#444", fontSize: 14, lineHeight: 1.6,
            }}>
              No climbs logged yet.{"\n"}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {GRADE_ORDER.filter(g => gradeCounts[g] > 0).map(g => (
                <GradePill key={g} grade={g} count={gradeCounts[g]} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Climb log tab ── */}
      {activeTab === "log" && (
        <div style={s.section}>
          <div style={s.sectionTitle}>Recent climbs</div>
          {logs.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "36px 0",
              color: "#444", fontSize: 14,
            }}>
              No climbs logged yet.
            </div>
          ) : (
            <div>
              {logs.map((entry, i) => (
                <LogRow
                  key={entry.id ?? i}
                  entry={entry}
                  isEditing={editingSendId === entry.id}
                  editAttempts={editAttempts}
                  onStartEdit={() => beginEditSend(entry)}
                  onCancelEdit={cancelEditSend}
                  onChangeAttempts={setEditAttempts}
                  onSaveEdit={saveEditedSend}
                  saving={sendSaving}
                  error={(editingSendId === entry.id || deletingSendId === entry.id) ? sendError : null}
                  isDeleting={deletingSendId === entry.id}
                  onRequestDelete={requestDeleteSend}
                  onCancelDelete={cancelDeleteSend}
                  onConfirmDelete={confirmDeleteSend}
                  deleting={sendDeleting}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}