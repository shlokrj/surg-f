// Put hosted case assets in public/videos/ or set VITE_VIDEO_BASE_URL to their host.
const videoBase = (import.meta.env.VITE_VIDEO_BASE_URL ?? '/videos').replace(/\/$/, '');
const knownCases = { VID01: 'VID01.mp4', VID02: 'VID02.mp4' };

export function videoForCase(caseId) {
  const file = knownCases[caseId];
  return file ? `${videoBase}/${file}` : null;
}
