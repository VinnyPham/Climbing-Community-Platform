// SectionPanel.jsx
// A bottom sheet that slides up when a wall section label is tapped.
//
// Route picking is two steps: color first (filters), then the specific
// route if this wall already has more than one of that color — labeled by
// date added, since routes have no name/number field. "+ New" always logs
// a fresh one.
//
// Large uploads get compressed client-side (ffmpeg.wasm) before hitting
// Supabase Storage. ffmpeg is loaded lazily — only once someone actually
// picks a file over the compression threshold — so it never touches the
// initial bundle size.
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

// Matches the 8 range buckets already defined in Profile.jsx's GRADE_COLORS/
// GRADE_ORDER — this is what actually goes in the `grade` column now, not
// the color name itself, so grade breakdowns and scoring work correctly.
const GRADE_RANGE_BY_COLOR = {
  white:  'VB-V0',
  yellow: 'V0-V1',
  green:  'V1-V2',
  red:    'V2-V4',
  blue:   'V4-V6',
  orange: 'V5-V7',
  purple: 'V7-V9',
  black:  'V9-V11',
};

// Hard ceiling before we even attempt anything (compression on a browser
// tab can run out of memory on very large files, especially on mobile).
const MAX_UPLOAD_MB = 300;
// Anything bigger than this gets compressed first; smaller files upload
// as-is since compressing them isn't worth the wait.
const COMPRESS_THRESHOLD_MB = 15;

// ── ffmpeg.wasm, loaded lazily on first use ─────────────────────────────────
let ffmpegPromise = null;
async function getFFmpeg() {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const { FFmpeg } = await import('@ffmpeg/ffmpeg');
      const { toBlobURL } = await import('@ffmpeg/util');
      const ffmpeg = new FFmpeg();
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      return ffmpeg;
    })();
  }
  return ffmpegPromise;
}

async function compressVideo(file, onProgress) {
  const { fetchFile } = await import('@ffmpeg/util');
  const ffmpeg = await getFFmpeg();

  const handleProgress = ({ progress }) => onProgress?.(Math.min(99, Math.round((progress || 0) * 100)));
  ffmpeg.on('progress', handleProgress);

  const inputName = `input${(file.name.match(/\.\w+$/)?.[0] || '.mp4')}`;
  const outputName = 'output.mp4';

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file));
    await ffmpeg.exec([
      '-i', inputName,
      '-vcodec', 'libx264',
      '-crf', '32',
      '-preset', 'ultrafast',
      '-vf', "scale='min(960,iw)':-2",
      '-r', '30',
      '-acodec', 'aac',
      '-b:a', '96k',
      outputName,
    ]);
    const data = await ffmpeg.readFile(outputName);
    onProgress?.(100);
    return new File([data.buffer], outputName, { type: 'video/mp4' });
  } finally {
    ffmpeg.off('progress', handleProgress);
    // Best-effort cleanup so repeat compressions in the same session don't
    // pile up files in ffmpeg's virtual filesystem.
    try { await ffmpeg.deleteFile(inputName); } catch { /* ignore */ }
    try { await ffmpeg.deleteFile(outputName); } catch { /* ignore */ }
  }
}

export default function SectionPanel({ section, sectionLabel, routes, userSends = {}, onClose, onRouteSelect }) {
  const sheetRef = useRef(null);
  const fileInputRef = useRef(null);

  const [colorTag, setColorTag] = useState('white');
  const [attempts, setAttempts] = useState(1);
  const [videoMode, setVideoMode] = useState('link'); // 'link' | 'upload'
  const [clipUrl, setClipUrl] = useState('');
  const [clipFile, setClipFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [compressPct, setCompressPct] = useState(0);
  const [uploadingClip, setUploadingClip] = useState(false);
  const [formError, setFormError] = useState(null);
  const [formSuccess, setFormSuccess] = useState(false);

  const sectionRoutes = routes.filter(
    r => r.wall_section?.toLowerCase() === section?.toLowerCase()
  );

  // Informational only now — just tells you this wall already has a route
  // of that color, doesn't drive any selection.
  const colorAlreadyExists = (tag) =>
    sectionRoutes.some(r => (r.color || r.grade || '').toLowerCase() === tag.toLowerCase());

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
    setCompressing(false);
    setCompressPct(0);
    setUploadingClip(false);
    setFormError(null);
    setFormSuccess(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0] || null;
    if (file && file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setFormError(`That clip is over ${MAX_UPLOAD_MB}MB — even compression won't reliably bring that down in-browser. Try a shorter clip or paste a link instead.`);
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

      const { data: newRoute, error: routeError } = await createRoute({
        grade: GRADE_RANGE_BY_COLOR[colorTag],
        tag_color: colorTag,
        wall: section,
        active: true,
      });
      if (routeError) throw routeError;
      if (!newRoute?.id) throw new Error('Route creation failed.');
      // createRoute already runs the result through normalizeRoute, so
      // newRoute.color / .wall_section are ready to use as-is.
      const routeId = newRoute.id;
      const routeForCallback = newRoute;

      const { error: sendError } = await logSend({ userId, routeId, attempts });
      if (sendError) throw sendError;

      let finalClipUrl = null;
      if (videoMode === 'link' && clipUrl.trim()) {
        finalClipUrl = clipUrl.trim();
      } else if (videoMode === 'upload' && clipFile) {
        let fileToUpload = clipFile;

        if (clipFile.size > COMPRESS_THRESHOLD_MB * 1024 * 1024) {
          setCompressing(true);
          setCompressPct(0);
          try {
            fileToUpload = await compressVideo(clipFile, setCompressPct);
          } catch (compressErr) {
            // If compression fails for any reason (unsupported codec, out of
            // memory, etc.) fall back to uploading the original rather than
            // blocking the whole log.
            console.error('Video compression failed, uploading original file instead:', compressErr);
            fileToUpload = clipFile;
          } finally {
            setCompressing(false);
          }
        }

        setUploadingClip(true);
        finalClipUrl = await uploadClipVideo(userId, fileToUpload);
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
      setCompressing(false);
      setUploadingClip(false);
    }
  };

  const submitLabel = saving
    ? (compressing ? `Compressing… ${compressPct}%` : uploadingClip ? 'Uploading clip…' : 'Saving…')
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

          {/* Color */}
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>Color</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {COLOR_TAGS.map(tag => {
                const active = colorTag === tag;
                const exists = colorAlreadyExists(tag);
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
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {colorTag.charAt(0).toUpperCase() + colorTag.slice(1)} ({GRADE_RANGE_BY_COLOR[colorTag]})
              {colorAlreadyExists(colorTag) ? ' \u2014 this wall already has one; logging will add another' : ' \u2014 first one on this wall'}
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
                  Up to {MAX_UPLOAD_MB}MB — anything over {COMPRESS_THRESHOLD_MB}MB is compressed automatically before upload.
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