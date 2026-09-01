// MapCanvas.jsx
// Renders Map.png as a pan + pinch-zoomable surface.
// Overlays:
//   • One section label per wall section — tap to open the log form
//
// Use PinPlacementHelper (dev-only) only for debug mapping, not route submission.

import { useRef, useState, useCallback, useEffect } from 'react';
import MapImage from '../assets/Map.png';

const MAP_WIDTH = 2400;
const MAP_HEIGHT = 1800;

export const SECTION_LABELS = [
  { key: 'frontslab', label: 'Front slab', x: 93, y: 50 },
  { key: 'wave',      label: 'Wave wall', x: 70, y: 90 },
  { key: 'accordion', label: 'Accordion wall', x: 30, y: 90 },
  { key: 'bulge',     label: 'Bulge', x: 6,  y: 50 },
  { key: 'roof',      label: 'Super roof', x: 60, y: 50 },
  { key: 'staircase', label: 'Staircase wall', x: 30, y: 50 },
  { key: 'backslab',  label: 'Back slab', x: 50, y: 10 },
];

export const UNIQUE_LABELS = [...new Map(SECTION_LABELS.map(item => [item.key, item])).values()];

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp(val, min, max) { return Math.min(Math.max(val, min), max); }

function getMidpoint(t1, t2) {
  return { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
}

function getDistance(t1, t2) {
  return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
}

// ─── Pin components ───────────────────────────────────────────────────────────


// ─── MapCanvas ────────────────────────────────────────────────────────────────

export default function MapCanvas({ onSectionSelect }) {
  const containerRef = useRef(null);
  const [zoom,   setZoom]   = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  // Track pointer state for pan + pinch
  const pointers   = useRef({});   // pointerId → PointerEvent
  const lastPan    = useRef(null);  // { x, y }
  const lastPinch  = useRef(null);  // { dist, midX, midY }
  const didMove    = useRef(false); // distinguish tap from drag

  // ── Constrain offset so image never shows gap edges ──────────────────────
  const constrain = useCallback((ox, oy, z, containerEl) => {
    if (!containerEl) return { x: ox, y: oy };
    const { width: cw, height: ch } = containerEl.getBoundingClientRect();
    const maxX = (cw * (z - 1)) / 2;
    const maxY = (ch * (z - 1)) / 2;
    return { x: clamp(ox, -maxX, maxX), y: clamp(oy, -maxY, maxY) };
  }, []);

  // ── Pointer events for pan + pinch ───────────────────────────────────────
  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current[e.pointerId] = e;
    didMove.current = false;

    const pts = Object.values(pointers.current);
    if (pts.length === 1) {
      lastPan.current = { x: e.clientX, y: e.clientY };
    } else if (pts.length === 2) {
      lastPinch.current = {
        dist:  getDistance(pts[0], pts[1]),
        midX:  getMidpoint(pts[0], pts[1]).x,
        midY:  getMidpoint(pts[0], pts[1]).y,
      };
      lastPan.current = null;
    }
  };

  const onPointerMove = (e) => {
    pointers.current[e.pointerId] = e;
    const pts = Object.values(pointers.current);

    if (pts.length === 1 && lastPan.current) {
      const dx = e.clientX - lastPan.current.x;
      const dy = e.clientY - lastPan.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didMove.current = true;
      lastPan.current = { x: e.clientX, y: e.clientY };
      setOffset(prev => {
        const next = { x: prev.x + dx, y: prev.y + dy };
        return constrain(next.x, next.y, zoom, containerRef.current);
      });

    } else if (pts.length === 2 && lastPinch.current) {
      didMove.current = true;
      const dist = getDistance(pts[0], pts[1]);
      const scale = dist / lastPinch.current.dist;
      setZoom(prev => {
        const next = clamp(prev * scale, MIN_ZOOM, MAX_ZOOM);
        return next;
      });
      lastPinch.current.dist = dist;
    }
  };

  const onPointerUp = (e) => {
    delete pointers.current[e.pointerId];
    const pts = Object.values(pointers.current);
    if (pts.length === 1) {
      lastPan.current = { x: pts[0].clientX, y: pts[0].clientY };
      lastPinch.current = null;
    } else if (pts.length === 0) {
      lastPan.current  = null;
      lastPinch.current = null;
    }
  };

  // ── Mouse wheel zoom ─────────────────────────────────────────────────────
  const onWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => clamp(prev * delta, MIN_ZOOM, MAX_ZOOM));
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Reset zoom/pan
  const resetView = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: 'var(--surface)',
        borderRadius: 'var(--radius)',
        touchAction: 'none', // let our handlers take over
        userSelect: 'none',
        cursor: zoom > 1 ? 'grab' : 'default',
      }}
      ref={containerRef}
      >
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: pointers.current && Object.keys(pointers.current).length > 0
              ? 'none'
              : 'transform 0.15s ease-out',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <image
            href={MapImage}
            x="0"
            y="0"
            width={MAP_WIDTH}
            height={MAP_HEIGHT}
            preserveAspectRatio="xMidYMid meet"
          />

          {UNIQUE_LABELS.map(s => (
            <g
              key={s.key}
              transform={`translate(${(s.x / 100) * MAP_WIDTH} ${(s.y / 100) * MAP_HEIGHT})`}
              onClick={(e) => { e.stopPropagation(); onSectionSelect(s.key); }}
              style={{ cursor: 'pointer' }}
            >
              <rect
                x={-240}
                y={-42}
                width={480}
                height={68}
                rx={34}
                fill="rgba(13, 13, 13, 0.88)"
                stroke="rgba(255,255,255,0.18)"
                strokeWidth={2}
              />
              <text
                x={0}
                y={0}
                dominantBaseline="middle"
                textAnchor="middle"
                fontFamily="var(--font-display)"
                fontSize={46}
                fontWeight={800}
                fill="#fff"
              >
                {s.label}
              </text>
            </g>
          ))}
        </svg>

        <div style={{
          position: 'absolute',
          top: '0.75rem',
          right: '0.75rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.4rem',
          zIndex: 50,
        }}>
          {[
            { label: '+', action: () => setZoom(z => clamp(z * 1.3, MIN_ZOOM, MAX_ZOOM)) },
            { label: '−', action: () => setZoom(z => clamp(z / 1.3, MIN_ZOOM, MAX_ZOOM)) },
            { label: '⊙', action: resetView },
          ].map(({ label, action }) => (
            <button
              key={label}
              onClick={action}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(13,13,13,0.8)',
                border: '1px solid var(--border-2)',
                color: 'var(--text)',
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backdropFilter: 'blur(8px)',
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
              aria-label={label}
            >
              {label}
            </button>
          ))}
        </div>

      {/* Zoom hint */}
      {zoom < 1.2 && (
        <div
          style={{
            position: 'absolute',
            bottom: '0.75rem',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(13,13,13,0.75)',
            border: '1px solid var(--border)',
            borderRadius: '99px',
            padding: '0.3rem 0.9rem',
            fontSize: '0.7rem',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-display)',
            whiteSpace: 'nowrap',
            backdropFilter: 'blur(8px)',
            pointerEvents: 'none',
          }}
        >
          Pinch to zoom · Tap a label to log a route
        </div>
      )}
    </div>
  );
}