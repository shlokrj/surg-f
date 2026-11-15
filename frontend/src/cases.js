// Put hosted case assets in public/videos/ or set VITE_VIDEO_BASE_URL to their host.
const videoBase = (import.meta.env?.VITE_VIDEO_BASE_URL ?? '/videos').replace(/\/$/, '');
const knownCases = { VID01: 'VID01.mp4', VID02: 'VID02.mp4' };

export function videoForCase(caseId) {
  const file = knownCases[caseId];
  return file ? `${videoBase}/${file}` : null;
}

// Binding for the hosted, unmodified Cholec80 25 fps assets.
export function videoAssetForCase(caseId) {
  return knownCases[caseId] ? `${caseId}-cholec80-25fps-v1` : null;
}
