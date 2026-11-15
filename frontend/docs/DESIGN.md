# Surg+F design criteria

Owner: Shlok. Branch: `feat/shlok-frontend-v2`. Commit here only for this design round; do not push or merge elsewhere without instruction. Mihir owns spatial behavior. Keep homepage work in `home.js`/`home.css`; coordinate shared player markup and styles before changing them.

## Direction

A quiet surgical workspace with a memorable first screen. Center Surg+F, make the plus visible, and relate it to the familiar find shortcut. [Hangar](https://hangarplm.com/) is the user's reference for minimal, technical, scroll-led presentation. Borrow the direction rather than its copy, assets or claims. The reference content was accessible; live animation/screenshot inspection was blocked by the browser tool, so exact visual fidelity is not claimed.

## Type and color

Use Olivia King's Inclusive Sans for headings, copy and controls, self-hosted through `@fontsource-variable/inclusive-sans` (OFL-1.1). Keep the font license in the dependency distribution. Use ordinary weight and size differences before adding a second family. System monospace is acceptable for timestamps/commands, not whole paragraphs. [Requested Figma reference](https://www.figma.com/resource-library/modern-fonts/#font-7-inclusive-sans), [designer's description](https://www.oliviaking.com/inclusivesans/feature).

Palette: warm surgical white `#edf1eb`, deep scrub green `#123e36`, secondary green `#408774`, muted green-gray rules. The dark case-preview section uses light text. These are visual associations, not a claimed hospital standard. Reserve warning colors for actual warnings; avoid blood-red decoration. Check text contrast in its actual context, including focus and disabled states.

## Homepage composition

1. A centered oversized Surg+F wordmark, one literal description and an immediate “Open a case” action. No scrolling required to enter the app.
2. Native scrolling gently contracts the title and moves the fine reference geometry. No intercepted wheel events or pinned scrolling library. Reduced-motion preference removes the effect and extra scroll distance.
3. One real case preview with the existing content filter, a dataset-labeled clipper match at 11:14 and a working jump action. No autoplay surgical imagery. Missing video has a visible fallback.
4. A simple local-video entry with the playback-only limitation nearby. Avoid a second sales pitch.

Use fluid type, full-width sections, restrained rules and very few rounded containers. On narrow screens, stack the preview and copy and remove secondary decorative details. Keep controls reachable by keyboard with visible focus. Do not hide content pending an animation.

## Acceptance

Keep existing case/upload/search/quiz/chart/steps flows and overlay logic. Test actual browser layout at desktop and mobile widths, 200% zoom, keyboard-only navigation, reduced motion, missing video and the return-home path. Keep scrolling/resize listeners disposed across application rerenders. Run the build and relevant DOM tests, but explicitly distinguish them from visual browser checks. Apply [anti-slop criteria](ANTI_SLOP.md) to every new screen.
