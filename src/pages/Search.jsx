import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { searchProfiles } from "../services/supabase";

// Matches Profile.jsx's own dark/yellow theme (this app has two separate
// inline-style design systems — Home.jsx/GymMap.jsx use CSS classes like
// "card"/"text-muted", Profile.jsx uses its own inline palette).
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
    padding: "20px 20px 12px",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    background: "#1A1A1A",
    border: "1.5px solid #2A2A2A",
    borderRadius: 12,
    padding: "12px 14px",
    color: "#F8F7F4",
    fontSize: 15,
    outline: "none",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 20px",
    textDecoration: "none",
    color: "inherit",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: "50%",
    objectFit: "cover",
    flexShrink: 0,
    background: "#1A1A1A",
  },
};

function ResultRow({ profile }) {
  return (
    <Link to={`/profile/${profile.id}`} style={s.row}>
      <img
        src={profile.avatar_url ?? `https://api.dicebear.com/9.x/initials/svg?seed=${profile.username ?? "climber"}`}
        alt={profile.username ?? "Climber"}
        style={s.avatar}
      />
      <span style={{ fontSize: 15, fontWeight: 600 }}>
        {profile.username ?? "Unnamed climber"}
      </span>
    </Link>
  );
}

export default function Search() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null); // null = not searched yet
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const handle = setTimeout(() => {
      searchProfiles(trimmed).then(({ data, error }) => {
        setLoading(false);
        if (error) {
          console.error("Search error:", error);
          setResults([]);
          return;
        }
        setResults(data ?? []);
      });
    }, 300); // debounce so we're not firing a query on every keystroke

    return () => clearTimeout(handle);
  }, [query]);

  return (
    <div style={s.root}>
      <div style={{ height: 3, background: "#FFD600" }} />
      <div style={s.header}>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>Find climbers</div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by username"
          style={s.input}
          autoFocus
        />
      </div>

      {query.trim() && (
        <div style={{ marginTop: 8 }}>
          {loading ? (
            <div style={{ padding: "20px", color: "#9CA3AF", fontSize: 14 }}>Searching…</div>
          ) : results && results.length === 0 ? (
            <div style={{ padding: "20px", color: "#9CA3AF", fontSize: 14 }}>
              No climbers found for "{query.trim()}".
            </div>
          ) : (
            results?.map((profile) => <ResultRow key={profile.id} profile={profile} />)
          )}
        </div>
      )}

      {!query.trim() && (
        <div style={{ padding: "20px", color: "#555", fontSize: 14, textAlign: "center", marginTop: 40 }}>
          Start typing a username to find other climbers.
        </div>
      )}
    </div>
  );
}