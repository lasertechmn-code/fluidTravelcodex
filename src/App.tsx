import { useEffect, useState } from 'react';
import { TimelineCanvas } from './components/TimelineCanvas';
import { InspectorPanel } from './components/InspectorPanel';
import { createDemoTrip } from './data/sampleTrip';
import type { TimelineEvent, Trip } from './types';
import { getTripDiagnostics, makeItWorkTrip, moveFlexibleEvent, rescheduleTrip, updateEventInTrip } from './utils/scheduler';
import { formatDayLabel, makeUtcIso, minutesToMs } from './utils/time';

const storageKey = 'fluid-timeline-trip-v1';
const palette = ['#ff8a5b', '#3db7a7', '#7ea7ff', '#ffcc66', '#5dd39e', '#ff6f91', '#4cc9f0', '#ff9f1c'];

function normalizeTrip(trip: Trip): Trip {
  return {
    ...trip,
    events: trip.events.map((event) => ({
      ...event,
      eventTimezone: event.eventTimezone ?? trip.displayTimezone ?? 'UTC',
    })),
  };
}

function readStoredTrip() {
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return createDemoTrip();
  }

  try {
    const parsed = JSON.parse(raw) as Trip;
    return rescheduleTrip(normalizeTrip(parsed));
  } catch {
    return createDemoTrip();
  }
}

export default function App() {
  const [trip, setTrip] = useState<Trip>(() => readStoredTrip());
  const [solutionIndex, setSolutionIndex] = useState(0);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(trip.events[0]?.id ?? null);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(trip));
  }, [trip]);

  const selectedEvent = trip.events.find((event) => event.id === selectedEventId);
  const diagnostics = getTripDiagnostics(trip);

  const handleEventPatch = (eventId: string, patch: Partial<TimelineEvent>) => {
    setSolutionIndex(0);
    setTrip((currentTrip) => updateEventInTrip(currentTrip, eventId, patch));
  };

  const handleAddEvent = () => {
    const tripStartDay = new Date(trip.startUtc);
    const nextColor = palette[trip.events.length % palette.length];
    const nextPreferred = makeUtcIso(
      tripStartDay.getUTCFullYear(),
      tripStartDay.getUTCMonth() + 1,
      tripStartDay.getUTCDate() + 2,
      8 + (trip.events.length % 5) * 2,
      0,
    );

    const nextEvent: TimelineEvent = {
      id: `custom-${crypto.randomUUID()}`,
      title: 'New Floating Moment',
      notes: 'Add your own ritual, errand, or detour here.',
      location: 'Set a place',
      eventTimezone: trip.displayTimezone,
      color: nextColor,
      kind: 'flexible',
      lane: trip.events.length % 2 === 0 ? 'top' : 'bottom',
      durationMin: 75,
      startUtc: nextPreferred,
      endUtc: new Date(new Date(nextPreferred).getTime() + minutesToMs(75)).toISOString(),
      preferredStartUtc: nextPreferred,
    };

    setTrip((currentTrip) =>
      rescheduleTrip({
        ...currentTrip,
        events: [...currentTrip.events, nextEvent],
      }),
    );
    setSolutionIndex(0);
    setSelectedEventId(nextEvent.id);
  };

  const handleResetDemo = () => {
    const freshTrip = createDemoTrip();
    setTrip(freshTrip);
    setSolutionIndex(0);
    setSelectedEventId(freshTrip.events[0]?.id ?? null);
  };

  const handleMakeItWork = () => {
    const nextSolutionIndex = solutionIndex + 1;
    setSolutionIndex(nextSolutionIndex);
    setTrip((currentTrip) => makeItWorkTrip(currentTrip, nextSolutionIndex));
  };

  const tripRange = `${formatDayLabel(trip.startUtc, trip.displayTimezone)} to ${formatDayLabel(
    trip.endUtc,
    trip.displayTimezone,
  )}`;

  return (
    <div className="app-shell">
      <div className="background-orb orb-one" />
      <div className="background-orb orb-two" />
      <div className="background-orb orb-three" />

      <main className="app-grid">
        <section className="experience">
          <header className="topbar glass-panel">
            <div>
              <p className="eyebrow">Beautiful Mention</p>
              <h1>{trip.title}</h1>
              <p>{tripRange}</p>
            </div>
            <div className="topbar-copy">
              <p>
                A visual itinerary where every event has its own hue, every anchor shapes the flow, and every floating
                moment physically reacts to its neighbors.
              </p>
            </div>
          </header>

          <TimelineCanvas
            trip={trip}
            zoom={timelineZoom}
            onZoomChange={setTimelineZoom}
            conflictingEventIds={diagnostics.conflictingEventIds}
            selectedEventId={selectedEventId}
            onSelectEvent={setSelectedEventId}
            onMoveFlexibleEvent={(eventId, nextStartMs, lane) => {
              setSolutionIndex(0);
              setTrip((currentTrip) => moveFlexibleEvent(currentTrip, eventId, nextStartMs, lane));
            }}
          />
        </section>

        <InspectorPanel
          trip={trip}
          selectedEvent={selectedEvent}
          onSelectTimezone={(timeZone) => setTrip((currentTrip) => ({ ...currentTrip, displayTimezone: timeZone }))}
          onEventPatch={handleEventPatch}
          onAddEvent={handleAddEvent}
          onMakeItWork={handleMakeItWork}
          onResetDemo={handleResetDemo}
          solutionIndex={solutionIndex}
          diagnostics={diagnostics}
        />
      </main>
    </div>
  );
}
