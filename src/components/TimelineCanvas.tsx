import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { BubblePosition, TimelineEvent, Trip } from '../types';
import { clamp, formatDateTimeLabel, formatDayLabel, formatTimeLabel, minutesToMs } from '../utils/time';

type TimelineCanvasProps = {
  trip: Trip;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  conflictingEventIds: string[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
  onMoveFlexibleEvent: (eventId: string, nextStartMs: number, lane: TimelineEvent['lane']) => void;
};

type DragState = {
  eventId: string;
  pointerId: number;
  x: number;
  y: number;
};

type PanState = {
  pointerId: number;
  startClientX: number;
  startScrollLeft: number;
};

const framePadding = 44;
const axisInset = 110;
const canvasHeight = 720;
const minZoom = 0.08;
const maxZoom = 6;

function getMidpointMs(event: TimelineEvent) {
  const start = new Date(event.startUtc).getTime();
  const end = new Date(event.endUtc).getTime();
  return start + (end - start) / 2;
}

function getBubbleSize(event: TimelineEvent) {
  const titleWeight = event.title.length * 4.8;
  const locationWeight = event.location.length * 1.6;
  const durationWidth = 148 + event.durationMin * 0.6;
  const width = clamp(Math.max(durationWidth, 118 + titleWeight + locationWeight), 164, 320);
  const height = clamp(86 + event.durationMin * 0.12, 92, 138);
  const collisionRadius = Math.max(width * 0.34, height * 0.62);

  return {
    width,
    height,
    collisionRadius,
  };
}

function xFromTime(timeMs: number, trip: Trip, width: number) {
  const startMs = new Date(trip.startUtc).getTime();
  const endMs = new Date(trip.endUtc).getTime();
  const usableWidth = Math.max(width - framePadding * 2, 100);
  return framePadding + ((timeMs - startMs) / (endMs - startMs)) * usableWidth;
}

function timeFromX(x: number, trip: Trip, width: number) {
  const startMs = new Date(trip.startUtc).getTime();
  const endMs = new Date(trip.endUtc).getTime();
  const usableWidth = Math.max(width - framePadding * 2, 100);
  const ratio = clamp((x - framePadding) / usableWidth, 0, 1);
  return startMs + ratio * (endMs - startMs);
}

function buildTargets(events: TimelineEvent[], trip: Trip, width: number) {
  const centerY = canvasHeight / 2;
  const counts = { top: 0, bottom: 0 };

  return Object.fromEntries(
    events.map((event) => {
      const bubbleSize = getBubbleSize(event);
      counts[event.lane] += 1;
      const laneIndex = counts[event.lane];
      const overlapWeight = events.filter((candidate) => {
        if (candidate.id === event.id) {
          return false;
        }

        const distance = Math.abs(getMidpointMs(candidate) - getMidpointMs(event));
        return distance < minutesToMs(240);
      }).length;

      const depth = event.kind === 'hard' ? 140 : 190;
      const stagger = laneIndex % 2 === 0 ? 26 : -18;
      const densityLift = overlapWeight * 16;
      const y =
        event.lane === 'top'
          ? centerY - depth - densityLift + stagger
          : centerY + depth + densityLift + stagger;

      return [
        event.id,
        {
          x: xFromTime(getMidpointMs(event), trip, width),
          y,
          width: bubbleSize.width,
          height: bubbleSize.height,
          collisionRadius: bubbleSize.collisionRadius,
        },
      ];
    }),
  ) as Record<string, { x: number; y: number; width: number; height: number; collisionRadius: number }>;
}

function describeKind(kind: TimelineEvent['kind']) {
  return kind === 'hard' ? 'Anchor' : 'Float';
}

export function TimelineCanvas({
  trip,
  zoom,
  onZoomChange,
  conflictingEventIds,
  selectedEventId,
  onSelectEvent,
  onMoveFlexibleEvent,
}: TimelineCanvasProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const previousSurfaceWidthRef = useRef(0);
  const pendingFocusRef = useRef<{ ratio: number; viewportX: number } | null>(null);
  const panRef = useRef<PanState | null>(null);
  const [viewportWidth, setViewportWidth] = useState(1200);
  const [positions, setPositions] = useState<Record<string, BubblePosition>>({});
  const dragRef = useRef<DragState | null>(null);
  const [draggingEventId, setDraggingEventId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const tripStartMs = new Date(trip.startUtc).getTime();
  const tripEndMs = new Date(trip.endUtc).getTime();
  const totalHours = Math.max((tripEndMs - tripStartMs) / 36e5, 1);
  const basePixelsPerHour = 18;
  const surfaceWidth = Math.max(viewportWidth, totalHours * basePixelsPerHour * zoom + framePadding * 2);
  const pixelsPerHour = Math.max((surfaceWidth - framePadding * 2) / totalHours, 1);
  const fitZoom = clamp((viewportWidth - framePadding * 2) / (totalHours * basePixelsPerHour), minZoom, maxZoom);

  useEffect(() => {
    if (!viewportRef.current) {
      return undefined;
    }

    const updateSize = () => {
      if (!viewportRef.current) {
        return;
      }

      setViewportWidth(viewportRef.current.clientWidth);
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(viewportRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return undefined;
    }

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();

        const bounds = viewport.getBoundingClientRect();
        const viewportX = event.clientX - bounds.left;
        const ratio = (viewport.scrollLeft + viewportX) / Math.max(previousSurfaceWidthRef.current || surfaceWidth, 1);
        const direction = event.deltaY > 0 ? 1 / 1.14 : 1.14;
        pendingFocusRef.current = {
          ratio: clamp(ratio, 0, 1),
          viewportX,
        };
        onZoomChange(clamp(zoom * direction, minZoom, maxZoom));
        return;
      }

      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
        return;
      }

      event.preventDefault();
      viewport.scrollLeft += event.deltaY;
    };

    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel);
  }, [onZoomChange, surfaceWidth, zoom]);

  useEffect(() => {
    const targets = buildTargets(trip.events, trip, surfaceWidth);

    setPositions((current) => {
      const next: Record<string, BubblePosition> = {};

      for (const event of trip.events) {
        const target = targets[event.id];
        const existing = current[event.id];
        next[event.id] = existing
          ? {
              ...existing,
              width: target.width,
              height: target.height,
              collisionRadius: target.collisionRadius,
            }
          : {
              x: target.x + (Math.random() * 28 - 14),
              y: target.y + (Math.random() * 28 - 14),
              vx: 0,
              vy: 0,
              width: target.width,
              height: target.height,
              collisionRadius: target.collisionRadius,
            };
      }

      return next;
    });
  }, [trip, surfaceWidth]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const previousSurfaceWidth = previousSurfaceWidthRef.current;

    if (!viewport || previousSurfaceWidth === 0 || previousSurfaceWidth === surfaceWidth) {
      previousSurfaceWidthRef.current = surfaceWidth;
      return;
    }

    const focus = pendingFocusRef.current;
    const centerRatio = focus ? focus.ratio : (viewport.scrollLeft + viewport.clientWidth / 2) / previousSurfaceWidth;
    const focusX = focus ? focus.viewportX : viewport.clientWidth / 2;
    const nextScrollLeft = centerRatio * surfaceWidth - focusX;
    const maxScrollLeft = Math.max(surfaceWidth - viewport.clientWidth, 0);
    viewport.scrollLeft = clamp(nextScrollLeft, 0, maxScrollLeft);
    previousSurfaceWidthRef.current = surfaceWidth;
    pendingFocusRef.current = null;
  }, [surfaceWidth]);

  useEffect(() => {
    let frameId = 0;

    const tick = () => {
      setPositions((current) => {
        const targets = buildTargets(trip.events, trip, surfaceWidth);
        const next: Record<string, BubblePosition> = {};

        for (const event of trip.events) {
          const existing = current[event.id] ?? {
            x: targets[event.id].x,
            y: targets[event.id].y,
            vx: 0,
            vy: 0,
            width: targets[event.id].width,
            height: targets[event.id].height,
            collisionRadius: targets[event.id].collisionRadius,
          };

          next[event.id] = {
            ...existing,
            width: targets[event.id].width,
            height: targets[event.id].height,
            collisionRadius: targets[event.id].collisionRadius,
          };
        }

        for (const event of trip.events) {
          const node = next[event.id];
          const drag = dragRef.current;

          if (drag?.eventId === event.id) {
            node.x = drag.x;
            node.y = drag.y;
            node.vx = 0;
            node.vy = 0;
            continue;
          }

          const target = targets[event.id];
          const spring = event.kind === 'hard' ? 0.1 : 0.07;
          node.vx += (target.x - node.x) * spring;
          node.vy += (target.y - node.y) * spring;
        }

        for (let index = 0; index < trip.events.length; index += 1) {
          for (let compareIndex = index + 1; compareIndex < trip.events.length; compareIndex += 1) {
            const eventA = trip.events[index];
            const eventB = trip.events[compareIndex];
            const nodeA = next[eventA.id];
            const nodeB = next[eventB.id];
            const dx = nodeB.x - nodeA.x;
            const dy = nodeB.y - nodeA.y;
            const distance = Math.hypot(dx, dy) || 0.001;
            const minimumDistance = nodeA.collisionRadius + nodeB.collisionRadius + 18;

            if (distance >= minimumDistance) {
              continue;
            }

            const overlap = minimumDistance - distance;
            const push = overlap * 0.085;
            const normalX = dx / distance;
            const normalY = dy / distance;

            if (dragRef.current?.eventId !== eventA.id) {
              nodeA.vx -= normalX * push;
              nodeA.vy -= normalY * push;
            }

            if (dragRef.current?.eventId !== eventB.id) {
              nodeB.vx += normalX * push;
              nodeB.vy += normalY * push;
            }
          }
        }

        for (const event of trip.events) {
          const node = next[event.id];

          if (dragRef.current?.eventId !== event.id) {
            node.vx *= 0.82;
            node.vy *= 0.82;
            node.x += node.vx;
            node.y += node.vy;
          }

          const left = framePadding + node.width / 2;
          const right = Math.max(surfaceWidth - framePadding - node.width / 2, left);
          node.x = clamp(node.x, left, right);

          const topLimit = axisInset + node.height / 2;
          const bottomLimit = canvasHeight - axisInset - node.height / 2;
          const laneGap = 56;

          if (event.lane === 'top') {
            node.y = clamp(node.y, topLimit, canvasHeight / 2 - laneGap - node.height / 2);
          } else {
            node.y = clamp(node.y, canvasHeight / 2 + laneGap + node.height / 2, bottomLimit);
          }
        }

        return next;
      });

      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [surfaceWidth, trip]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      const bounds = viewportRef.current?.getBoundingClientRect();
      const viewport = viewportRef.current;
      const pan = panRef.current;

      if (pan && viewport && pan.pointerId === event.pointerId) {
        viewport.scrollLeft = pan.startScrollLeft - (event.clientX - pan.startClientX);
        return;
      }

      if (!drag || !bounds || !viewport || drag.pointerId !== event.pointerId) {
        return;
      }

      dragRef.current = {
        ...drag,
        x: clamp(
          event.clientX - bounds.left + viewport.scrollLeft,
          framePadding + 36,
          surfaceWidth - framePadding - 36,
        ),
        y: clamp(event.clientY - bounds.top, 72, canvasHeight - 72),
      };
    };

    const handlePointerUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      const pan = panRef.current;
      if (pan && pan.pointerId === event.pointerId) {
        panRef.current = null;
        setIsPanning(false);
      }

      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }

      const draggedEvent = trip.events.find((candidate) => candidate.id === drag.eventId);
      if (draggedEvent && draggedEvent.kind === 'flexible') {
        const nextStartMs = timeFromX(drag.x, trip, surfaceWidth) - minutesToMs(draggedEvent.durationMin) / 2;
        const lane = drag.y < canvasHeight / 2 ? 'top' : 'bottom';
        onMoveFlexibleEvent(drag.eventId, nextStartMs, lane);
      }

      dragRef.current = null;
      setDraggingEventId(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [onMoveFlexibleEvent, surfaceWidth, trip]);

  const dayCount = Math.ceil(totalHours / 24);
  const guideDays = Array.from({ length: dayCount + 1 }, (_, index) => {
    const timeMs = tripStartMs + Math.min(index * 24, totalHours) * 36e5;
    return {
      label: formatDayLabel(new Date(timeMs).toISOString(), trip.displayTimezone),
      x: xFromTime(timeMs, trip, surfaceWidth),
    };
  });
  const tickStepHours = pixelsPerHour >= 140 ? 1 : pixelsPerHour >= 84 ? 3 : pixelsPerHour >= 44 ? 6 : 12;
  const majorTicks = Array.from({ length: Math.ceil(totalHours / tickStepHours) + 1 }, (_, index) => {
    const timeMs = tripStartMs + Math.min(index * tickStepHours, totalHours) * 36e5;
    return {
      label: formatTimeLabel(new Date(timeMs).toISOString(), trip.displayTimezone),
      x: xFromTime(timeMs, trip, surfaceWidth),
    };
  });

  const nowMs = Date.now();
  const nowVisible = nowMs >= tripStartMs && nowMs <= tripEndMs;
  const nowX = nowVisible ? xFromTime(nowMs, trip, surfaceWidth) : 0;
  const conflictingIdSet = new Set(conflictingEventIds);

  return (
    <div className="timeline-shell">
      <div className="timeline-meta">
        <div>
          <p className="eyebrow">Fluid Timeline</p>
          <h2>Drag the floating events and watch the plan re-balance itself.</h2>
        </div>
        <p>
          Flexible bubbles can be moved across time and even nudged above or below the axis. Hard anchors stay fixed
          and force the other events to settle around them.
        </p>
      </div>

      <div className="timeline-toolbar glass-panel">
        <div className="timeline-toolbar-group">
          <button type="button" className="ghost-button" onClick={() => onZoomChange(clamp(zoom / 1.35, minZoom, maxZoom))}>
            Zoom Out
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              onZoomChange(fitZoom);

              if (viewportRef.current) {
                viewportRef.current.scrollLeft = 0;
              }
            }}
          >
            Fit
          </button>
          <button type="button" className="ghost-button" onClick={() => onZoomChange(clamp(zoom * 1.35, minZoom, maxZoom))}>
            Zoom In
          </button>
        </div>
        <label className="zoom-readout">
          <span>Zoom</span>
          <input
            type="range"
            min={minZoom}
            max={maxZoom}
            step={0.05}
            value={zoom}
            onChange={(event) => onZoomChange(Number(event.target.value))}
          />
          <strong>{Math.round(zoom * 100)}%</strong>
        </label>
      </div>

      <div className={isPanning ? 'timeline-viewport is-panning' : 'timeline-viewport'} ref={viewportRef}>
        <div
          className="timeline-canvas"
          style={{ width: surfaceWidth }}
          onPointerDown={(event) => {
            if (!viewportRef.current) {
              return;
            }

            if (event.target instanceof Element && event.target.closest('.event-bubble')) {
              return;
            }

            panRef.current = {
              pointerId: event.pointerId,
              startClientX: event.clientX,
              startScrollLeft: viewportRef.current.scrollLeft,
            };
            setIsPanning(true);
          }}
        >
          <svg className="timeline-svg" viewBox={`0 0 ${surfaceWidth} ${canvasHeight}`} preserveAspectRatio="none" aria-hidden>
            {majorTicks.map((tick) => (
              <g key={`tick-${tick.label}-${tick.x}`}>
                <line className="timeline-minor-guide" x1={tick.x} x2={tick.x} y1="74" y2={canvasHeight - 74} />
                <text className="timeline-minor-label" x={tick.x + 8} y={canvasHeight / 2 + 26}>
                  {tick.label}
                </text>
              </g>
            ))}

            {guideDays.map((day) => (
              <g key={day.label + day.x}>
                <line className="timeline-guide" x1={day.x} x2={day.x} y1="46" y2={canvasHeight - 46} />
                <text className="timeline-guide-label" x={day.x + 8} y="40">
                  {day.label}
                </text>
              </g>
            ))}

            <line
              className="timeline-axis-line"
              x1={framePadding}
              x2={surfaceWidth - framePadding}
              y1={canvasHeight / 2}
              y2={canvasHeight / 2}
            />

            {nowVisible && (
              <g>
                <line className="timeline-now-line" x1={nowX} x2={nowX} y1="54" y2={canvasHeight - 54} />
                <text className="timeline-now-label" x={nowX + 10} y={canvasHeight / 2 - 18}>
                  Now
                </text>
              </g>
            )}

            {trip.events.map((event) => {
              const bubble = positions[event.id];
              if (!bubble) {
                return null;
              }

              const anchorX = xFromTime(getMidpointMs(event), trip, surfaceWidth);
              const anchorY = canvasHeight / 2;
              const controlY = event.lane === 'top' ? bubble.y + 110 : bubble.y - 110;
              const path = `M ${anchorX} ${anchorY} Q ${(anchorX + bubble.x) / 2} ${controlY} ${bubble.x} ${bubble.y}`;

              return (
                <g key={`stem-${event.id}`}>
                  <path
                    d={path}
                    className={event.kind === 'hard' ? 'timeline-stem timeline-stem-hard' : 'timeline-stem'}
                    style={{ stroke: event.color }}
                  />
                  <circle cx={anchorX} cy={anchorY} r={4} fill={event.color} opacity="0.95" />
                </g>
              );
            })}
          </svg>

          {trip.events.map((event, index) => {
            const bubble = positions[event.id];
            if (!bubble) {
              return null;
            }

            const midpointIso = new Date(getMidpointMs(event)).toISOString();
            const scheduledRange = `${formatTimeLabel(event.startUtc, trip.displayTimezone)} - ${formatTimeLabel(
              event.endUtc,
              trip.displayTimezone,
            )}`;
            const bubbleMeta = event.location || event.eventTimezone;

            return (
              <button
                key={event.id}
                type="button"
                className={[
                  'event-bubble',
                  selectedEventId === event.id ? 'is-selected' : '',
                  draggingEventId === event.id ? 'is-dragging' : '',
                  conflictingIdSet.has(event.id) ? 'has-conflict' : '',
                  event.kind === 'hard' ? 'is-hard' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={
                  {
                    left: bubble.x,
                    top: bubble.y,
                    width: bubble.width,
                    minHeight: bubble.height,
                    '--bubble-color': event.color,
                    '--bubble-delay': `${index * 55}ms`,
                  } as CSSProperties
                }
                onClick={() => onSelectEvent(event.id)}
                onPointerDown={(pointerEvent) => {
                  onSelectEvent(event.id);

                  if (event.kind === 'hard') {
                    return;
                  }

                  pointerEvent.preventDefault();
                  dragRef.current = {
                    eventId: event.id,
                    pointerId: pointerEvent.pointerId,
                    x: bubble.x,
                    y: bubble.y,
                  };
                  setDraggingEventId(event.id);
                }}
                title={`${event.title} • view ${formatDateTimeLabel(midpointIso, trip.displayTimezone)} • local ${formatDateTimeLabel(midpointIso, event.eventTimezone)}`}
              >
                <span className="event-bubble-inner">
                  <span className="event-kind-tag">{describeKind(event.kind)}</span>
                  <strong>{event.title}</strong>
                  <span>{scheduledRange}</span>
                  <span>{bubbleMeta}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
