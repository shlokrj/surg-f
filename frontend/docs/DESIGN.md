# Surg+F design criteria

Owner: Shlok. Branch: `feat/shlok-frontend-v2`. Commit here only for this design round; do not push or merge elsewhere without instruction. Mihir owns spatial behavior. Keep homepage work in `home.js`/`home.css`; coordinate shared player markup and styles before changing them.

## Direction

The first homepage pass was rejected by Shlok: uppercase branding, a circular reticle, slogan copy and a contracting title did not match the reference. Do not restore those choices.

Use the supplied Hangar screenshots as the composition reference: a large rounded panel inset within a white page, a compact top navigation, centered primary content, and a product-preview edge entering from below. The panel expands toward the viewport edges as native scrolling advances. Shlok specifically requests lowercase `surg+f` with the magnifying glass drawn *around* the plus: the real `+` glyph stays at its normal text position and the lens and handle surround it. No giant background circle or crosshair axes.

2026-11-14 revision (Shlok): the dark panel and plus-mark dither were rejected. The hero is now a light teal sky, after Hangar's blue sky (`#1475c8` → `#9cdcf5` in their CSS), with an ordered-dither ombre that rises unevenly from the bottom like the dithered-landscape reference Shlok supplied.

[Hangar](https://hangarplm.com/) supplies visual direction, not copy or assets to reuse. The supplied screenshots and a native Chrome screenshot were inspected. Live reference scroll verification was interrupted by a computer-use failure; exact animation parity is not claimed. The implemented motion follows Shlok's explicit description.

## Type and color

Use Olivia King's Inclusive Sans for headings, copy and controls, self-hosted through `@fontsource-variable/inclusive-sans` (OFL-1.1). Keep the font license in the dependency distribution. Use ordinary weight and size differences before adding a second family. System monospace is acceptable for timestamps/commands, not whole paragraphs. [Requested Figma reference](https://www.figma.com/resource-library/modern-fonts/#font-7-inclusive-sans), [designer's description](https://www.oliviaking.com/inclusivesans/feature).

Palette: white outer page, a teal sky ramp quantized to ten steps from `#1a8a81` (top) to `#f8fdfb` (bottom), white hero type and wordmark, ink `#0b2b28`, muted `#56706b`, off-white page `#f6faf8`, and line `#dbe7e3`. Product windows are cool off-white (`#fdfefe` → `#eff6f3`) with a soft teal shadow. These are brand choices, not a hospital standard. Keep interface text readable; decoration is not information.

## Homepage composition

1. The opening panel has a 10–22px white surround and rounded corners. Scrolling reduces the surround/corner radius while slightly enlarging the central content. Do not reverse this into a shrinking hero.
2. Brand (revised 2026-11-14): `surg` and `f` sit on keycaps joined by `+`, read as the Ctrl+F shortcut, because a lens drawn into the word always read as "surgof". `wordmark()` renders `<kbd>surg</kbd>+<kbd>f</kbd>`, so the text content is `surg+f`. Keycap colors come from `currentColor`: a 55% border, a 9% fill and a 38% bottom edge for key depth. The same markup therefore works white-on-teal in the hero and teal-on-light in the nav, footer and case topbar. The single-letter `f` key is square. In the hero, the keys respond to the pointer like real keycaps: they brighten on hover, and pressing a key sinks only that key. This is purely visual. It does not move focus or change the search box, and the browser's Ctrl+F is never intercepted. The footer dither draws the same keycap mark. The favicon is a bold teal `#1a8a81` plus with a mini plus in each quadrant, on a transparent background, echoing the plus dither.
3. Keep the opening copy to “Search surgical video.” and functional navigation. No eyebrow, shortcut explanation, tagline stack or “less X, more Y” slogan.
4. `ditherCells()` is a deterministic plus-mark dither (2026-11-14 revision: Shlok wanted the dither made of `+` marks). The sky is quantized into 0.42-level steps. Inside a step, an 8×8 Bayer threshold places a 5 px `+` four steps brighter on a 6 px cell, so the average color stays continuous with no banding. Value noise shapes an uneven pale ombre at the bottom. It is painted on `aria-hidden` canvases only when their size changes, with no animation loop.
5. The hero search is a real form floating inside the frame, with the prefilled question "When is the cystic duct cut?" (`DEMO_QUESTION`). Submitting it opens VID01 at 860 s, the only annotated scissors/cut/cystic_duct interval (860–877 s). Any other text opens VID01 and asks Lil Doc. It shows no badge or timestamp; the placeholder ("Ask about the VID01 demo case") and the button label name the case. The last sky stop equals `--page` (`#f7f9f6`). Over the bottom fifth, every column eases evenly to that color, so the hero ends on a straight, seamless line instead of a jagged terrain edge. The search bar's shadow stays inside the frame so it is never clipped into a visible line.
6. The footer borrows Hangar's structure (a 165svh section with a sticky panel), not its effect. The top row is the mark and tagline on one baseline, with links and an "Open a case" button on the right. The bottom row is credits, alphabetical by surname (Aadhitya Balaji, Shlok Jadhav, Mihir Kaushal, Rohan Nuthi), and "MadHacks 2026". The giant `surg+f` is a plus dither on canvas (`paintFooterWord`): the mark is drawn into a coverage grid (4–7 px cells by width, weight 600, the same lens geometry), and `--footer-progress` raises the Bayer threshold so the word fills in with `+` marks, darkens, and zooms 6%.
7. Below the demo, three feature sections follow Hangar's pattern: copy beside a small dithered sky holding a preview. The previews are built only from saved fixtures: VID01 steps, VID01 timeline summary, and quiz seed 1 with its review status. Each button opens VID01 and, where relevant, sends the real `/chart instruments` or `/quiz` command.
8. Buttons use only `.btn-primary`, `.btn-secondary` and the shared toggles from `style.css`. Pressed toggles darken on hover. Minimum text size is 14px. Headings and short paragraphs use `text-wrap: balance` to avoid one-word last lines.
9. Preserve real case entry, the filtered VID01 preview, annotation timestamp action and local playback limitation. The preview-edge strip shows the real `clipper` → VID01 11:14 annotation and links to the actual preview; it is not fake product data.

## Feature stack, how it works, model notes (2026-11-14)

- **Feature stack:** the three feature sections are sticky cards (`.stack-card`, `top: 5vh + i·22px`). As the next card slides up, `--cover` (0–1) scales the previous card to 94% and dims its content. Reduced motion unpins them.
- **How it works:** a pinned scene (`.arch`, `100svh + 6 × 42svh` of scroll) on a plus-dithered panel. Scroll progress sets `--fill`, which draws the line and moves a `+` runner. Six keycap nodes light up in turn, and the detail below swaps to the active step's text and card.
  - Steps: surgery video, frame features, label model, clip index, search and chat, the moment.
  - Facts come from the README, SPEC, DATABRICKS, backend README and Aadhi's `public/model-evals.md`.
  - Each card uses only real data: the 50 cases with VID01/VID02 live, feature shapes `[1734,768]` and `[2840,768]`, the 29 CholecT50 labels, real clip rows, and a live `/search` and Genie answer checked on 2026-11-14.
  - Narrow screens and reduced motion show the steps as a list.
- **Model notes:** Aadhi's held-out F1 scores (final model, MLflow `9d18d20a`).
  - Instrument, best action and best target bars grow, and their numbers count up, once in view.
  - A v1→v2 comparison, three reading notes, and a link to the full `model-evals.md`.

## Case page

`src/case.css` restyles the case page to match the homepage. It uses the off-white page, the rounded product cards (video, overlay strip, timeline, charts, quiz, model) with the soft teal shadow, and a frosted topbar. A single plus-dithered sky band holds the case title, with the VID01/VID02 toggles in a white pill. The content filter is an eye icon button overlaid on the footage, top right; the top bar action is "Open your own video". Spatial/player markup and logic are unchanged; only presentation was overridden, so coordinate with Mihir before changing it further. Shared type tokens were raised to a 13px minimum (`--text-xs` 13, `--text-sm` 14, `--text-md` 15, `--text-base` 16).

Motion: the load-in runs only after a real page change (home ↔ case, including "Open a case"). `render()` sets `#app.page-enter` for 650 ms and passes the elapsed time as a negative `--enter-offset`, so re-renders inside that window continue the animation instead of restarting it. Switching VID01/VID02 and sending commands never animate. The homepage view fades while the frame and search bar rise 6 px. The case band, video and timeline rise 8 px in a 40 ms stagger. Hangar's `cubic-bezier(.16,1,.3,1)` easing is used throughout, and the global reduced-motion rule removes it all.

## Scrolling and the logo

Hangar's brand link is a plain `#hero-title` anchor inside a smooth-scrolling page. Our earlier `scrollIntoView()` on the `h1` also scrolled the clipped, sticky hero layers, which moved the frame contents out of bounds and left the page half-zoomed. In-page links now call `window.scrollTo()` with an absolute offset. The logo and "Back to top" use `#top` (offset 0). The hero, feature panels and cards use `overflow: clip`, so they cannot be scrolled programmatically. The favicon is `public/favicon.svg`: the same lens-around-plus geometry in teal `#1a8a81` on a transparent background.

Reduced motion keeps the inset rounded panel static and removes extra scrolling distance. On narrow screens keep navigation, wordmark and case action within the frame. Use native scroll, accessible controls and visible focus; never intercept browser Ctrl+F.

## Acceptance

Keep existing case/upload/search/quiz/chart/steps flows and overlay logic. Test actual browser layout at desktop and mobile widths, 200% zoom, keyboard-only navigation, reduced motion, missing video and the return-home path. Keep scrolling/resize listeners disposed across application rerenders. Run the build and relevant DOM tests, but explicitly distinguish them from visual browser checks. Apply [anti-slop criteria](ANTI_SLOP.md) to every new screen.
