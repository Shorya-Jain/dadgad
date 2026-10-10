# DADGAD Tab Converter — Plan

## Context
Most guitar tabs online are in standard tuning (EADGBE). The goal is a personal-use website: give it a song (URL or pasted tab), and it produces a playable DADGAD (D2 A2 D3 G3 A3 D4) version. A naive fret-by-fret transposition gives ugly, unplayable shapes, so the core value is an **intelligent re-fingering / re-voicing engine**: it picks string/fret placements that minimise stretches and position jumps, uses DADGAD's open drone strings, and may re-voice chords idiomatically (octave moves, doubled notes, sus/add9 colour) while keeping the harmony and melody.

Decisions made with user: personal use (auto-fetch from tab sites acceptable), re-voicing allowed, deploy cheaply on Cloudflare (user is a beginner and knows a little Python/Java).

## Stack
- **Vite + TypeScript** frontend, deployed to **Cloudflare Pages** (free tier).
- **One Cloudflare Pages Function** (`functions/api/fetch.ts`) to fetch tab pages server-side (browsers can't fetch other sites due to CORS). Free tier: 100k requests/day.
- **Vitest** for engine tests. One language (TS) end-to-end; the engine is pure functions, so it's easy to learn and test.
- No database or accounts in v1.

## Project layout
```
src/
  engine/
    tuning.ts      # tunings as MIDI numbers; pitch <-> (string, fret)
    parse.ts       # ASCII tab + chord-sheet parser -> Event[]
    chords.ts      # chord name <-> pitch classes; identify chord from notes
    voicings.ts    # look up saved voicings; fallback generator (shared with build script)
    optimize.ts    # Viterbi DP choosing placements across the sequence
    render.ts      # Event[] -> DADGAD ASCII tab + chord diagrams
  data/
    dadgad-chords.json  # precomputed: chord -> multiple voicings (committed)
    overrides.json      # hand-curated preferred shapes
  ui/main.ts       # input box (URL or paste), output view, "faithful / idiomatic" toggle
functions/api/fetch.ts   # Cloudflare Pages Function: fetch + extract tab text
tests/*.test.ts
```

## Engine design (the "intelligent" part)
1. **Parse** (`parse.ts`): split the tab into 6-line string blocks, walk the columns, and emit `Event {notes: {string, fret, technique?}[], col}`. Handle multi-digit frets, `h p / \ b ~ x`, bar lines, and chord names above lyrics. Detect two input kinds:
   - *Tab* (note-level), the main path.
   - *Chord sheet* (chord names over lyrics, very common on Ultimate Guitar): emit chord-name events plus lyrics passthrough.
2. **Pitch**: convert each note to MIDI with standard tuning (E2=40 … E4=64). From here on the engine works only with pitches, not standard-tuning shapes.
3. **Candidates per event**: for each event, enumerate assignments of its pitches to distinct DADGAD strings (frets 0–15).
   - *Faithful mode*: exact pitches only.
   - *Idiomatic mode*: also allow ±12 octave moves on non-bass, non-top notes, dropping duplicated pitch classes, and adding open D/A drone strings when they're chord tones or a 9th/sus colour. Each liberty adds a penalty.
   - Prune to the top-K (~30) by static cost.
4. **Static cost** per candidate: fret span (steep penalty above 4), number of fretted fingers, high-position penalty, open-string bonus, and a penalty for unplayable string skips inside a chord.
5. **Transition cost** between consecutive events: hand-position shift (distance between fret centroids), changing strings on a single-note melody line, and a bonus for letting a ringing open string sustain.
6. **Viterbi DP** (`optimize.ts`) over events, minimising total static + transition cost, so it gives globally smooth fingering, not greedy per-note picks.
7. **Chords use a precomputed voicing library, not runtime search.** Chord shapes don't change between songs, so they're computed once and saved:
   - `src/data/dadgad-chords.json`: chord name → a **list of voicings**. Each one has `{frets: [6], fingers, baseFret, bass, top, difficulty, tags}`, e.g. open-drone, barre, or high-position.
   - It is generated **once, offline** by `scripts/build-chord-library.ts`. The script enumerates every 4-fret window, keeps playable shapes that contain the chord tones (allowing open drones/sus/add9 colour), scores them, and keeps the best ~4–6 per chord, spread across the neck (low, mid and high positions). The output is committed to the repo.
   - `src/data/overrides.json`: hand-curated favourite shapes (e.g. the classic DADGAD G, D, Em shapes). These win over generated ones, so the library improves as you play.
   - Coverage: 12 roots × common qualities (maj, m, 7, m7, maj7, sus2, sus4, add9, 5, dim, aug, 6, m6, 9, slash chords via bass override).
   - At runtime, for a chord event (a chord-sheet name, or 3+ notes identified as a chord by `chords.ts`), the candidates are just the saved voicings for that chord. The **Viterbi DP picks which voicing to use at each moment to minimise hand travel** across the progression (e.g. stay near fret 5 for a G→C→D run rather than jumping). This is a cheap lookup plus a tiny DP, with no per-song generation.
   - Runtime search (step 3) is used only for single-note melody lines and for chords missing from the library. Those are also memoised in-session by pitch set.
8. **Render**: rebuild the ASCII tab at the original column alignment with the DADGAD tuning header. Mark re-voiced notes (e.g. with a footnote marker) and show chord diagrams for chord sheets.

## Fetching (`functions/api/fetch.ts`)
- `GET /api/fetch?url=…`, with an allow-list of hosts (ultimate-guitar.com, and others added later) so it isn't an open proxy.
- Ultimate Guitar: parse the `js-store` `data-content` JSON embedded in the page, then read the tab content (`[tab]` / `[ch]` markup) and strip it to plain text.
- If blocked or parsing fails, return a clear error. The UI then falls back to the paste box (always available).
- Song search for v1: a box that opens a web search (`<song> tab site:ultimate-guitar.com`) in a new tab. The user copies the URL back in. A built-in search can come later.

## Build order
1. Scaffold Vite + TS + Vitest → verify: `npm run dev` serves the page; `npm test` runs.
2. `tuning.ts` + `parse.ts` → verify: tests parse sample tabs (techniques, multi-digit frets, multiple blocks).
3. Faithful-mode `optimize.ts` + `render.ts` → verify: tests show every output pitch equals its input pitch, and spans stay at or below 4 on test riffs.
4. UI paste → convert → display → verify in the browser.
5. Chord library: `chords.ts`, then `scripts/build-chord-library.ts` → generate `dadgad-chords.json` → verify: every voicing contains its chord tones and spans ≤4 frets, and each common chord (G, C, Em, D, Am, F) has several positions. Eyeball the output and add favourites to `overrides.json`.
6. Idiomatic mode + toggle, using library voicings in the DP → verify: a test progression (e.g. G–C–D–Em) picks voicings with less total travel than always taking the first voicing.
7. Fetch function → verify locally with `npx wrangler pages dev` against a real UG URL, and confirm the fallback message when blocked.
8. Deploy: `npx wrangler pages deploy dist` (or connect the GitHub repo in the Cloudflare dashboard) → verify the live URL works end-to-end.

## Verification
- `npm test`: parser, pitch preservation, span limits, chord-identity checks.
- Manual: paste a few real tabs (a fingerpicked arrangement, a riff, a chord sheet) and check playability by ear and by hand.
- Live site on `*.pages.dev`, $0/month.

## Out of scope for v1
Accounts, saved tabs, audio playback, Guitar Pro file import, and capo suggestions (a good v2 idea).
