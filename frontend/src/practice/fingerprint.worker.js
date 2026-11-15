// Computes the sampled content digest of an uploaded video off the main thread.
import { digestFile } from './eligibility.js';

self.onmessage = async event => {
  try { self.postMessage(await digestFile(event.data)); }
  catch (error) { self.postMessage({ error: error?.message ?? 'Fingerprint failed' }); }
};
