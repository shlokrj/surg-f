# Surg+F design criteria

Owner: Shlok. Branch: `feat/shlok-frontend-v2`. Commit here only for this design round; do not push or merge elsewhere without instruction. Mihir owns spatial behavior. Keep homepage work in `home.js`/`home.css`; coordinate shared player markup and styles before changing them.

## Direction

The first homepage pass was rejected by Shlok: uppercase branding, a circular reticle, slogan copy and a contracting title did not match the reference. Do not restore those choices.

Use the supplied Hangar screenshots as the composition reference: a large rounded panel inset within a white page, a compact top navigation, centered primary content, and a product-preview edge entering from below. The panel expands toward the viewport edges as native scrolling advances. Shlok specifically requests lowercase `surg+f`, light teal lettering, a magnifying glass with a plus inside replacing the plain plus, and a dithered field made of small plus marks. No giant background circle or crosshair axes.

[Hangar](https://hangarplm.com/) supplies visual direction, not copy or assets to reuse. The supplied screenshots and a native Chrome screenshot were inspected. Live reference scroll verification was interrupted by a computer-use failure; exact animation parity is not claimed. The implemented motion follows Shlok's explicit description.

## Type and color

Use Olivia King's Inclusive Sans for headings, copy and controls, self-hosted through `@fontsource-variable/inclusive-sans` (OFL-1.1). Keep the font license in the dependency distribution. Use ordinary weight and size differences before adding a second family. System monospace is acceptable for timestamps/commands, not whole paragraphs. [Requested Figma reference](https://www.figma.com/resource-library/modern-fonts/#font-7-inclusive-sans), [designer's description](https://www.oliviaking.com/inclusivesans/feature).

Palette: white outer page, dark teal panel `#104d4c`, light teal wordmark `#bcebe1`, near-white secondary text `#def1ea`. Dither uses muted teal plus marks, with varied density and an open center behind the wordmark. These are brand choices, not a hospital standard. Keep interface text readable; decoration is not information.

## Homepage composition

1. The opening panel has a 10–22px white surround and rounded corners. Scrolling reduces the surround/corner radius while slightly enlarging the central content. Do not reverse this into a shrinking hero.
2. Lowercase `surg` + magnifier-plus icon + lowercase `f`. Retain an accessible `surg+f` name. No blinking cursor or oversized standalone plus.
3. Keep the opening copy to “Search surgical video.” and functional navigation. No eyebrow, shortcut explanation, tagline stack or “less X, more Y” slogan.
4. Dither consists of deterministic small plus strokes, rendered as decorative SVG. No canvas animation loop, random repositioning on each render or flashing effects.
5. Preserve real case entry, the filtered VID01 preview, annotation timestamp action and local playback limitation. The preview-edge strip links to the actual preview; it is not fake product data.

Reduced motion keeps the inset rounded panel static and removes extra scrolling distance. On narrow screens keep navigation, wordmark and case action within the frame. Use native scroll, accessible controls and visible focus; never intercept browser Ctrl+F.

## Acceptance

Keep existing case/upload/search/quiz/chart/steps flows and overlay logic. Test actual browser layout at desktop and mobile widths, 200% zoom, keyboard-only navigation, reduced motion, missing video and the return-home path. Keep scrolling/resize listeners disposed across application rerenders. Run the build and relevant DOM tests, but explicitly distinguish them from visual browser checks. Apply [anti-slop criteria](ANTI_SLOP.md) to every new screen.
