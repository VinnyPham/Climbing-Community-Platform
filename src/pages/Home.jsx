import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { getUserClips, getProfile } from '../services/supabase';
import { supabase } from '../services/supabase';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const HOLD_COLORS = {
  yellow: { bg: '#FFD600', text: '#000' },
  green:  { bg: '#4CAF50', text: '#fff' },
  blue:   { bg: '#2196F3', text: '#fff' },
  red:    { bg: '#F44336', text: '#fff' },
  black:  { bg: '#424242', text: '#fff' },
  white:  { bg: '#F5F5F5', text: '#000' },
  pink:   { bg: '#E91E63', text: '#fff' },
  orange: { bg: '#FF9800', text: '#000' },
  purple: { bg: '#9C27B0', text: '#fff' },
};

function GradePill({ grade, color }) {
  const c = HOLD_COLORS[color?.toLowerCase()] ?? { bg: '#555', text: '#fff' };
  return (
    <span className="grade-pill" style={{ background: c.bg, color: c.text }}>
      {grade}
    </span>
  );
}

function SendBadge({ type }) {
  const badgeType = type || 'send';
  return <span className={`send-badge send-badge--${badgeType}`}>{badgeType}</span>;
}

function timeAgo(ts) {
  const diff = (Date.now() - new Date(ts)) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Leaderboard scoring (mirrors Leaderboard.jsx) ────────────────────────────
const GRADE_POINTS = {
  "VB": 10, "V0": 20, "V1": 35, "V2": 50, "V3": 70,
  "V4": 95, "V5": 125, "V6": 160, "V7": 200, "V8": 250,
  "V9": 310, "V10": 380, "V11": 460, "V12": 550,
  "V13": 650, "V14": 760, "V15": 880, "V16": 1000,
};
const ROPE_GRADE_POINTS = {
  "5.5": 15, "5.6": 20, "5.7": 28, "5.8": 38, "5.9": 50,
  "5.10a": 65, "5.10b": 72, "5.10c": 80, "5.10d": 90,
  "5.11a": 105, "5.11b": 115, "5.11c": 128, "5.11d": 145,
  "5.12a": 170, "5.12b": 195, "5.12c": 225, "5.12d": 260,
  "5.13a": 305, "5.13b": 360, "5.13c": 425, "5.13d": 500,
};
function gradeToPoints(grade) {
  if (!grade) return 0;
  const upper = grade.toUpperCase().trim();
  if (upper in GRADE_POINTS) return GRADE_POINTS[upper];
  if (grade in ROPE_GRADE_POINTS) return ROPE_GRADE_POINTS[grade];
  const match = upper.match(/^V(\d+)/);
  if (match) return GRADE_POINTS[`V${match[1]}`] || parseInt(match[1]) * 30;
  return 10;
}
function attemptsMultiplier(attempts) {
  if (attempts <= 0) return 1;
  if (attempts === 1) return 1.5;
  if (attempts === 2) return 1.2;
  if (attempts <= 4) return 1.0;
  if (attempts <= 8) return 0.85;
  return 0.7;
}
function calcSendScore(grade, attempts) {
  return Math.round(gradeToPoints(grade) * attemptsMultiplier(attempts));
}
function aggregateSends(sends) {
  const userMap = {};
  sends.forEach(send => {
    const profile = send.profiles;
    const route   = send.routes;
    if (!profile || !route) return;
    const uid = send.user_id;
    if (!userMap[uid]) {
      userMap[uid] = { id: uid, username: profile.username || 'Unknown', avatar_url: profile.avatar_url || null, totalScore: 0 };
    }
    const grade = route.grade || '';
    userMap[uid].totalScore += calcSendScore(grade, send.attempts);
  });
  return Object.values(userMap)
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, 3)
    .map((u, i) => ({ ...u, rank: i + 1 }));
}

// ─── Send card ─────────────────────────────────────────────────────────────────
function SendCard({ send }) {
  const { profiles: user, routes: route } = send;
  return (
    <div className="card" style={{ padding: '0.9rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
      <img
        src={user?.avatar_url ?? `https://api.dicebear.com/9.x/initials/svg?seed=${user?.username}`}
        alt={user?.username}
        className="avatar avatar--md"
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          <span className="font-display" style={{ fontWeight: 600, fontSize: '0.9rem' }}>
            {user?.username ?? 'Climber'}
          </span>
          <SendBadge type={send.send_type} />
          <span className="text-muted text-xs" style={{ marginLeft: 'auto' }}>{timeAgo(send.created_at)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem' }}>
          <GradePill grade={route?.grade} color={route?.color} />
          <span className="truncate text-sm" style={{ fontWeight: 500 }}>{route?.name}</span>
          {route?.wall_section && (
            <span className="text-muted text-xs" style={{ flexShrink: 0 }}>{route.wall_section}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Route row ─────────────────────────────────────────────────────────────────
function RouteRow({ route, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card"
      style={{
        padding: '0.85rem 1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.85rem',
        cursor: 'pointer',
        minHeight: '60px',
        textAlign: 'left',
        border: 'none',
        background: 'var(--surface)',
      }}
    >
      <GradePill grade={route.grade} color={route.color} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="font-display truncate" style={{ fontWeight: 600, fontSize: '0.9rem' }}>{route.name}</p>
        <p className="text-xs text-muted">{route.wall_section ?? 'Main wall'}</p>
      </div>
      {route.setter && (
        <span className="text-xs text-muted" style={{ flexShrink: 0 }}>by {route.setter}</span>
      )}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="2">
        <path d="M9 18l6-6-6-6"/>
      </svg>
    </button>
  );
}

// A direct video file (Supabase Storage uploads, or a pasted link ending in
// a video extension) can be played inline with a plain <video> tag. A link
// to something like YouTube or Instagram can't — those need their own
// embed/iframe, which is out of scope here — so those still open in a new tab.
function isDirectVideoUrl(url) {
  if (!url) return false;
  return /\.(mp4|mov|webm|m4v|ogg)(\?.*)?$/i.test(url) || url.includes('/storage/v1/object/');
}

function ClipRow({ clip, avatarUrl, username }) {
  const [expanded, setExpanded] = useState(false);
  const route = clip.routes || clip.route;
  const playableInline = isDirectVideoUrl(clip.video_url);

  const handleClick = (e) => {
    if (playableInline) {
      e.preventDefault();
      setExpanded(v => !v);
    }
    // otherwise let the <a> follow through and open in a new tab
  };

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <a
        href={clip.video_url}
        target={playableInline ? undefined : '_blank'}
        rel="noreferrer"
        onClick={handleClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          padding: '0.65rem 0.75rem',
          textDecoration: 'none',
          color: 'inherit',
        }}
      >
        <img
          src={avatarUrl ?? `https://api.dicebear.com/9.x/initials/svg?seed=${username ?? 'climber'}`}
          alt={username ?? 'You'}
          className="avatar avatar--sm"
          style={{ flexShrink: 0 }}
        />

        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: 'var(--surface-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {expanded ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--text-faint)">
              <rect x="6" y="5" width="4" height="14" />
              <rect x="14" y="5" width="4" height="14" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--text-faint)">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <GradePill grade={route?.grade} color={route?.tag_color} />
            {route?.wall && (
              <span className="text-xs text-muted truncate">{route.wall}</span>
            )}
            <span className="text-muted text-xs" style={{ marginLeft: 'auto', flexShrink: 0 }}>
              {timeAgo(clip.created_at)}
            </span>
          </div>
          {clip.caption && (
            <p className="text-xs text-muted truncate" style={{ marginTop: '0.2rem' }}>{clip.caption}</p>
          )}
        </div>

        {!playableInline && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="2" style={{ flexShrink: 0 }}>
            <path d="M9 18l6-6-6-6"/>
          </svg>
        )}
      </a>
      {expanded && playableInline && (
        <video
          src={clip.video_url}
          controls
          autoPlay
          playsInline
          style={{ width: '100%', display: 'block', background: '#000', maxHeight: 360 }}
        />
      )}
    </div>
  );
}

// ─── Mini podium (home leaderboard tab) ───────────────────────────────────────
const MEDAL       = ['🥇', '🥈', '🥉'];
const PODIUM_H    = ['64px', '48px', '40px'];
const PODIUM_CLR  = [
  'linear-gradient(135deg,#b8860b,#ffd700,#b8860b)',
  'linear-gradient(135deg,#6b7280,#d1d5db,#6b7280)',
  'linear-gradient(135deg,#7c3d1a,#cd7f32,#7c3d1a)',
];

function MiniAvatar({ username, avatarUrl, size = 36 }) {
  const colors = ['#4FC3F7','#6FCF97','#F97316','#A855F7','#EF4444','#EAB308'];
  const bg = colors[(username?.charCodeAt(0) || 0) % colors.length];
  if (avatarUrl) {
    return <img src={avatarUrl} alt={username} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '2px solid #2a2a2a', flexShrink: 0 }} />;
  }
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * 0.35, color: '#141414', flexShrink: 0, border: '2px solid #2a2a2a' }}>
      {username?.slice(0, 2).toUpperCase() ?? '?'}
    </div>
  );
}

function MiniPodium({ top3, navigate }) {
  // Sort by rank so a single entry always appears as #1 in the centre
  const ranked = [...top3].sort((a, b) => a.rank - b.rank);
  const displayOrder = [ranked[1], ranked[0], ranked[2]].filter(Boolean);

  return (
    <div style={{ background: '#141414', borderRadius: 16, padding: '20px 16px 0', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        {displayOrder.map((user) => {
          const pos = user.rank - 1; // rank 1 → pos 0 (gold), rank 2 → pos 1 (silver), etc.
          const isFirst = pos === 0;
          return (
            <div key={user.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: isFirst ? 24 : 18 }}>{MEDAL[pos]}</span>
              <MiniAvatar username={user.username} avatarUrl={user.avatar_url} size={isFirst ? 44 : 36} />
              <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, fontWeight: 700, color: '#F8F7F4', textAlign: 'center', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.username}
              </span>
              <div style={{ width: '100%', height: PODIUM_H[pos], background: PODIUM_CLR[pos], borderRadius: '6px 6px 0 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: isFirst ? 16 : 13, fontWeight: 800, color: '#141414' }}>
                  {user.totalScore.toLocaleString()}
                </span>
                <span style={{ fontSize: 9, color: '#141414', opacity: 0.6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>pts</span>
              </div>
            </div>
          );
        })}
      </div>
      {/* View full leaderboard link */}
      <button
        onClick={() => navigate('/leaderboard')}
        style={{ width: '100%', marginTop: 14, padding: '10px 0', background: 'transparent', border: '1px solid #252525', borderRadius: 10, color: '#4FC3F7', fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5, textTransform: 'uppercase' }}
      >
        View full leaderboard →
      </button>
    </div>
  );
}

// ─── Hero (logged-out) ────────────────────────────────────────────────────────
function Hero({ login }) {
  return (
    <section style={{ padding: '2.5rem 0 2rem', textAlign: 'center' }}>
      <h1 style={{ letterSpacing: '-0.03em', marginBottom: '1rem' }}>
        Log your sends.<br />
        <span style={{ color: 'var(--accent)' }}>Type Shift.</span>
      </h1>
      <p className="text-muted text-sm" style={{ maxWidth: '320px', margin: '0 auto 1.75rem', lineHeight: 1.6 }}>
        Track every route, clip your sends, and see what's new on the wall.
      </p>
      <button
        className="btn btn-primary btn-full"
        onClick={login}
        style={{ maxWidth: '280px', margin: '0 auto', fontSize: '0.95rem' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Continue with Google
      </button>
    </section>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skeletons({ count = 3, height = 80 }) {
  return Array.from({ length: count }).map((_, i) => (
    <div key={i} className="skeleton" style={{ height, borderRadius: 'var(--radius)' }} />
  ));
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHead({ title, meta }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
      <h2 style={{ fontSize: '1rem' }}>{title}</h2>
      {meta && <span className="section-label">{meta}</span>}
    </div>
  );
}

// ─── Home ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const { session, login } = useAuth();
  const navigate = useNavigate();

  const [tab,        setTab]        = useState('sends');
  const [clips,      setClips]      = useState(null);
  const [top3,       setTop3]       = useState(null);
  const [profile,    setProfile]    = useState(null);

  const loadHomeClips = (userId) => {
    if (!userId) {
      setClips([]);
      return;
    }

    getUserClips(userId).then(({ data, error }) => {
      if (error) {
        setClips([]);
        return;
      }
      setClips(data ?? []);
    }).catch(() => setClips([]));
  };

  const loadTop3 = async () => {
    const { data: sends } = await supabase
      .from('sends')
      .select(`*, profiles!sends_user_id_fkey (id, username, avatar_url), routes (id, grade, tag_color)`)
      .order('created_at', { ascending: false });
    setTop3(aggregateSends(sends ?? []));
  };

  useEffect(() => {
    loadHomeClips(session?.user?.id);
    loadTop3();

    if (session?.user?.id) {
      getProfile(session.user.id).then(({ data }) => setProfile(data)).catch(() => setProfile(null));
    } else {
      setProfile(null);
    }

    const handleClipAdded = () => loadHomeClips(session?.user?.id);
    const handleSendAdded = () => { loadTop3(); };
    window.addEventListener('clip-added', handleClipAdded);
    window.addEventListener('send-added', handleSendAdded);
    return () => {
      window.removeEventListener('clip-added', handleClipAdded);
      window.removeEventListener('send-added', handleSendAdded);
    };
  }, [session?.user?.id]);

  return (
    <>
      <div className="container page-content">
        {!session && <Hero login={login} />}

        <div className="tabs">
          {[
            { id: 'sends',  label: 'Sends' },
            { id: 'clips',  label: 'Leaderboard' },
          ].map(t => (
            <button
              key={t.id}
              className={`tab-btn${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Sends tab ── */}
        {tab === 'sends' && (
          <section>
            <SectionHead title="Your uploads" meta={clips ? `${clips.length} uploaded` : ''} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {clips === null ? (
                <Skeletons count={5} height={68} />
              ) : (!session ? (
                <p className="text-muted text-sm">Sign in to see your uploaded clips.</p>
              ) : clips.length === 0 ? (
                <p className="text-muted text-sm">You haven't uploaded any videos yet.</p>
              ) : (
                clips.map(clip => (
                  <ClipRow
                    key={clip.id}
                    clip={clip}
                    avatarUrl={profile?.avatar_url}
                    username={profile?.username}
                  />
                ))
              ))}
            </div>
          </section>
        )}

        {/* ── Leaderboard tab ── */}
        {tab === 'clips' && (
          <section>
            <SectionHead title="Top climbers" />
            {top3 === null ? (
              <div style={{ display: 'flex', gap: 8 }}>
                {[80, 100, 72].map((h, i) => (
                  <div key={i} className="skeleton" style={{ flex: 1, height: h + 120, borderRadius: 12 }} />
                ))}
              </div>
            ) : top3.length === 0 ? (
              <p className="text-muted text-sm">No sends logged yet</p>
            ) : (
              <MiniPodium top3={top3} navigate={navigate} />
            )}
          </section>
        )}
      </div>

      {/* FAB — navigate to routes to log a send */}
      {session && (
        <button
          className="fab"
          aria-label="Log a send"
          onClick={() => navigate('/routes')}
        >
          +
        </button>
      )}
    </>
  );
}