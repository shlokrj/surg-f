// Lil Doc: the chat persona. Cheerful, a little funny, and explains things in plain words.
// Everything he says is written here, so the tone stays in one place.

// Original avatar drawing (inline SVG, no external asset). To use a licensed image
// instead, replace this with an <img> tag pointing at a file in frontend/public/.
export const avatar = `<svg class="doc-avatar" viewBox="0 0 64 64" role="img" aria-label="Lil Doc">
  <circle cx="32" cy="32" r="32" fill="#d9efe8"/>
  <path d="M12 64c0-12 9-19 20-19s20 7 20 19z" fill="#2f9c8a"/>
  <path d="M26 46l6 7 6-7" fill="none" stroke="#1f7566" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="32" cy="30" r="15" fill="#f6cfa9"/>
  <circle cx="17" cy="31" r="3" fill="#f6cfa9"/><circle cx="47" cy="31" r="3" fill="#f6cfa9"/>
  <path d="M16.5 27C15 15 22 8 32 8s17 7 15.500 19c-4-3-9.500-4.500-15.500-4.500S20.500 24 16.500 27z" fill="#2f9c8a"/>
  <path d="M17 26.500c4-3 9.500-4.500 15-4.500s11 1.500 15 4.500" fill="none" stroke="#1f7566" stroke-width="1.600" stroke-linecap="round"/>
  <path d="M23.500 30.500q2.500-3.500 5 0M35.500 30.500q2.500-3.500 5 0" fill="none" stroke="#2a2a2a" stroke-width="2" stroke-linecap="round"/>
  <path d="M19 34.500c4 1.500 8.500 2 13 2s9-.500 13-2v4.500c0 5-6 8-13 8s-13-3-13-8z" fill="#bfe3f0"/>
  <path d="M22 39h20M23.500 42.500h17" stroke="#93c7da" stroke-width="1.200" stroke-linecap="round"/>
  <path d="M19 35l-2.500-3M45 35l2.500-3" stroke="#93c7da" stroke-width="1.400" stroke-linecap="round"/>
</svg>`;

const formatTime = seconds => {
  const n = Math.floor(Number(seconds) || 0);
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
};

// One plain-language line per instrument label in the data.
const TOOL_NOTES = {
  clipper: 'That’s the tool that squeezes tiny clips onto the duct and artery to seal them, a bit like a stapler for plumbing.',
  scissors: 'Those are long, skinny scissors that snip the duct and artery once the clips are on.',
  grasper: 'Think long tweezers: it grabs the gallbladder and holds it out of the way.',
  hook: 'It’s a little L-shaped tip that uses heat to cut tissue free. Surgeons reach for it a lot.',
  bipolar: 'It’s a pair of tweezers that uses a pinch of electricity to seal small bleeders.',
  irrigator: 'It’s the rinse-and-vacuum wand: it washes the area and sucks the fluid away.',
};

// One plain-language line per step of the operation, keyed by the dataset's phase name.
export const STEP_NOTES = {
  Preparation: 'The ports go in and the camera has a look around.',
  CalotTriangleDissection: 'Tissue is cleared away to expose the duct and artery that feed the gallbladder.',
  ClippingCutting: 'The duct and artery are clipped shut, then cut.',
  GallbladderDissection: 'The gallbladder is peeled off the liver.',
  GallbladderPackaging: 'The gallbladder goes into a little retrieval bag.',
  CleaningCoagulation: 'The area is rinsed and any small bleeding is stopped.',
  GallbladderRetraction: 'The bagged gallbladder is pulled out of the body.',
};

export const greeting = caseId =>
  `Hi, I’m Lil Doc! I’ve watched all of ${caseId} so you don’t have to squint. Ask me when a tool shows up, or try /chart, /quiz, /model or /practice.`;

export const switched = caseId => `Now watching ${caseId}. Same operation, different patient. Ask away!`;

export const localVideoNote =
  'Nice video! I can play it, but I only know my way around the indexed demo cases, so I can’t search this one.';

export const errorReply = 'Oops, I couldn’t reach the backend. Is it running? Give it a nudge and ask me again.';

// --- Practice ------------------------------------------------------------------

export const localDemoRecognized = caseId =>
  `I recognise this file: it’s the ${caseId} demonstration video. I still can’t search it, but you can ask me to practice a step on it, like “Let me practice clipping and cutting.”`;

export const localOnlyPractice =
  'I can’t search an uploaded video. If it’s the demo video, you can ask me to practice a step, like “Let me practice clipping and cutting.”';

export const practiceOffer = exercise =>
  `Let’s practice ${exercise.title.toLowerCase()} on ${exercise.eligible_video.case_id}. You’ll get ${exercise.stages.length} stages: pick an instrument from a 3D tray, place it on the model and use it, then compare with the matching moment in the video. Before you start: the model is a generic body, not this patient, and this is a schematic draft exercise that hasn’t been medically reviewed. It doesn’t teach real instrument handling or measure skill. Starting closes the other panels; your video stays where it is.`;

export const practiceStarted = 'Practice is open. Stage 1 is on the left, and the video is at its reference moment. Exit (×) brings your normal page back.';

export const practiceCancelled = 'No problem, nothing changed. Ask me again whenever you want to practice.';

export const practiceNotAuthored = (stepLabel, available) =>
  `I don’t have a practice exercise for ${stepLabel} yet. Every exercise needs a reviewed set of steps first. Right now I can do ${available}. Ask me to practice that instead!`;

export const practiceBusy = 'While Practice is open I keep the other panels closed so the model has room. Exit practice (×) and ask me again, or ask me to practice a step to start over.';
const TOOLS = 'the grasper, hook, clipper, scissors, bipolar and irrigator';

// Build Lil Doc's reply to one request.
// `outcome` = { modes, labels, hits, caseId, genieText } where hits are clips in this video.
export function reply({ modes, labels, hits, caseId, genieText }) {
  if (genieText) return `Here’s what I dug up: ${genieText}`;
  const parts = [];
  if (modes.includes('timestamp')) {
    // "The scissors show up", "the hook and clipper show up", "the hook shows up".
    const plural = labels.length > 1 || labels[0] === 'scissors';
    if (!labels.length) {
      parts.push(`Happy to help! Which tool are you looking for? I know ${TOOLS}.`);
    } else if (!hits.length) {
      parts.push(`I looked through all of ${caseId} and the ${labels.join(' and ')} never ${plural ? 'make' : 'makes'} an appearance. Want to try another tool?`);
    } else {
      const predicted = hits.filter(hit => hit.source === 'prediction').length;
      const name = labels.join(' and ');
      const count = `${hits.length} time${hits.length === 1 ? '' : 's'}`;
      parts.push(`Found it! The ${name} ${plural ? 'show' : 'shows'} up ${count} in ${caseId}, first at ${formatTime(hits[0].start_sec)}.`);
      if (labels.length === 1 && TOOL_NOTES[labels[0]]) parts.push(TOOL_NOTES[labels[0]]);
      parts.push('I marked every one in yellow on the timeline. Tap one and I’ll take you there.');
      if (predicted) parts.push(`Heads up: ${predicted} of those are our model’s guesses, shown with a dashed outline.`);
    }
  }
  if (modes.includes('chart')) parts.push('One chart, coming right up! It counts what shows up in this video.');
  if (modes.includes('quiz')) parts.push('Pop quiz! Five questions about the operation. Take your time, I’m not grading on a curve.');
  if (modes.includes('model')) parts.push('Here’s the 3D model. Drag to look around, scroll to zoom, and tap an organ to see through it. It follows the video from step to step.');
  return parts.join(' ') || `Hmm, I’m not sure what to show for that. Try a tool name like clipper, or /chart, /quiz or /model.`;
}
