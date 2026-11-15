// Can Practice start on the video that is open? Only for the exact uploaded demonstration asset
// an exercise was authored against: same size, same sampled content digest, same duration.
// Hosted cases, other uploads and videos without a known duration are refused with a reason.

const SAMPLE_BYTES = 256 * 1024;
export const FINGERPRINT_ALGORITHM = 'sha256-sampled-3x256KiB-v1';

// Byte ranges hashed for a file of `size` bytes: the start, the middle and the end.
export function sampleRanges(size) {
  if (size <= SAMPLE_BYTES * 3) return [[0, size]];
  const middle = Math.floor(size / 2) - SAMPLE_BYTES / 2;
  return [[0, SAMPLE_BYTES], [middle, middle + SAMPLE_BYTES], [size - SAMPLE_BYTES, size]];
}

const hex = buffer => [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('');

// Hash the sampled ranges of a Blob/File. Runs in the worker; also the fallback on the main thread.
export async function digestFile(file, subtle = globalThis.crypto?.subtle) {
  if (!subtle) throw new Error('This browser cannot compute a content digest.');
  const parts = await Promise.all(sampleRanges(file.size).map(([start, end]) => file.slice(start, end).arrayBuffer()));
  const joined = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) { joined.set(new Uint8Array(part), offset); offset += part.byteLength; }
  return { algorithm: FINGERPRINT_ALGORITHM, bytes: file.size, sample_sha256: hex(await subtle.digest('SHA-256', joined)) };
}

// Fingerprint off the main UI thread. Falls back to the main thread only when workers are missing.
export function fingerprintFile(file) {
  if (typeof Worker === 'undefined') return digestFile(file);
  return new Promise((resolve, reject) => {
    let worker;
    try { worker = new Worker(new URL('./fingerprint.worker.js', import.meta.url), { type: 'module' }); }
    catch { digestFile(file).then(resolve, reject); return; }
    worker.onmessage = event => { worker.terminate(); if (event.data?.error) reject(new Error(event.data.error)); else resolve(event.data); };
    worker.onerror = event => { worker.terminate(); event.preventDefault?.(); digestFile(file).then(resolve, reject); };
    worker.postMessage(file);
  });
}

// Decide whether `exercise` may start. `video` describes what is open:
// { localVideo, caseId, fingerprint (or null while computing), fingerprintError, duration, videoError }.
// Returns { ok: true } or { ok: false, reason, message }.
export function checkEligibility(exercise, video) {
  const bound = exercise.eligible_video;
  const refuse = (reason, message) => ({ ok: false, reason, message });
  if (!video.localVideo) {
    // The hosted demo case is the same asset, bound by its hosted asset id.
    if (!bound.hosted || video.assetId !== bound.asset_id) {
      return refuse('wrong_case', `Practice is built on the ${bound.case_id} video, because its stages are timed to that exact recording. Switch to ${bound.case_id} and ask me again.`);
    }
    if (video.videoError) return refuse('video_error', `The ${bound.case_id} video isn’t available here, so I can’t line the exercise up with it.`);
    return checkDuration(bound, video, refuse);
  }
  if (video.videoError) return refuse('video_error', 'I can’t play this upload, so I can’t line the exercise up with it. Try opening the file again.');
  if (video.fingerprintError) return refuse('fingerprint_error', `I couldn’t check whether this upload is the ${bound.case_id} demo, so I won’t start Practice on it.`);
  if (!video.fingerprint) return refuse('pending', 'I’m still checking this upload. Ask me again in a moment.');
  const print = video.fingerprint;
  if (print.algorithm !== bound.fingerprint.algorithm || print.bytes !== bound.fingerprint.bytes || print.sample_sha256 !== bound.fingerprint.sample_sha256) {
    return refuse('mismatch', `This upload isn’t the ${bound.case_id} demonstration video my exercise is built on, so its moments wouldn’t line up. Practice works only with that exact file for now.`);
  }
  return checkDuration(bound, video, refuse);
}

// The stage times are only meaningful if the player reports the bound duration.
function checkDuration(bound, video, refuse) {
  if (!(video.duration > 0) || !Number.isFinite(video.duration)) {
    return refuse('unknown_duration', 'I can’t read this video’s length yet, so I can’t line the stages up with it. Wait for it to load and ask again.');
  }
  if (Math.abs(video.duration - bound.duration_sec) > bound.duration_tolerance_sec) {
    return refuse('duration_mismatch', `This video’s length doesn’t match the ${bound.case_id} demo, so the stage moments would be off. I won’t start Practice on it.`);
  }
  return { ok: true };
}

export const matchesFingerprint = (exercise, fingerprint) => Boolean(fingerprint)
  && fingerprint.bytes === exercise.eligible_video.fingerprint.bytes
  && fingerprint.sample_sha256 === exercise.eligible_video.fingerprint.sample_sha256;
