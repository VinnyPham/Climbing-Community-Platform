// SectionPanel.jsx
// A bottom sheet that slides up when a wall section label is tapped.
// Opens straight into a "log your climb" form. Each wall section has at
// most one route per color — picking a color logs against that route if
// it already exists, or creates it on the fly if this is the first climb
// on that color in this section.
//
// Props:
//   section       — section key, or null (panel is hidden)
//   sectionLabel  — human-readable label for the header (falls back to `section`)
//   routes        — all active routes array
//   userSends     — map of route_id → send_type for the current user
//   onClose       — called when the sheet is dismissed
//   onRouteSelect — called with a route after a successful log

import { useEffect, useRef, useState } from 'react';
import { createRoute, getSession, logSend, postClip, uploadClipVideo } from '../services/supabase';

const COLOR_TAGS = ['white', 'yellow', 'green', 'red', 'blue', 'orange', 'purple', 'black'];

const SWATCH_HEX = {
  white:  '#f4f4f4',
  yellow: '#eab308',
  green:  '#22c55e',
  red:    '#ef4444',
  blue:   '#3b82f6',
  orange: '#f97316',
  purple: '#a855f7',
  black:  '#161616',
};

const MAX_CLIP_MB = 100;

export default function SectionPanel({ section, sectionLabel, routes, userSends = {}, onClose, onRouteSelect }) {
  const sheetRef = useRef(null);
  const fileInputRef = useRef(null);

  const [colorTag, setColorTag] = useState('white');
  const [attempts, setAttempts] = useState(1);
  const [videoMode, setVideoMode] = useState('link'); // 'link' | 'upload'
  const [clipUrl, setClipUrl] = useState('');
  const [clipFile, setClipFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploadingClip, setUploadingClip] = useState(false);
  const [formError, setFormError] = useState(null);
  const [formSuccess, setFormSuccess] = useState(false);

  const sectionRoutes = routes.filter(
    r => r.wall_section?.toLowerCase() === section?.toLowerCase()
  );

  // One route per color per section — look up by color, not by id.
  const routeByColor = (tag) =>
    sectionRoutes.find(r => (r.color || r.grade || '').toLowerCase() === tag.toLowerCase()) || null;

  const selectedRoute = routeByColor(colorTag);

  // Reset the form each time the panel opens on a (possibly new) section.
  useEffect(() => {
    if (!section) return;
    setColorTag('white');
    resetFormFields();
  }, [section]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on backdrop tap
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  // Swipe-down to close
  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    let startY = 0;
    const onTouchStart = (e) => { startY = e.touches[0].clientY; };
    const onTouchEnd   = (e) => { if (e.changedTouches[0].clientY - startY > 60) onClose(); };
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend',   onTouchEnd,   { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend',   onTouchEnd);
    };
  }, [onClose]);

  const isOpen = !!section;

  const resetFormFields = () => {
    setAttempts(1);
    setVideoMode('link');
    setClipUrl('');
    setClipFile(null);
    setUploadingClip(false);
    setFormError(null);
    setFormSuccess(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0] || null;
    if (file && file.size > MAX_CLIP_MB * 1024 * 1024) {
      setFormError(`That clip is over ${MAX_CLIP_MB}MB — try a shorter one or paste a link instead.`);
      e.target.value = '';
      return;
    }
    setFormError(null);
    setClipFile(file);
  };

  const handleSubmit = async () => {
    setSaving(true);
    setFormError(null);
    setFormSuccess(false);

    try {
      const { data: sessionData } = await getSession();
      const userId = sessionData?.session?.user?.id;
      if (!userId) throw new Error('Please sign in to log a climb.');

      let routeId = selectedRoute?.id;
      let routeForCallback = selectedRoute;

      if (!routeId) {
        // First climb on this color in this section — create it now.
        const { data: newRoute, error: routeError } = await createRoute({
          grade: colorTag,
          tag_color: colorTag,
          wall: section,
          active: true,
        });
        if (routeError) throw routeError;
        if (!newRoute?.id) throw new Error('Route creation failed.');
        routeId = newRoute.id;
        // createRoute already runs the result through normalizeRoute, so
        // newRoute.color / .wall_section / .name are ready to use as-is.
        routeForCallback = newRoute;
      }

      const { error: sendError } = await logSend({ userId, routeId, attempts });
      if (sendError) throw sendError;

      let finalClipUrl = null;
      if (videoMode === 'link' && clipUrl.trim()) {
        finalClipUrl = clipUrl.trim();
      } else if (videoMode === 'upload' && clipFile) {
        setUploadingClip(true);
        finalClipUrl = await uploadClipVideo(userId, clipFile);
      }

      if (finalClipUrl) {
        await postClip({ userId, routeId, videoUrl: finalClipUrl, caption: '' });
      }

      setFormSuccess(true);
      onRouteSelect?.(routeForCallback);
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      setFormError(err?.message || 'Unable to log that climb.');
    } finally {
      setSaving(false);
      setUploadingClip(false);
    }
  };

  const submitLabel = saving
    ? (uploadingClip ? 'Uploading clip…' : 'Saving…')
    : 'Log climb';

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleBackdropClick}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 300,
          background: 'rgba(0,0,0,0.5)',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'all' : 'none',
          transition: 'opacity 0.25s ease',
        }}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 400,
          background: 'var(--surface)',
          borderRadius: '18px 18px 0 0',
          border: '1px solid var(--border)',
          borderBottom: 'none',
          transform: isOpen ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
          maxHeight: '85dvh',
          display: 'flex',
          flexDirection: 'column',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '0.75rem 0 0.25rem' }}>
          <div style={{ width: '36px', height: '4px', borderRadius: '99px', background: 'var(--border-2)' }} />
        </div>

        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.5rem 1.1rem 0.75rem',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700 }}>
              {sectionLabel || section}
            </h3>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
              Pick the color you climbed, then log attempts and a clip.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'var(--surface-2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: '0.9rem 1rem 1.2rem', display: 'grid', gap: '0.9rem' }}>

          {/* Color picker — one route per color in this section */}
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>Color</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {COLOR_TAGS.map(tag => {
                const active = colorTag === tag;
                const exists = !!routeByColor(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setColorTag(tag)}
                    aria-label={tag}
                    aria-pressed={active}
                    style={{
                      position: 'relative',
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      background: SWATCH_HEX[tag],
                      border: active ? '3px solid var(--text-primary)' : '1px solid rgba(255,255,255,0.2)',
                      boxShadow: active ? '0 0 0 2px var(--surface)' : 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {exists && (
                      <span style={{
                        position: 'absolute',
                        bottom: -2,
                        right: -2,
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        background: 'var(--bg-success)',
                        border: '2px solid var(--surface)',
                      }} />
                    )}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {colorTag.charAt(0).toUpperCase() + colorTag.slice(1)}
              {selectedRoute
                ? (userSends[selectedRoute.id] ? ' \u00b7 you\u2019ve logged this one before' : ' \u00b7 already on the map')
                : ' \u00b7 first climb on this color here'}
            </div>
          </div>

          {/* Attempts */}
          <div style={{ display: 'grid', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>Attempts</label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button
                onClick={() => setAttempts(a => Math.max(1, a - 1))}
                style={stepperBtnStyle}
                type="button"
              >−</button>
              <div style={{ flex: 1, minWidth: 0, padding: '12px 14px', borderRadius: 12, border: '0.5px solid var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)', textAlign: 'center' }}>
                {attempts} {attempts === 1 ? 'attempt' : 'attempts'}
              </div>
              <button
                onClick={() => setAttempts(a => a + 1)}
                style={stepperBtnStyle}
                type="button"
              >+</button>
            </div>
          </div>

          {/* Video: link or upload */}
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>Clip (optional)</label>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              {[['link', 'Paste a link'], ['upload', 'Upload a file']].map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setVideoMode(mode)}
                  style={{
                    flex: 1,
                    padding: '0.5rem 0.6rem',
                    borderRadius: 10,
                    border: videoMode === mode ? '1.5px solid var(--text-primary)' : '0.5px solid var(--border)',
                    background: videoMode === mode ? 'var(--surface-2)' : 'var(--surface-1)',
                    color: 'var(--text-primary)',
                    fontSize: '0.8rem',
                    fontWeight: videoMode === mode ? 700 : 500,
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {videoMode === 'link' ? (
              <input
                type="url"
                value={clipUrl}
                onChange={e => setClipUrl(e.target.value)}
                placeholder="https://..."
                style={inputStyle}
              />
            ) : (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                  id="clip-file-input"
                />
                <label
                  htmlFor="clip-file-input"
                  style={{
                    ...inputStyle,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    color: clipFile ? 'var(--text-primary)' : 'var(--text-muted)',
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {clipFile ? clipFile.name : 'Choose a video file'}
                  </span>
                  {clipFile && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.preventDefault(); setClipFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                      style={{ fontSize: '0.75rem', color: 'var(--text-danger)', marginLeft: '0.5rem', flexShrink: 0 }}
                    >
                      Remove
                    </span>
                  )}
                </label>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                  Up to {MAX_CLIP_MB}MB
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{
              height: 46,
              borderRadius: 14,
              border: 'none',
              background: 'var(--bg-success)',
              color: 'var(--text-success)',
              fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.8 : 1,
            }}
            type="button"
          >
            {submitLabel}
          </button>
          {formError && <div style={{ color: 'var(--text-danger)', fontSize: '0.85rem' }}>{formError}</div>}
          {formSuccess && <div style={{ color: 'var(--text-success)', fontSize: '0.85rem' }}>Climb logged.</div>}
        </div>
      </div>
    </>
  );
}

const inputStyle = {
  width: '100%',
  borderRadius: 12,
  border: '0.5px solid var(--border)',
  padding: '12px 14px',
  background: 'var(--surface-1)',
  color: 'var(--text-primary)',
  boxSizing: 'border-box',
};

const stepperBtnStyle = {
  width: 40,
  height: 40,
  borderRadius: 12,
  border: '0.5px solid var(--border)',
  background: 'var(--surface-1)',
  color: 'var(--text-primary)',
  fontSize: 20,
};