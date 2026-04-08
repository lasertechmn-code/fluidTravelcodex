import type { TimelineEvent, Trip } from '../types';
import type { TripDiagnostics } from '../utils/scheduler';
import { formatDateTimeLabel, formatTimeLabel, localInputToUtcIso, utcToLocalInputValue } from '../utils/time';

type InspectorPanelProps = {
  trip: Trip;
  selectedEvent: TimelineEvent | undefined;
  onSelectTimezone: (timeZone: string) => void;
  onEventPatch: (eventId: string, patch: Partial<TimelineEvent>) => void;
  onAddEvent: () => void;
  onMakeItWork: () => void;
  onResetDemo: () => void;
  solutionIndex: number;
  diagnostics: TripDiagnostics;
};

const timezones = [
  'America/Chicago',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
  'UTC',
];

const allTimezones =
  typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : timezones;

const behaviorOptions = [
  { value: 'flexible', label: 'Floating event' },
  { value: 'hard', label: 'Fixed anchor' },
] satisfies Array<{ value: TimelineEvent['kind']; label: string }>;

const laneOptions = [
  { value: 'top', label: 'Above the timeline' },
  { value: 'bottom', label: 'Below the timeline' },
] satisfies Array<{ value: TimelineEvent['lane']; label: string }>;

export function InspectorPanel({
  trip,
  selectedEvent,
  onSelectTimezone,
  onEventPatch,
  onAddEvent,
  onMakeItWork,
  onResetDemo,
  solutionIndex,
  diagnostics,
}: InspectorPanelProps) {
  const hasConflicts = diagnostics.overlappingPairs.length > 0;
  return (
    <aside className="inspector">
      <section className="panel glass-panel hero-panel">
        <p className="eyebrow">Trip Mood</p>
        <h1>{trip.title}</h1>
        <p>{trip.subtitle}</p>
        <div className="hero-actions">
          <button type="button" className="primary-button" onClick={onAddEvent}>
            Add Floating Event
          </button>
          <button type="button" className="secondary-button" onClick={onMakeItWork}>
            Make It Work
          </button>
          <button type="button" className="ghost-button" onClick={onResetDemo}>
            Reset Demo
          </button>
        </div>
        <p className="field-hint">Viewing alternate solution {solutionIndex + 1}. Press “Make It Work” again for another layout.</p>
        <div className={hasConflicts ? 'status-banner is-warning' : 'status-banner is-good'}>
          <strong>{hasConflicts ? `${diagnostics.overlappingPairs.length} timing conflict${diagnostics.overlappingPairs.length === 1 ? '' : 's'}` : 'No timing conflicts'}</strong>
          <span>
            {hasConflicts
              ? `${diagnostics.conflictingEventIds.length} events still overlap in real time.`
              : diagnostics.crowdedPairs > 0
                ? `${diagnostics.crowdedPairs} visually crowded pair${diagnostics.crowdedPairs === 1 ? '' : 's'} remain.`
                : 'Timeline is both clean in time and visually roomy.'}
          </span>
        </div>
      </section>

      <section className="panel glass-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Display Timezone</p>
            <h2>Read the whole timeline in one clock</h2>
          </div>
        </div>

        <label className="field">
          <span>Timezone</span>
          <select value={trip.displayTimezone} onChange={(event) => onSelectTimezone(event.target.value)}>
            {timezones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="panel glass-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Legend</p>
            <h2>How the bubbles behave</h2>
          </div>
        </div>
        <ul className="legend-list">
          <li>
            <span className="legend-dot is-flexible" />
            <div>
              <strong>Float</strong>
              <p>Drag these around. They will push, settle, and re-pack around the anchors.</p>
            </div>
          </li>
          <li>
            <span className="legend-dot is-hard" />
            <div>
              <strong>Anchor</strong>
              <p>These stay locked in time and act like immovable stones in the current.</p>
            </div>
          </li>
        </ul>
      </section>

      <section className="panel glass-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Selected Event</p>
            <h2>{selectedEvent ? selectedEvent.title : 'Choose a bubble'}</h2>
          </div>
        </div>

        {selectedEvent ? (
          <div className="editor-stack">
            <label className="field">
              <span>Title</span>
              <input
                type="text"
                value={selectedEvent.title}
                onChange={(event) => onEventPatch(selectedEvent.id, { title: event.target.value })}
              />
            </label>

            <div className="field-grid">
              <label className="field">
                <span>Event Timezone</span>
                <select
                  value={selectedEvent.eventTimezone}
                  onChange={(event) => onEventPatch(selectedEvent.id, { eventTimezone: event.target.value })}
                >
                  {allTimezones.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Behavior</span>
                <div className="choice-row" role="group" aria-label="Behavior">
                  {behaviorOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={selectedEvent.kind === option.value ? 'choice-chip is-active' : 'choice-chip'}
                      onClick={() =>
                        onEventPatch(selectedEvent.id, {
                          kind: option.value,
                          preferredStartUtc:
                            option.value === 'flexible'
                              ? selectedEvent.preferredStartUtc ?? selectedEvent.startUtc
                              : undefined,
                        })
                      }
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </label>
            </div>
            <p className="field-hint">
              Behavior decides whether the event can move and flow around other items or stays locked as a fixed
              anchor.
            </p>

            <label className="field">
              <span>Event Local Start</span>
              <input
                type="datetime-local"
                value={utcToLocalInputValue(selectedEvent.startUtc, selectedEvent.eventTimezone)}
                onChange={(event) => {
                  const nextUtc = localInputToUtcIso(event.target.value, selectedEvent.eventTimezone);
                  if (!nextUtc) {
                    return;
                  }

                  onEventPatch(selectedEvent.id, {
                    startUtc: nextUtc,
                    preferredStartUtc: selectedEvent.kind === 'flexible' ? nextUtc : undefined,
                  });
                }}
              />
            </label>

            <div className="field-grid">
              <label className="field">
                <span>Axis Side</span>
                <div className="choice-row" role="group" aria-label="Axis side">
                  {laneOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={selectedEvent.lane === option.value ? 'choice-chip is-active' : 'choice-chip'}
                      onClick={() => onEventPatch(selectedEvent.id, { lane: option.value })}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </label>

              <label className="field">
                <span>Duration</span>
                <input
                  type="range"
                  min="30"
                  max="240"
                  step="5"
                  value={selectedEvent.durationMin}
                  onChange={(event) => onEventPatch(selectedEvent.id, { durationMin: Number(event.target.value) })}
                />
              </label>
            </div>
            <p className="field-hint">Axis side only controls whether the event sits above or below the center line.</p>

            <div className="field-grid">
              <label className="field">
                <span>Color</span>
                <input
                  type="color"
                  value={selectedEvent.color}
                  onChange={(event) => onEventPatch(selectedEvent.id, { color: event.target.value })}
                />
              </label>
            </div>

            <label className="field">
              <span>Location</span>
              <input
                type="text"
                value={selectedEvent.location}
                onChange={(event) => onEventPatch(selectedEvent.id, { location: event.target.value })}
              />
            </label>

            <label className="field">
              <span>Notes</span>
              <textarea
                rows={4}
                value={selectedEvent.notes}
                onChange={(event) => onEventPatch(selectedEvent.id, { notes: event.target.value })}
              />
            </label>

            <div className="event-readout">
              <div>
                <span>Starts In View</span>
                <strong>{formatDateTimeLabel(selectedEvent.startUtc, trip.displayTimezone)}</strong>
              </div>
              <div>
                <span>Ends In View</span>
                <strong>{formatDateTimeLabel(selectedEvent.endUtc, trip.displayTimezone)}</strong>
              </div>
              <div>
                <span>Event Local Time</span>
                <strong>{formatDateTimeLabel(selectedEvent.startUtc, selectedEvent.eventTimezone)}</strong>
              </div>
              <div>
                <span>Window In View</span>
                <strong>
                  {formatTimeLabel(selectedEvent.startUtc, trip.displayTimezone)} -{' '}
                  {formatTimeLabel(selectedEvent.endUtc, trip.displayTimezone)}
                </strong>
              </div>
            </div>
          </div>
        ) : (
          <p className="empty-state">Pick any bubble on the timeline to tune its color, duration, and behavior.</p>
        )}
      </section>
    </aside>
  );
}
