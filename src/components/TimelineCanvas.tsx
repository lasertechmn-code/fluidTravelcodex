import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { BubblePosition, TimelineEvent, Trip } from '../types';
import { clamp, formatDateTimeLabel, formatDayLabel, formatTimeLabel, minutesToMs } from '../utils/time';

type TimelineCanvasProps = {
  trip: Trip;
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

const framePadding = 44;
const axisInset = 110;
const canvasHeight = 720;

function getMidpointMs(event: TimelineEvent) {
  const start = new Date(event.startUtc).getTime();
  const end = new Date(event.endUtc).getTime();
  return start + (end - start) / 2;
}

function getRadius(event: TimelineEvent) {
  return 52 + Math.min(26, event.durationMin / 7);
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
      const radius = getRadius(event);
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
          radius,
        },
      ];
    }),
  ) as Record<string, { x: number; y: number; radius: number }>;
}

function describeKind(kind: TimelineEvent['kind']) {
  return kind === 'hard' ? 'Anchor' : 'Float';
}

export function TimelineCanvas({
  trip,
  selectedEventId,
  onSelectEvent,
  onMoveFlexibleEvent,
}: TimelineCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(1200);
  const [positions, setPositions] = useState<Record<string, BubblePosition>>({});
  const dragRef = useRef<DragState | null>(null);
  const [draggingEventId, setDraggingEventId] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    const updateSize = () => {
      if (!containerRef.current) {
        return;
      }

      setWidth(containerRef.current.clientWidth);
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const targets = buildTargets(trip.events, trip, width);

    setPositions((current) => {
      const next: Record<string, BubblePosition> = {};

      for (const event of trip.events) {
        const target = targets[event.id];
        const existing = current[event.id];
        next[event.id] = existing
          ? {
              ...existing,
              radius: target.radius,
            }
          : {
              x: target.x + (Math.random() * 28 - 14),
              y: target.y + (Math.random() * 28 - 14),
              vx: 0,
              vy: 0,
              radius: target.radius,
            };
      }

      return next;
    });
  }, [trip, width]);

  useEffect(() => {
    let frameId = 0;

    const tick = () => {
      setPositions((current) => {
        const targets = buildTargets(trip.events, trip, width);
        const next: Record<string, BubblePosition> = {};

        for (const event of trip.events) {
          const existing = current[event.id] ?? {
            x: targets[event.id].x,
            y: targets[event.id].y,
            vx: 0,
            vy: 0,
            radius: targets[event.id].radius,
          };

          next[event.id] = {
            ...existing,
            radius: targets[event.id].radius,
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
            const minimumDistance = nodeA.radius + nodeB.radius + 18;

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

          const left = framePadding + node.radius;
          const right = Math.max(width - framePadding - node.radius, left);
          node.x = clamp(node.x, left, right);

          const topLimit = axisInset + node.radius;
          const bottomLimit = canvasHeight - axisInset - node.radius;
          const laneGap = 56;

          if (event.lane === 'top') {
            node.y = clamp(node.y, topLimit, canvasHeight / 2 - laneGap - node.radius);
          } else {
            node.y = clamp(node.y, canvasHeight / 2 + laneGap + node.radius, bottomLimit);
          }
        }

        return next;
      });

      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [trip, width]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      const bounds = containerRef.current?.getBoundingClientRect();

      if (!drag || !bounds || drag.pointerId !== event.pointerId) {
        return;
      }

      dragRef.current = {
        ...drag,
        x: clamp(event.clientX - bounds.left, framePadding + 36, bounds.width - framePadding - 36),
        y: clamp(event.clientY - bounds.top, 72, canvasHeight - 72),
      };
    };

    const handlePointerUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }

      const draggedEvent = trip.events.find((candidate) => candidate.id === drag.eventId);
      if (draggedEvent && draggedEvent.kind === 'flexible') {
        const nextStartMs = timeFromX(drag.x, trip, width) - minutesToMs(draggedEvent.durationMin) / 2;
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
  }, [onMoveFlexibleEvent, trip, width]);

  const tripStartMs = new Date(trip.startUtc).getTime();
  const tripEndMs = new Date(trip.endUtc).getTime();
  const totalHours = Math.max((tripEndMs - tripStartMs) / 36e5, 1);
  const dayCount = Math.ceil(totalHours / 24);
  const guideDays = Array.from({ length: dayCount + 1 }, (_, index) => {
    const timeMs = tripStartMs + Math.min(index * 24, totalHours) * 36e5;
    return {
      label: formatDayLabel(new Date(timeMs).toISOString(), trip.displayTimezone),
      x: xFromTime(timeMs, trip, width),
    };
  });

  const nowMs = Date.now();
  const nowVisible = nowMs >= tripStartMs && nowMs <= tripEndMs;
  const nowX = nowVisible ? xFromTime(nowMs, trip, width) : 0;

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

      <div className="timeline-canvas" ref={containerRef}>
        <svg className="timeline-svg" viewBox={`0 0 ${width} ${canvasHeight}`} preserveAspectRatio="none" aria-hidden>
          {guideDays.map((day) => (
            <g key={day.label + day.x}>
              <line className="timeline-guide" x1={day.x} x2={day.x} y1="46" y2={canvasHeight - 46} />
              <text className="timeline-guide-label" x={day.x + 8} y="40">
                {day.label}
              </text>
            </g>
          ))}

          <line className="timeline-axis-line" x1={framePadding} x2={width - framePadding} y1={canvasHeight / 2} y2={canvasHeight / 2} />

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

            const anchorX = xFromTime(getMidpointMs(event), trip, width);
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

          return (
            <button
              key={event.id}
              type="button"
              className={[
                'event-bubble',
                selectedEventId === event.id ? 'is-selected' : '',
                draggingEventId === event.id ? 'is-dragging' : '',
                event.kind === 'hard' ? 'is-hard' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={
                {
                  left: bubble.x,
                  top: bubble.y,
                  width: bubble.radius * 2,
                  height: bubble.radius * 2,
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
              title={`${event.title} • ${formatDateTimeLabel(midpointIso, trip.displayTimezone)}`}
            >
              <span className="event-bubble-inner">
                <span className="event-kind-tag">{describeKind(event.kind)}</span>
                <strong>{event.title}</strong>
                <span>{scheduledRange}</span>
                <span>{event.location}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
