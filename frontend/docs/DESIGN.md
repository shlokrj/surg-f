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
2. `wordmark()` in `home.js` renders `surg`, a real `+` (font-size 0, so it still copies and announces), an `aria-hidden` lens SVG, then `f`. The SVG is drawn in 1/1000 em from measured Inclusive Sans metrics. The plus center sits where the font's own `+` sits, 0.295em above the baseline. Plus, ring and handle use the letter stem weight (84 units) with flat ends. Hero, nav, footer and dashboard use the identical mark at different font sizes.
3. Keep the opening copy to “Search surgical video.” and functional navigation. No eyebrow, shortcut explanation, tagline stack or “less X, more Y” slogan.
4. `ditherCells()` is a deterministic plus-mark dither (2026-11-14 revision: Shlok wanted the dither made of `+` marks). The sky is quantized into 0.42-level steps. Inside a step, an 8×8 Bayer threshold places a 5 px `+` four steps brighter on a 6 px cell, so the average color stays continuous with no banding. Value noise shapes an uneven pale ombre at the bottom. It is painted on `aria-hidden` canvases only when their size changes, with no animation loop.
5. The hero search is a real form floating inside the frame, with a `VID01` tag and the prefilled question "When is the cystic duct cut?" (`DEMO_QUESTION`). Submitting it opens VID01 at 860 s, the only annotated scissors/cut/cystic_duct interval (860–877 s). Any other text opens VID01 and asks Lil Doc. It shows no timestamp. The last sky stop equals `--page` (`#f7f9f6`) and fully faded rows draw that exact color, so the hero meets the next section without a seam.
6. The footer borrows Hangar's structure (a 165svh section with a sticky panel), not its effect. The top row is the mark and tagline on one baseline, with links and an "Open a case" button on the right. The bottom row is credits, alphabetical by surname (Aadhitya Balaji, Shlok Jadhav, Mihir Kaushal, Rohan Nuthi), and "MadHacks 2026". The giant `surg+f` is a plus dither on canvas (`paintFooterWord`): the mark is drawn into a coverage grid (4–7 px cells by width, weight 600, the same lens geometry), and `--footer-progress` raises the Bayer threshold so the word fills in with `+` marks, darkens, and zooms 6%.
7. Below the demo, three feature sections follow Hangar's pattern: copy beside a small dithered sky holding a preview. The previews are built only from saved fixtures: VID01 steps, VID01 timeline summary, and quiz seed 1 with its review status. Each button opens VID01 and, where relevant, sends the real `/chart instruments` or `/quiz` command.
8. Buttons use only `.btn-primary`, `.btn-secondary` and the shared toggles from `style.css`. Pressed toggles darken on hover. Minimum text size is 14px. Headings and short paragraphs use `text-wrap: balance` to avoid one-word last lines.
9. Preserve real case entry, the filtered VID01 preview, annotation timestamp action and local playback limitation. The preview-edge strip shows the real `clipper` → VID01 11:14 annotation and links to the actual preview; it is not fake product data.

## Case page

`src/case.css` restyles the case page to match the homepage. It uses the off-white page, the rounded product cards (video, overlay strip, timeline, charts, quiz, model) with the soft teal shadow, and a frosted topbar. A single plus-dithered sky band holds the case title, with the VID01/VID02 toggles in a white pill. The content filter is an eye icon button overlaid on the footage, top right; the top bar action is "Open your own video". Spatial/player markup and logic are unchanged; only presentation was overridden, so coordinate with Mihir before changing it further. Shared type tokens were raised to a 13px minimum (`--text-xs` 13, `--text-sm` 14, `--text-md` 15, `--text-base` 16).

Motion: switching between the homepage and the case page fades the view in (`#app.page-enter`). The homepage frame and search bar also rise, using `backwards` fill so the scroll transforms take over afterwards. One entrance plays when the case opens (band, video, overlay strip and timeline rise in sequence; the chat fades), using Hangar's `cubic-bezier(.16,1,.3,1)` soft drop. After that, only newly added chat messages, new output panels, and their chart bars animate. `markNew()` in `main.js` tracks what the previous render showed, because the app re-renders with `innerHTML`. The global reduced-motion rule removes all of it.

## Scrolling and the logo

Hangar's brand link is a plain `#hero-title` anchor inside a smooth-scrolling page. Our earlier `scrollIntoView()` on the `h1` also scrolled the clipped, sticky hero layers, which moved the frame contents out of bounds and left the page half-zoomed. In-page links now call `window.scrollTo()` with an absolute offset. The logo and "Back to top" use `#top` (offset 0). The hero, feature panels and cards use `overflow: clip`, so they cannot be scrolled programmatically. The favicon is `public/favicon.svg`: the same lens-around-plus geometry in teal `#1a8a81` on a transparent background.

Reduced motion keeps the inset rounded panel static and removes extra scrolling distance. On narrow screens keep navigation, wordmark and case action within the frame. Use native scroll, accessible controls and visible focus; never intercept browser Ctrl+F.

## Acceptance

Keep existing case/upload/search/quiz/chart/steps flows and overlay logic. Test actual browser layout at desktop and mobile widths, 200% zoom, keyboard-only navigation, reduced motion, missing video and the return-home path. Keep scrolling/resize listeners disposed across application rerenders. Run the build and relevant DOM tests, but explicitly distinguish them from visual browser checks. Apply [anti-slop criteria](ANTI_SLOP.md) to every new screen.
