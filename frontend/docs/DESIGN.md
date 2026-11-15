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
2. `wordmark()` in `home.js` renders `surg`, a real `+` (at .66em, raised to the optical axis) with an `aria-hidden` lens SVG centered on it, then `f`. The text content is literally `surg+f`. The same mark is used in the hero, nav, footer, and dashboard topbar. No blinking cursor.
3. Keep the opening copy to “Search surgical video.” and functional navigation. No eyebrow, shortcut explanation, tagline stack or “less X, more Y” slogan.
4. `ditherPixels()` produces a deterministic 8×8 Bayer dither (3 px cells, `image-rendering: pixelated`) on an `aria-hidden` canvas. A hashed value-noise horizon gives the bottom ombre its terrain shape. It repaints only when the viewport size changes, with no animation loop, randomness, or flashing.
5. Preserve real case entry, the filtered VID01 preview, annotation timestamp action and local playback limitation. The preview-edge strip shows the real `clipper` → VID01 11:14 annotation and links to the actual preview; it is not fake product data.

Reduced motion keeps the inset rounded panel static and removes extra scrolling distance. On narrow screens keep navigation, wordmark and case action within the frame. Use native scroll, accessible controls and visible focus; never intercept browser Ctrl+F.

## Acceptance

Keep existing case/upload/search/quiz/chart/steps flows and overlay logic. Test actual browser layout at desktop and mobile widths, 200% zoom, keyboard-only navigation, reduced motion, missing video and the return-home path. Keep scrolling/resize listeners disposed across application rerenders. Run the build and relevant DOM tests, but explicitly distinguish them from visual browser checks. Apply [anti-slop criteria](ANTI_SLOP.md) to every new screen.
