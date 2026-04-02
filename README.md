# SolKarta — Premium Sun-Intelligence Platform

> Objectively measure sunlight for Swedish real estate listings.

SolKarta converts the subjective "brightness" of a property listing into hard physical data — helping buyers make informed decisions based on real solar exposure, not guesswork.

---

## What it does

- **3D Shadow Simulation** — Real-time shadow rendering on Mapbox v3 Standard Style based on actual sun position
- **Sun Score (A–F)** — Proprietary rating algorithm that factors in surrounding building obstruction
- **Time Slider** — Scrub through any day of the year and watch shadows move at 60fps
- **Solar Altitude Chart** — Visualize sunrise/sunset curves and peak intensity times
- **Winter Solstice Report** — See how a property survives the darkest day of the year (Dec 21)

---

## Tech Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 14 (App Router) + TypeScript |
| 3D Map | Mapbox GL JS v3 (Standard Style + Terrain RGB) |
| Sun Logic | SunCalc (azimuth, altitude) |
| UI | Tailwind CSS + shadcn/ui + framer-motion |
| Database | Supabase (Auth, DB, PostGIS) |
| Charts | Recharts |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [Mapbox access token](https://account.mapbox.com/access-tokens/)

### Setup

```bash
git clone https://github.com/your-username/solkarta.git
cd solkarta
npm install
cp .env.local.example .env.local
# Fill in your Mapbox token in .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

See `.env.local.example` for required keys:

```
NEXT_PUBLIC_MAPBOX_TOKEN=your_token_here
```

---

## Roadmap

- [x] Mapbox v3 3D buildings + real-time shadow via `setLight`
- [x] SunCalc integration + time slider UI
- [x] Solar altitude/azimuth chart (Recharts)
- [ ] Address search with camera `flyTo`
- [ ] Hemnet URL → coordinates parser (Edge Function)
- [ ] Sun Score algorithm (A–F grade with obstacle interference)
- [ ] Premium Report PDF (paywall)
- [ ] PWA support for on-site property visits
- [ ] Vercel deployment

---

## License

MIT
