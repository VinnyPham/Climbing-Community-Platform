import { createContext, useContext, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { supabase, signInWithGoogle, signOut, getProfile, upsertProfile } from './services/supabase';

import Home from './pages/Home';
import GymMap from './pages/GymMap';
import Profile from './pages/Profile';
import Leaderboard from './pages/Leaderboard';
import Search from './pages/Search';


// ─── Auth context ─────────────────────────────────────────────────────────────
const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadProfile(session.user);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session) await loadProfile(session.user);
      else setProfile(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async (user) => {
    const { data } = await getProfile(user.id);
    const defaultUsername = user.user_metadata?.full_name ?? user.email.split('@')[0];
    const defaultAvatar = user.user_metadata?.avatar_url ?? null;
    const defaultDisplayName = user.user_metadata?.full_name ?? defaultUsername;

    if (!data) {
      await upsertProfile({
        id: user.id,
        username: defaultUsername,
        display_name: defaultDisplayName,
        avatar_url: defaultAvatar,
      });
      const { data: newProfile } = await getProfile(user.id);
      setProfile(newProfile);
    } else {
      setProfile(data);
    }
  };

  const login  = () => signInWithGoogle();
  const logout = async () => { await signOut(); setProfile(null); };

  return (
    <AuthContext.Provider value={{ session, profile, login, logout, loading: session === undefined }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const IconHome = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);
const IconRoutes = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="5" r="3"/><path d="M12 8v13M9 18h6"/>
  </svg>
);
const IconLeaderboard = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="14" width="4" height="7"/><rect x="9" y="9" width="4" height="12"/><rect x="16" y="4" width="4" height="17"/>
  </svg>
);
const IconProfile = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
);
const IconSearch = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
  </svg>
);

// ─── Mobile header ────────────────────────────────────────────────────────────
function MobileHeader() {
  const { session, profile, login } = useAuth();
  return (
    <header className="mobile-header">
      <span className="mobile-header__logo">⬡ Hangar18</span>
      {session ? (
        <NavLink to={`/profile/${profile?.id}`}>
          <img
            src={profile?.avatar_url ?? `https://api.dicebear.com/9.x/initials/svg?seed=${profile?.username}`}
            alt={profile?.username}
            className="avatar avatar--sm"
          />
        </NavLink>
      ) : (
        <button className="btn btn-primary" onClick={login} style={{ padding: '0.35rem 0.85rem', minHeight: '36px', fontSize: '0.8rem' }}>
          Sign in
        </button>
      )}
    </header>
  );
}

// ─── Bottom tab bar ───────────────────────────────────────────────────────────
function BottomNav() {
  const { session, profile } = useAuth();
  const location = useLocation();

  const tabs = [
    { to: '/',             label: 'Home',        Icon: IconHome },
    { to: '/search',       label: 'Search',      Icon: IconSearch },
    { to: '/routes',       label: 'Routes',      Icon: IconRoutes },
    { to: '/leaderboard',  label: 'Leaderboard', Icon: IconLeaderboard },
    { to: session ? `/profile/${profile?.id}` : '/profile', label: 'Me', Icon: IconProfile },
  ];

  return (
    <nav className="bottom-nav">
      {tabs.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `bottom-nav__tab${isActive ? ' active' : ''}`}
          end={to === '/'}
        >
          <Icon />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

// ─── Desktop top nav ──────────────────────────────────────────────────────────
function TopNav() {
  const { session, profile, login } = useAuth();
  return (
    <nav className="top-nav">
      <div className="container top-nav__inner">
        <NavLink to="/" className="top-nav__logo">⬡ Hangar18</NavLink>
        <div className="top-nav__links">
          {['/', '/search', '/routes', '/leaderboard'].map((path, i) => {
            const labels = ['Home', 'Search', 'Routes', 'Leaderboard'];
            return (
              <NavLink key={path} to={path} end={path === '/'} className={({ isActive }) => `top-nav__link${isActive ? ' active' : ''}`}>
                {labels[i]}
              </NavLink>
            );
          })}
          {session ? (
            <NavLink to={`/profile/${profile?.id}`} className="top-nav__link">
              <img
                src={profile?.avatar_url ?? `https://api.dicebear.com/9.x/initials/svg?seed=${profile?.username}`}
                alt={profile?.username}
                className="avatar avatar--sm"
                style={{ display: 'inline-block' }}
              />
            </NavLink>
          ) : (
            <button className="btn btn-primary" onClick={login} style={{ padding: '0.4rem 0.9rem', minHeight: '36px' }}>
              Sign in
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}

// ─── Auth callback ────────────────────────────────────────────────────────────
function AuthCallback() {
  const navigate = useNavigate();
  const { loading } = useAuth();
  useEffect(() => { if (!loading) navigate('/', { replace: true }); }, [loading, navigate]);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60dvh' }}>
      <p className="text-muted">Signing you in…</p>
    </div>
  );
}

export function RequireAuth({ children }) {
  const { session, loading } = useAuth();
  if (loading) return null;
  return session ? children : <Navigate to="/" replace />;
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        {/* Desktop nav */}
        <TopNav />
        {/* Mobile header */}
        <MobileHeader />

        <main style={{ flex: 1 }}>
          <Routes>
            <Route path="/"              element={<Home />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/routes"        element={<GymMap />} />
            <Route path="/leaderboard"   element={<Leaderboard />} />
            <Route path="/search"        element={<Search />} />
            {/* Bare /profile resolves to your own profile (or the sign-in
                prompt if logged out) — Profile.jsx falls back to
                session.user.id when there's no :id param. */}
            <Route path="/profile"       element={<Profile />} />
            <Route path="/profile/:id"   element={<Profile />} />
          </Routes>
        </main>

        {/* Mobile bottom tab bar */}
        <BottomNav />
      </AuthProvider>
    </BrowserRouter>
  );
}