# DADGAD Tabs

Turn standard-tuning guitar tabs and chord sheets into playable **DADGAD** (low to high: D A D G A D).

Live site: https://dadgad-cmo.pages.dev

A note-for-note transposition usually gives awkward shapes. This app instead works out the actual
pitches, then picks string/fret placements across the **whole song** that minimise stretches and hand
movement and make use of DADGAD's open strings. Chords come from a precomputed library of DADGAD
shapes, and the shape is chosen to stay close to where your hand already is.

- **Idiomatic mode:** may re-voice chords into classic DADGAD shapes (same harmony, different
  notes). Changed spots are marked `*`.
- **Faithful mode:** keeps every note exactly as written and only re-fingers it.

Tabs don't have to be in standard tuning. The app reads the tab's tuning and capo, including a
partial capo that leaves the low string open, from its "Tuning:" notes or the string names on the
tab lines. It fills in the **Tab's tuning / Capo** fields, which you can correct before converting.
Notes about the original tuning, author credits and other preamble are left out of the result.

## Run it locally

You need [Node.js](https://nodejs.org) 20 or newer.

```sh
npm install        # once, after cloning
npm run dev        # start the site at http://localhost:5173
```

Paste a standard-tuning tab or chord sheet into the box and click **Convert**.

The **Fetch** button (load a tab from an Ultimate Guitar URL) needs the Cloudflare function, which
`npm run dev` doesn't run. To try it locally:

```sh
npm run pages:dev  # build, then serve with the function at http://localhost:8788
```

If Ultimate Guitar blocks the fetch, copy the tab from the page and paste it in instead.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Local dev server with live reload |
| `npm test` | Run the tests |
| `npm run build` | Type-check and build the site into `dist/` |
| `npm run pages:dev` | Build and serve with the Cloudflare fetch function |
| `npm run deploy` | Build and publish to Cloudflare Pages (needs `npx wrangler login` once) |
| `npm run chords` | Regenerate the chord library (only needed after changing chord scoring) |

## Your favourite chord shapes

Add shapes to `src/data/overrides.json`, listing frets from the low D string to the high D string
(`null` = don't play that string):

```json
{
  "D": [[0, 0, 4, 2, 0, 0]]
}
```

These are always tried before the generated shapes. `npm test` checks that each one really contains
the chord's notes.

## How it's organised

```
src/engine/      conversion logic (plain TypeScript, no UI)
  parse.ts       reads tab blocks and chord lines
  optimize.ts    candidate placements + whole-song optimiser (Viterbi)
  voicings.ts    DADGAD chord shape generator and lookup
  chords.ts      chord names <-> notes
  render.ts      writes the DADGAD tab back out
  convert.ts     ties it all together
src/data/        precomputed chord library + your overrides
src/ui/          the web page
functions/api/   Cloudflare function that fetches tab pages
scripts/         chord library generator
tests/           tests (npm test)
```

See [plan.md](plan.md) for the design notes.
