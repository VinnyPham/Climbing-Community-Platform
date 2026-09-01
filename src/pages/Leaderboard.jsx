import { useState, useEffect } from "react";
import { supabase } from "../services/supabase";
import { useAuth } from "../App";

// ─── Grade scoring ─────────────────────────────────────────────────────────────
// V-scale bouldering grades → base points
const GRADE_POINTS = {
  "VB": 10, "V0": 20, "V1": 35, "V2": 50, "V3": 70,
  "V4": 95, "V5": 125, "V6": 160, "V7": 200, "V8": 250,
  "V9": 310, "V10": 380, "V11": 460, "V12": 550,
  "V13": 650, "V14": 760, "V15": 880, "V16": 1000,
};

// Rope grades → base points
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
  // Fuzzy match V-scale
  const match = upper.match(/^V(\d+)/);
  if (match) {
    const num = parseInt(match[1]);
    const key = `V${num}`;
    return GRADE_POINTS[key] || num * 30;
  }
  return 10;
}

// Attempts multiplier: flash = 1.5x, 2 attempts = 1.2x, then diminishing
function attemptsMultiplier(attempts) {
  if (attempts <= 0) return 1;
  if (attempts === 1) return 1.5;
  if (attempts === 2) return 1.2;
  if (attempts <= 4) return 1.0;
  if (attempts <= 8) return 0.85;
  return 0.7;
}

function calcSendScore(grade, attempts) {
  const base = gradeToPoints(grade);
  const mult = attemptsMultiplier(attempts);
  return Math.round(base * mult);
}

// ─── Color palette ─────────────────────────────────────────────────────────────
const HOLD_COLORS = {
  red: "#EF4444", blue: "#3B82F6", green: "#22C55E", yellow: "#EAB308",
  orange: "#F97316", purple: "#A855F7", pink: "#EC4899", white: "#E5E7EB",
  black: "#374151", gray: "#9CA3AF", teal: "#14B8A6", brown: "#92400E",
};

function holdColorDot(color) {
  const hex = color
    ? (HOLD_COLORS[color.toLowerCase()] || color)
    : "#9CA3AF";
  return hex;
}


// ─── Aggregate raw sends rows into ranked user list ────────────────────────────
function aggregateSends(sends) {
  const userMap = {};
  sends.forEach(send => {
    const profile = send.profiles;
    const route   = send.routes;
    if (!profile || !route) return;

    const uid = send.user_id;
    if (!userMap[uid]) {
      userMap[uid] = {
        id: uid,
        username: profile.username || "Unknown",
        avatar_url: profile.avatar_url || null,
        sends: [],
        totalScore: 0,
      };
    }

    // routes table uses color per supabase.js
    const color = route.color || null;
    const grade = route.grade || "";
    const score = calcSendScore(grade, send.attempts);

    userMap[uid].sends.push({ route: { grade, color }, attempts: send.attempts, score });
    userMap[uid].totalScore += score;
  });

  return Object.values(userMap)
    .sort((a, b) => b.totalScore - a.totalScore)
    .map((u, i) => ({ ...u, rank: i + 1 }));
}

// ─── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ username, avatarUrl, size = 40 }) {
  const initials = username ? username.slice(0, 2).toUpperCase() : "?";
  const colors = ["#FFD600", "#6FCF97", "#F97316", "#A855F7", "#EF4444", "#EAB308"];
  const color = colors[(username?.charCodeAt(0) || 0) % colors.length];
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={username}
        style={{
          width: size, height: size, borderRadius: "50%",
          objectFit: "cover", border: "2px solid #2a2a2a"
        }}
      />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: color, display: "flex", alignItems: "center",
      justifyContent: "center", fontFamily: "'Space Grotesk', sans-serif",
      fontWeight: 700, fontSize: size * 0.35, color: "#141414",
      flexShrink: 0, border: "2px solid #2a2a2a",
    }}>
      {initials}
    </div>
  );
}

// ─── Podium card (top 3) ───────────────────────────────────────────────────────
const MEDAL = ["🥇", "🥈", "🥉"];
const PODIUM_HEIGHT = ["80px", "60px", "50px"];
const PODIUM_BG = [
  "linear-gradient(135deg, #b8860b 0%, #ffd700 50%, #b8860b 100%)",
  "linear-gradient(135deg, #6b7280 0%, #d1d5db 50%, #6b7280 100%)",
  "linear-gradient(135deg, #7c3d1a 0%, #cd7f32 50%, #7c3d1a 100%)",
];

function PodiumCard({ user, position }) {
  const [expanded, setExpanded] = useState(false);
  const isFirst = position === 0;

  return (
    <div
      onClick={() => setExpanded(e => !e)}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: 8, flex: 1, cursor: "pointer", userSelect: "none",
      }}
    >
      {/* Rank medal */}
      <div style={{
        fontSize: isFirst ? 28 : 22,
        filter: isFirst ? "drop-shadow(0 0 8px #ffd700aa)" : "none",
        animation: isFirst ? "pulse 2s ease-in-out infinite" : "none",
      }}>
        {MEDAL[position]}
      </div>

      {/* Avatar */}
      <div style={{ position: "relative" }}>
        <Avatar username={user.username} avatarUrl={user.avatar_url} size={isFirst ? 56 : 44} />
        {isFirst && (
          <div style={{
            position: "absolute", inset: -3, borderRadius: "50%",
            border: "2px solid #ffd700", animation: "ringPulse 2s ease-in-out infinite",
          }} />
        )}
      </div>

      {/* Name */}
      <div style={{
        fontFamily: "'Space Grotesk', sans-serif",
        fontSize: isFirst ? 13 : 11,
        fontWeight: 700, color: "#F8F7F4",
        textAlign: "center", lineHeight: 1.2,
        maxWidth: "100%", wordBreak: "break-word",
      }}>
        {user.username}
      </div>

      {/* Score block / podium base */}
      <div style={{
        width: "100%", height: PODIUM_HEIGHT[position],
        background: PODIUM_BG[position],
        borderRadius: "6px 6px 0 0",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column", gap: 1,
      }}>
        <div style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: isFirst ? 20 : 16, fontWeight: 800,
          color: "#141414", letterSpacing: "-0.5px",
        }}>
          {user.totalScore.toLocaleString()}
        </div>
        <div style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 9, color: "#141414", opacity: 0.7, fontWeight: 600,
          textTransform: "uppercase", letterSpacing: "0.5px",
        }}>
          pts
        </div>
      </div>

      {/* Sends breakdown tooltip */}
      {expanded && (
        <div style={{
          position: "absolute", zIndex: 50,
          background: "#1e1e1e", border: "1px solid #333",
          borderRadius: 10, padding: "10px 14px",
          minWidth: 180, boxShadow: "0 8px 32px #000a",
          top: "110%", left: "50%", transform: "translateX(-50%)",
        }}>
          <div style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 11, fontWeight: 700, color: "#9CA3AF",
            textTransform: "uppercase", letterSpacing: 1, marginBottom: 8,
          }}>
            Top sends
          </div>
          {user.sends
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
            .map((s, i) => (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between",
                alignItems: "center", gap: 8, marginBottom: 5,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: holdColorDot(s.route?.color),
                    flexShrink: 0,
                  }} />
                  <span style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontSize: 12, color: "#F8F7F4", fontWeight: 600,
                  }}>
                    {s.route?.grade}
                  </span>
                  <span style={{
                    fontSize: 10, color: "#6b7280",
                    fontFamily: "'Inter', sans-serif",
                  }}>
                    {s.attempts === 1 ? "flash" : `${s.attempts}x`}
                  </span>
                </div>
                <span style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: 12, fontWeight: 700, color: "#FFD600",
                }}>
                  +{s.score}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// ─── Row card (rank 4+) ────────────────────────────────────────────────────────
function LeaderboardRow({ user, currentUserId }) {
  const [expanded, setExpanded] = useState(false);
  const isMe = user.id === currentUserId;
  const topGrade = user.sends.sort((a, b) => b.score - a.score)[0]?.route?.grade;

  return (
    <div>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 16px",
          background: isMe ? "#1a2530" : "#1a1a1a",
          borderRadius: 12,
          border: isMe ? "1px solid #FFD60080" : "1px solid #252525",
          cursor: "pointer", userSelect: "none",
          transition: "background 0.15s",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Rank bar accent */}
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0,
          width: 3,
          background: user.rank <= 10 ? "#FFD600" : "#2a2a2a",
          borderRadius: "12px 0 0 12px",
        }} />

        {/* Rank number */}
        <div style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 13, fontWeight: 700,
          color: "#4b5563", width: 24, textAlign: "center", flexShrink: 0,
          paddingLeft: 6,
        }}>
          {user.rank}
        </div>

        {/* Avatar */}
        <Avatar username={user.username} avatarUrl={user.avatar_url} size={38} />

        {/* Name + stats */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 14, fontWeight: 700,
              color: isMe ? "#FFD600" : "#F8F7F4",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {user.username}
            </span>
            {isMe && (
              <span style={{
                fontSize: 9, fontWeight: 700, color: "#FFD600",
                background: "#FFD60020", borderRadius: 4,
                padding: "1px 5px", flexShrink: 0,
                fontFamily: "'Inter', sans-serif",
                textTransform: "uppercase", letterSpacing: 0.5,
              }}>
                you
              </span>
            )}
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 8, marginTop: 2,
          }}>
            <span style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 11, color: "#6b7280",
            }}>
              {user.sends.length} sends
            </span>
            {topGrade && (
              <>
                <span style={{ color: "#333", fontSize: 11 }}>·</span>
                <span style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: 11, color: "#8D7B6A", fontWeight: 600,
                }}>
                  top {topGrade}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Score */}
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 18, fontWeight: 800,
            color: "#F8F7F4", letterSpacing: "-0.5px",
          }}>
            {user.totalScore.toLocaleString()}
          </div>
          <div style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 9, color: "#4b5563", fontWeight: 600,
            textTransform: "uppercase", letterSpacing: 0.5,
          }}>
            pts
          </div>
        </div>

        {/* Chevron */}
        <div style={{
          color: "#333", fontSize: 14, flexShrink: 0,
          transform: expanded ? "rotate(180deg)" : "none",
          transition: "transform 0.2s",
        }}>▾</div>
      </div>

      {/* Expanded sends */}
      {expanded && (
        <div style={{
          background: "#141414", borderRadius: "0 0 12px 12px",
          padding: "8px 16px 12px",
          border: "1px solid #252525", borderTop: "none",
          marginTop: -4,
        }}>
          <div style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 10, fontWeight: 700, color: "#4b5563",
            textTransform: "uppercase", letterSpacing: 1,
            marginBottom: 8,
          }}>
            Top sends
          </div>
          {user.sends
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
            .map((s, i) => (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between",
                alignItems: "center", paddingBottom: 6,
                borderBottom: i < Math.min(4, user.sends.length - 1) ? "1px solid #1f1f1f" : "none",
                marginBottom: 6,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: "50%",
                    background: holdColorDot(s.route?.color),
                    flexShrink: 0, border: "1.5px solid #333",
                  }} />
                  <span style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontSize: 13, color: "#F8F7F4", fontWeight: 600,
                  }}>
                    {s.route?.grade}
                  </span>
                  <span style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 11, color: "#6b7280",
                    background: s.attempts === 1 ? "#6FCF9720" : "transparent",
                    color: s.attempts === 1 ? "#6FCF97" : "#6b7280",
                    borderRadius: 4, padding: s.attempts === 1 ? "1px 5px" : 0,
                  }}>
                    {s.attempts === 1 ? "⚡ flash" : `${s.attempts} attempts`}
                  </span>
                </div>
                <span style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: 13, fontWeight: 700, color: "#FFD600",
                }}>
                  +{s.score}
                </span>
              </div>
            ))}
          {user.sends.length > 5 && (
            <div style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 11, color: "#4b5563", textAlign: "center", marginTop: 4,
            }}>
              +{user.sends.length - 5} more sends
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Friend search modal ───────────────────────────────────────────────────────
function FriendSearchModal({ currentUserId, onClose }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [sentIds, setSentIds] = useState(new Set());
  const [sendingId, setSendingId] = useState(null);
  const [sendError, setSendError] = useState(null);

  // Pre-load anyone we already have a pending/accepted request with,
  // so we don't try (and silently fail) to insert a duplicate row.
  useEffect(() => {
    if (!currentUserId) return;
    supabase
      .from("friend_requests")
      .select("sender_id, receiver_id, status")
      .or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
      .then(({ data, error }) => {
        if (error) {
          console.error("Failed to load existing friend requests:", error);
          return;
        }
        const ids = (data ?? [])
          .filter(r => r.status === "pending" || r.status === "accepted")
          .map(r => (r.sender_id === currentUserId ? r.receiver_id : r.sender_id));
        setSentIds(new Set(ids));
      });
  }, [currentUserId]);

  const performSearch = async (searchText = query) => {
    const trimmed = searchText.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }

    setSearching(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, avatar_url")
      .ilike("username", `%${trimmed}%`)
      .neq("id", currentUserId)
      .limit(10);
    if (error) console.error("Friend search failed:", error);
    setResults(data ?? []);
    setSearching(false);
  };

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => { performSearch(query); }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    performSearch(query);
  };

  const sendRequest = async (receiverId) => {
    if (sentIds.has(receiverId) || sendingId) return;
    setSendError(null);
    setSendingId(receiverId);

    const { error } = await supabase.from("friend_requests").insert({
      sender_id: currentUserId,
      receiver_id: receiverId,
      status: "pending",
    });

    setSendingId(null);

    if (error) {
      console.error("Failed to send friend request:", error);
      // 23505 = unique_violation -> a request already exists either direction
      if (error.code === "23505") {
        setSentIds(s => new Set([...s, receiverId]));
      } else {
        setSendError("Couldn't send friend request. Please try again.");
      }
      return;
    }

    setSentIds(s => new Set([...s, receiverId]));
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "#000000cc", display: "flex", alignItems: "flex-end",
    }} onClick={onClose}>
      <div
        style={{
          width: "100%", maxWidth: 480, margin: "0 auto",
          background: "#1a1a1a", borderRadius: "16px 16px 0 0",
          padding: "20px 16px 40px",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div style={{ width: 36, height: 4, background: "#333", borderRadius: 2, margin: "0 auto 20px" }} />

        <div style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 16, fontWeight: 700, color: "#F8F7F4", marginBottom: 14,
        }}>
          Add a friend
        </div>

        {/* Search input */}
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
          <div style={{ position: "relative" }}>
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by username…"
              style={{
                width: "100%", padding: "10px 14px",
                background: "#252525", border: "1px solid #333",
                borderRadius: 10, color: "#F8F7F4",
                fontFamily: "'Inter', sans-serif", fontSize: 14,
                outline: "none", boxSizing: "border-box",
              }}
            />
            {searching && (
              <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "#4b5563", fontSize: 12 }}>
                …
              </div>
            )}
          </div>
          <button
            type="submit"
            style={{
              width: '100%', padding: '11px 14px', borderRadius: 10,
              border: 'none', background: '#FFD600', color: '#141414',
              fontFamily: "'Space Grotesk', sans-serif", fontSize: 13,
              fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase',
              letterSpacing: '0.06em', boxShadow: '0 6px 14px rgba(0,0,0,0.12)'
            }}
          >
            Search
          </button>
        </form>

        {sendError && (
          <div style={{
            marginBottom: 12, padding: "8px 12px", borderRadius: 8,
            background: "#2a1515", border: "1px solid #ef444440",
            color: "#f87171", fontSize: 12, fontFamily: "'Inter', sans-serif",
          }}>
            {sendError}
          </div>
        )}

        {/* Results */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflowY: "auto" }}>
          {results.length === 0 && query.trim().length >= 2 && !searching && (
            <div style={{ color: "#6b7280", fontSize: 13, textAlign: "center", padding: "20px 0", fontFamily: "'Inter', sans-serif" }}>
              No climbers found
            </div>
          )}
          {results.map(user => {
            const sent = sentIds.has(user.id);
            const sending = sendingId === user.id;
            return (
              <div key={user.id} style={{
                display: "flex", alignItems: "center", gap: 10,
                background: "#252525", borderRadius: 10, padding: "10px 12px",
              }}>
                <img
                  src={user.avatar_url ?? `https://api.dicebear.com/9.x/initials/svg?seed=${user.username}`}
                  alt={user.username}
                  style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                />
                <span style={{ flex: 1, fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, fontWeight: 600, color: "#F8F7F4" }}>
                  {user.username}
                </span>
                <button
                  onClick={() => sendRequest(user.id)}
                  disabled={sent || sending}
                  style={{
                    padding: "6px 14px", borderRadius: 20, border: "none",
                    background: sent ? "#1a2e1a" : "#FFD600",
                    color: sent ? "#6FCF97" : "#141414",
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontSize: 11, fontWeight: 700,
                    cursor: sent || sending ? "default" : "pointer",
                    textTransform: "uppercase", letterSpacing: 0.5,
                    opacity: sending ? 0.6 : 1,
                  }}
                >
                  {sent ? "✓ Sent" : sending ? "…" : "Add"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Pending requests banner ───────────────────────────────────────────────────
function PendingRequests({ currentUserId, onAccepted }) {
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    supabase
      .from("friend_requests")
      .select("id, sender_id, profiles!friend_requests_sender_id_fkey (id, username, avatar_url)")
      .eq("receiver_id", currentUserId)
      .eq("status", "pending")
      .then(({ data }) => setRequests(data ?? []));
  }, [currentUserId]);

  const respond = async (reqId, status) => {
    await supabase.from("friend_requests").update({ status }).eq("id", reqId);
    setRequests(r => r.filter(x => x.id !== reqId));
    if (status === "accepted") onAccepted();
  };

  if (requests.length === 0) return null;

  return (
    <div style={{ margin: "0 16px 12px", background: "#1a1a1a", border: "1px solid #FFD60040", borderRadius: 12, padding: "12px 14px" }}>
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, fontWeight: 700, color: "#FFD600", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
        Friend requests
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {requests.map(req => {
          const sender = req.profiles;
          return (
            <div key={req.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <img
                src={sender?.avatar_url ?? `https://api.dicebear.com/9.x/initials/svg?seed=${sender?.username}`}
                alt={sender?.username}
                style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
              />
              <span style={{ flex: 1, fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, fontWeight: 600, color: "#F8F7F4" }}>
                {sender?.username}
              </span>
              <button onClick={() => respond(req.id, "accepted")} style={{ padding: "5px 12px", borderRadius: 20, border: "none", background: "#6FCF97", color: "#141414", fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                Accept
              </button>
              <button onClick={() => respond(req.id, "declined")} style={{ padding: "5px 10px", borderRadius: 20, border: "1px solid #333", background: "transparent", color: "#6b7280", fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Leaderboard ──────────────────────────────────────────────────────────
export default function Leaderboard() {
  const { session, profile } = useAuth();
  const currentUserId = profile?.id ?? null;

  const [view,    setView]    = useState("global");   // "global" | "friends"
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [period,  setPeriod]  = useState("alltime");
  const [showSearch, setShowSearch] = useState(false);
  const [friendIds,  setFriendIds]  = useState(null); // null = not loaded yet

  // Load accepted friend IDs for the current user
  const loadFriendIds = async () => {
    if (!currentUserId) { setFriendIds([]); return; }
    const { data } = await supabase
      .from("friend_requests")
      .select("sender_id, receiver_id")
      .eq("status", "accepted")
      .or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`);
    const ids = (data ?? []).map(r =>
      r.sender_id === currentUserId ? r.receiver_id : r.sender_id
    );
    setFriendIds(ids);
  };

  useEffect(() => { loadFriendIds(); }, [currentUserId]);

  useEffect(() => {
    async function loadLeaderboard() {
      setLoading(true);
      setError(null);
      try {
        let query = supabase
          .from("sends")
          .select(`
            *,
            profiles!sends_user_id_fkey (id, username, avatar_url),
            routes (id, wall, grade, tag_color)
          `)
          .order("created_at", { ascending: false });

        if (period === "week") {
          const since = new Date();
          since.setDate(since.getDate() - 7);
          query = query.gte("created_at", since.toISOString());
        } else if (period === "month") {
          const since = new Date();
          since.setDate(since.getDate() - 30);
          query = query.gte("created_at", since.toISOString());
        }

        const { data: sends, error: fetchError } = await query;
        if (fetchError) throw fetchError;

        let aggregated = aggregateSends(sends ?? []);

        // Filter to friends + self when on friends tab
        if (view === "friends" && friendIds !== null) {
          const allowed = new Set([...(friendIds), currentUserId]);
          aggregated = aggregated
            .filter(u => allowed.has(u.id))
            .map((u, i) => ({ ...u, rank: i + 1 }));
        }

        setUsers(aggregated);
      } catch (err) {
        console.error(err);
        setError("Couldn't load leaderboard. Check your connection.");
      } finally {
        setLoading(false);
      }
    }
    if (friendIds !== null || view === "global") loadLeaderboard();
  }, [period, view, friendIds]);

  const top3    = users.slice(0, 3);
  const rest    = users.slice(3);
  const myRank  = users.find(u => u.id === currentUserId)?.rank;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700;800&family=Inter:wght@400;500;600&display=swap');

        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
        @keyframes ringPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.1); }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }

        .lb-scroll::-webkit-scrollbar { display: none; }
        .lb-scroll { -ms-overflow-style: none; scrollbar-width: none; }

        .period-btn {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 12px; font-weight: 700;
          padding: 6px 14px; border-radius: 20px;
          border: 1px solid #252525;
          background: transparent; color: #6b7280;
          cursor: pointer; transition: all 0.15s;
          text-transform: uppercase; letter-spacing: 0.5px;
        }
        .period-btn.active {
          background: #FFD600; color: #141414;
          border-color: #FFD600;
        }

        .view-tab {
          flex: 1; padding: 8px 0;
          font-family: 'Space Grotesk', sans-serif;
          font-size: 13px; font-weight: 700;
          background: transparent; border: none;
          color: #4b5563; cursor: pointer;
          border-bottom: 2px solid transparent;
          transition: all 0.15s;
          text-transform: uppercase; letter-spacing: 0.5px;
        }
        .view-tab.active {
          color: #F8F7F4;
          border-bottom-color: #FFD600;
        }

        .shimmer-line {
          background: linear-gradient(90deg, #1e1e1e 25%, #2a2a2a 50%, #1e1e1e 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
          border-radius: 8px;
        }
      `}</style>

      <div style={{
        background: "#141414", minHeight: "100vh",
        maxWidth: 480, margin: "0 auto",
        fontFamily: "'Inter', sans-serif",
        paddingBottom: 40,
      }}>

        {/* Header */}
        <div style={{
          padding: "20px 20px 0",
          background: "linear-gradient(180deg, #0d1117 0%, #141414 100%)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: 11, fontWeight: 700, color: "#FFD600",
                textTransform: "uppercase", letterSpacing: 2, marginBottom: 4,
              }}>
              </div>
              <h1 style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: 28, fontWeight: 800,
                color: "#F8F7F4", letterSpacing: "-0.5px", lineHeight: 1,
              }}>
                Leaderboard
              </h1>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
              {myRank && (
                <div style={{
                  background: "#1a1a1a", border: "1px solid #FFD60050",
                  borderRadius: 10, padding: "8px 12px", textAlign: "center",
                }}>
                  <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 800, color: "#FFD600" }}>
                    #{myRank}
                  </div>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 9, color: "#4b5563", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    your rank
                  </div>
                </div>
              )}
              {session && (
                <button
                  onClick={() => setShowSearch(true)}
                  style={{
                    padding: "7px 14px", borderRadius: 20,
                    border: "1px solid #252525", background: "#1a1a1a",
                    color: "#F8F7F4", fontFamily: "'Space Grotesk', sans-serif",
                    fontSize: 11, fontWeight: 700, cursor: "pointer",
                    textTransform: "uppercase", letterSpacing: 0.5,
                    display: "flex", alignItems: "center", gap: 5,
                  }}
                >
                  <span style={{ fontSize: 13 }}>＋</span> Add friend
                </button>
              )}
            </div>
          </div>

          {/* Global / Friends tabs */}
          <div style={{ display: "flex", marginTop: 16, borderBottom: "1px solid #252525" }}>
            <button className={`view-tab${view === "global" ? " active" : ""}`} onClick={() => setView("global")}>
              Global
            </button>
            <button className={`view-tab${view === "friends" ? " active" : ""}`} onClick={() => setView("friends")}>
              Friends {friendIds && friendIds.length > 0 ? `(${friendIds.length})` : ""}
            </button>
          </div>

          {/* Period filter */}
          <div style={{ display: "flex", gap: 8, marginTop: 14, marginBottom: 20 }}>
            {[
              { key: "week", label: "This week" },
              { key: "month", label: "This month" },
              { key: "alltime", label: "All time" },
            ].map(p => (
              <button
                key={p.key}
                className={`period-btn ${period === p.key ? "active" : ""}`}
                onClick={() => setPeriod(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Pending friend requests */}
        {currentUserId && (
          <PendingRequests currentUserId={currentUserId} onAccepted={loadFriendIds} />
        )}

        {loading ? (
          <div style={{ padding: "0 16px" }}>
            <div style={{ height: 200, display: "flex", gap: 12, marginBottom: 24 }}>
              {[1, 2, 3].map(i => (
                <div key={i} className="shimmer-line" style={{ flex: 1 }} />
              ))}
            </div>
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="shimmer-line" style={{ height: 68, marginBottom: 8 }} />
            ))}
          </div>
        ) : error ? (
          <div style={{
            margin: 20, padding: 20, background: "#1a1515",
            border: "1px solid #ef444430", borderRadius: 12, textAlign: "center",
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F8F7F4", fontSize: 14, fontWeight: 600 }}>
              {error}
            </div>
          </div>
        ) : (
          <>
            {/* Podium */}
            {top3.length > 0 && (
              <div style={{
                padding: "0 16px",
                background: "linear-gradient(180deg, #0d1117 0%, #141414 40%)",
              }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 8, paddingBottom: 0, position: "relative" }}>
                  {top3.length >= 2 && <PodiumCard user={top3[1]} position={1} />}
                  {top3.length >= 1 && <PodiumCard user={top3[0]} position={0} />}
                  {top3.length >= 3 && <PodiumCard user={top3[2]} position={2} />}
                </div>
                <div style={{ height: 2, background: "linear-gradient(90deg, transparent, #333, transparent)", marginBottom: 20 }} />
              </div>
            )}

            {/* Score formula hint */}
            <div style={{
              margin: "0 16px 16px", padding: "10px 14px",
              background: "#1a1a1a", border: "1px solid #252525", borderRadius: 10,
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <div>
                <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, fontWeight: 700, color: "#F8F7F4" }}>
                  Score = Grade pts × Attempts bonus
                </div>
                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, color: "#6b7280", marginTop: 1 }}>
                  Flash = 1.5× · 2 attempts = 1.2× · Tap a climber to see their sends
                </div>
              </div>
            </div>

            {/* Ranked list */}
            <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 8 }}>
              {rest.map(user => (
                <LeaderboardRow key={user.id} user={user} currentUserId={currentUserId} />
              ))}

              {users.length === 0 && (
                <div style={{ textAlign: "center", padding: "40px 20px" }}>
                  <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, fontWeight: 700, color: "#F8F7F4", marginBottom: 6 }}>
                    {view === "friends" ? "No friends yet" : "No sends logged yet"}
                  </div>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#6b7280" }}>
                    {view === "friends"
                      ? "Tap \"Add friend\" to find climbers"
                      : ":("}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Friend search modal */}
      {showSearch && currentUserId && (
        <FriendSearchModal currentUserId={currentUserId} onClose={() => setShowSearch(false)} />
      )}
    </>
  );
}