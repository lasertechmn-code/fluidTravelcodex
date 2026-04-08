Here’s a complete, copy-paste ready scaffold for **Step 1**. It sets up Vite + React + TypeScript, Tailwind CSS, Zustand with persistence, timezone helpers, and a clean folder structure. Everything is optimized for offline use and ready for the timeline/DnD layers in the next steps.

---
### 🚀 1. Terminal Setup
Run these commands in your terminal:
```bash
# 1. Create project & scaffold Vite
mkdir fluid-timeline && cd fluid-timeline
npm init vite@latest . -- --template react-ts

# 2. Install core dependencies
npm install zustand date-fns date-fns-tz @dnd-kit/core @dnd-kit/utilities clsx tailwind-merge

# 3. Install dev dependencies
npm install -D tailwindcss postcss autoprefixer @types/node

# 4. Initialize Tailwind config
npx tailwindcss init -p
```

---
### 📁 2. Folder Structure
Your `src/` should look like this:
```
src/
├── store/
│   └── useStore.ts
├── types/
│   └── index.ts
├── utils/
│   └── time.ts
├── components/
│   └── Header.tsx
├── App.tsx
├── main.tsx
└── index.css
```
Create the missing directories/files as you go.

---
### 📄 3. Configuration Files

**`tailwind.config.js`**
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0b0f19',
        surface: '#111827',
        accent: '#6366f1',
        text: '#e2e8f0',
        muted: '#94a3b8'
      }
    }
  },
  plugins: []
}
```

**`vite.config.ts`**
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: { port: 3000, open: true }
})
```

---
### 📦 4. Core Source Code

**`src/types/index.ts`**
```ts
export type Location = {
  name: string;
  timezone: string; // IANA string e.g. "Asia/Tokyo"
};

export type TripEvent = {
  id: string;
  title: string;
  type: 'hard' | 'flexible';
  durationMin: number;
  location: Location;
  startUtc: string;
  endUtc: string;
  order: number;
  color: string;
};

export type Trip = {
  id: string;
  title: string;
  startUtc: string;
  endUtc: string;
  displayTimezone: string;
  events: TripEvent[];
};

export type StoreState = {
  trip: Trip;
  setDisplayTimezone: (tz: string) => void;
  addEvent: (event: Omit<TripEvent, 'id' | 'startUtc' | 'endUtc' | 'order'>) => void;
  updateEvent: (id: string, updates: Partial<TripEvent>) => void;
  reorderEvents: (fromIndex: number, toIndex: number) => void;
};
```

**`src/utils/time.ts`**
```ts
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz';

export const toUserTz = (utcIso: string, tz: string) => 
  utcToZonedTime(new Date(utcIso), tz);

export const toUtc = (localDate: Date, tz: string) => 
  zonedTimeToUtc(localDate, tz).toISOString();

export const formatTime = (date: Date, tz: string, fmt: string = 'HH:mm') => {
  const { format } = await import('date-fns'); // dynamic import to keep bundle small
  return format(utcToZonedTime(date, tz), fmt);
};
```
*(Note: I'll fix the dynamic import in the actual component usage for simplicity, or use standard sync imports. Let's adjust `utils/time.ts` to be fully sync for now.)*

**Updated `src/utils/time.ts`**
```ts
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz';
import { format } from 'date-fns';

export const toUserTz = (utcIso: string, tz: string) => 
  utcToZonedTime(new Date(utcIso), tz);

export const toUtc = (localDate: Date, tz: string) => 
  zonedTimeToUtc(localDate, tz).toISOString();

export const fmt = (utcIso: string, tz: string, pattern: string = 'HH:mm') => 
  format(toUserTz(utcIso, tz), pattern);
```

**`src/store/useStore.ts`**
```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { StoreState, TripEvent } from '@/types'
import { nanoid } from 'nanoid/non-secure' // lightweight ID gen

// Install: npm i nanoid
// We'll use a simple fallback if you don't want extra deps:
const uid = () => Math.random().toString(36).slice(2, 10);

export const useStore = create<StoreState>()(
  persist(
    (set) => ({
      trip: {
        id: uid(),
        title: 'My Week Abroad',
        startUtc: new Date().toISOString(),
        endUtc: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        displayTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        events: []
      },
      setDisplayTimezone: (tz) => set((s) => ({ trip: { ...s.trip, displayTimezone: tz } })),
      addEvent: (data) => set((s) => {
        const newEvent: TripEvent = {
          ...data,
          id: uid(),
          order: s.trip.events.length,
          startUtc: new Date().toISOString(), // placeholder, will be scheduled
          endUtc: new Date().toISOString()
        };
        return { trip: { ...s.trip, events: [...s.trip.events, newEvent] } };
      }),
      updateEvent: (id, updates) => set((s) => ({
        trip: {
          ...s.trip,
          events: s.trip.events.map(e => e.id === id ? { ...e, ...updates } : e)
        }
      })),
      reorderEvents: () => set(() => ({})) // placeholder for DnD
    }),
    { name: 'fluid-timeline-db' } // persists to localStorage automatically
  )
)
```

**`src/components/Header.tsx`**
```tsx
import { useStore } from '@/store/useStore';
import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { toUserTz } from '@/utils/time';

export function Header() {
  const { trip, setDisplayTimezone } = useStore();
  const [zones] = useState(() => Intl.supportedValuesOf('timeZone'));
  const [showZones, setShowZones] = useState(false);

  return (
    <header className="flex items-center justify-between p-4 bg-surface border-b border-gray-800">
      <div>
        <h1 className="text-xl font-bold text-text">{trip.title}</h1>
        <p className="text-xs text-muted">
          {format(toUserTz(trip.startUtc, trip.displayTimezone), 'MMM d')} →{' '}
          {format(toUserTz(trip.endUtc, trip.displayTimezone), 'MMM d, yyyy')}
        </p>
      </div>
      <div className="relative">
        <button 
          onClick={() => setShowZones(!showZones)}
          className="px-3 py-1.5 text-sm bg-accent/20 text-accent rounded hover:bg-accent/30 transition"
        >
          🌍 {trip.displayTimezone}
        </button>
        {showZones && (
          <select
            value={trip.displayTimezone}
            onChange={(e) => setDisplayTimezone(e.target.value)}
            onBlur={() => setShowZones(false)}
            className="absolute top-full right-0 mt-1 bg-surface border border-gray-700 text-text text-sm rounded p-1 w-48"
          >
            {zones.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
        )}
      </div>
    </header>
  );
}
```

**`src/App.tsx`**
```tsx
import { Header } from '@/components/Header';
import { useStore } from '@/store/useStore';

export default function App() {
  const { trip } = useStore();

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col">
      <Header />
      <main className="flex-1 p-4 overflow-hidden">
        <div className="h-full border-2 border-dashed border-gray-700 rounded-lg flex items-center justify-center bg-surface/50">
          <p className="text-muted text-sm">Timeline Canvas Placeholder (Next Step)</p>
        </div>
      </main>
    </div>
  );
}
```

**`src/index.css`**
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  font-family: Inter, system-ui, -apple-system, sans-serif;
  background-color: #0b0f19;
  color: #e2e8f0;
}

* { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; }
```

**`src/main.tsx`**
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

---
### ✅ 5. Run & Verify
```bash
npm run dev
```
- Open `http://localhost:3000`
- You should see a dark-themed header with your trip dates
- Click the timezone button to switch your display TZ
- Change it in browser DevTools > Application > Local Storage → `fluid-timeline-db` to verify persistence survives refresh

---
### 🔜 Next Step (Step 2)
I’ll build the **SVG Arc Timeline + Drag & Drop + Auto-Scheduler**. It will:
- Render a horizontal time axis
- Draw Bézier arcs for events
- Let you drag flexible events
- Auto-bump overlaps & recalculate times
- Show UTC → Local TZ tooltips on hover

Reply with `2` when ready, and I’ll drop the complete timeline component + scheduler logic.