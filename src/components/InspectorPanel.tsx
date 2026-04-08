import type { TimelineEvent, Trip } from '../types';
import { formatDateTimeLabel, formatTimeLabel } from '../utils/time';

type InspectorPanelProps = {
  trip: Trip;
  selectedEvent: TimelineEvent | undefined;
  onSelectTimezone: (timeZone: string) => void;
  onEventPatch: (eventId: string, patch: Partial<TimelineEvent>) => void;
  onAddEvent: () => void;
  onResetDemo: () => void;
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

export function InspectorPanel({
  trip,
  selectedEvent,
  onSelectTimezone,
  onEventPatch,
  onAddEvent,
  onResetDemo,
}: InspectorPanelProps) {
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
          <button type="button" className="ghost-button" onClick={onResetDemo}>
            Reset Demo
          </button>
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
                <span>Mode</span>
                <select
                  value={selectedEvent.kind}
                  onChange={(event) =>
                    onEventPatch(selectedEvent.id, {
                      kind: event.target.value as TimelineEvent['kind'],
                      preferredStartUtc:
                        event.target.value === 'flexible' ? selectedEvent.preferredStartUtc ?? selectedEvent.startUtc : undefined,
                    })
                  }
                >
                  <option value="flexible">Float</option>
                  <option value="hard">Anchor</option>
                </select>
              </label>

              <label className="field">
                <span>Lane</span>
                <select
                  value={selectedEvent.lane}
                  onChange={(event) => onEventPatch(selectedEvent.id, { lane: event.target.value as TimelineEvent['lane'] })}
                >
                  <option value="top">Top</option>
                  <option value="bottom">Bottom</option>
                </select>
              </label>
            </div>

            <div className="field-grid">
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
                <span>Starts</span>
                <strong>{formatDateTimeLabel(selectedEvent.startUtc, trip.displayTimezone)}</strong>
              </div>
              <div>
                <span>Ends</span>
                <strong>{formatDateTimeLabel(selectedEvent.endUtc, trip.displayTimezone)}</strong>
              </div>
              <div>
                <span>Window</span>
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
