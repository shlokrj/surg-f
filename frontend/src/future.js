/* "What's next": future agents for the demo version. Lil Doc (lildoc.js) teaches today; four concept
   agents would read the same Surg+F index for people beyond the classroom. Not built yet, and the page
   says so. Avatars are original inline drawings in Lil Doc's style (round badge, flat colors, closed
   happy eyes). A pinned stage (architecture.js): each chapter reveals one mystery agent. */
import { avatar as lilDoc } from './lildoc.js';
import { onStage } from './architecture.js';

const face = (skin, extra = '') => `<circle cx="17" cy="31" r="3" fill="${skin}"/><circle cx="47" cy="31" r="3" fill="${skin}"/><circle cx="32" cy="30" r="15" fill="${skin}"/>${extra}`;
const eyes = '<path d="M23.5 30.5q2.5-3.5 5 0M35.5 30.5q2.5-3.5 5 0" fill="none" stroke="#2a2a2a" stroke-width="2" stroke-linecap="round"/>';
const smile = '<path d="M27 37.5q5 4.5 10 0" fill="none" stroke="#2a2a2a" stroke-width="1.8" stroke-linecap="round"/>';
const svg = (name, body) => `<svg class="agent-svg" viewBox="0 0 64 64" aria-hidden="true" data-name="${name}">${body}</svg>`;

const AGENTS = [
  {
    id: 'counsel', name: 'Lil Counsel', role: 'Legal review',
    title: 'Lil Counsel, for when something goes wrong.',
    body: 'If a complication leads to a review, Lil Counsel builds a second-by-second record straight from the video: which step, which instrument, and when.',
    says: '14:20, scissors cut the cystic duct. It’s on the record.',
    art: svg('counsel', `<circle cx="32" cy="32" r="32" fill="#e2e6f3"/>
      <path d="M12 64c0-12 9-19 20-19s20 7 20 19z" fill="#2b3a55"/><path d="M26 45l6 11 6-11z" fill="#fff"/><path d="M32 47.5l-2.2 3 2.2 9 2.2-9z" fill="#c0392b"/>
      ${face('#e0a97e')}<path d="M17 28c-1.5-11 5.5-19 15-19s16.5 7 15 17c-5-5-12-6.5-19-4.5-4.5 1.3-8 3.5-11 6.500z" fill="#3b2a20"/>
      <circle cx="26" cy="31" r="4.6" fill="#ffffff55" stroke="#2a2a2a" stroke-width="1.5"/><circle cx="38" cy="31" r="4.6" fill="#ffffff55" stroke="#2a2a2a" stroke-width="1.5"/><path d="M30.6 31h2.8" stroke="#2a2a2a" stroke-width="1.5"/>
      ${eyes}${smile}`),
  },
  {
    id: 'ledger', name: 'Lil Ledger', role: 'Billing and planning',
    title: 'Lil Ledger, for the people who plan and pay.',
    body: 'Lil Ledger turns step lengths and instrument time into the numbers that billing and operating-room planning run on.',
    says: 'Clipping and cutting in VID01: 3 min 34 s. I’ll do the math.',
    art: svg('ledger', `<circle cx="32" cy="32" r="32" fill="#f3ecd6"/>
      <path d="M12 64c0-12 9-19 20-19s20 7 20 19z" fill="#c99c14"/><path d="M25 46q7 6 14 0" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/><circle cx="42" cy="56" r="4" fill="#f4c93a" stroke="#a37c0c" stroke-width="1.2"/>
      ${face('#c68642')}<path d="M17 26c0-9.500 6.500-16 15-16s15 6.500 15 16z" fill="#4a2e18"/>
      <path d="M14 25.500h36q-2 6-9 6H23q-7 0-9-6z" fill="#2f9c8a" opacity=".92"/>
      ${eyes}${smile}`),
  },
  {
    id: 'watch', name: 'Lil Watch', role: 'Quality and safety',
    title: 'Lil Watch, for quality and safety.',
    body: 'Lil Watch reads many operations at once and flags moments that look unusual, so a review team knows exactly where to look.',
    says: 'I watch every case, so nobody has to scrub through them all.',
    art: svg('watch', `<circle cx="32" cy="32" r="32" fill="#ebe6f7"/>
      <path d="M12 64c0-12 9-19 20-19s20 7 20 19z" fill="#5844bb"/>
      <circle cx="32" cy="10" r="5.500" fill="#2a1d14"/>${face('#8d5524')}<path d="M17 27c-.5-10 6-16 15-16s15.500 6 15 16c-4-4.500-9.500-6-15-6s-11 1.500-15 6z" fill="#2a1d14"/>
      <path d="M15.500 31a16.500 16.500 0 0 1 33 0" fill="none" stroke="#2a2a2a" stroke-width="2.4"/><rect x="12" y="28" width="6" height="9" rx="3" fill="#2a2a2a"/><rect x="46" y="28" width="6" height="9" rx="3" fill="#2a2a2a"/><path d="M15 36.500q2 6 10 5.500" fill="none" stroke="#2a2a2a" stroke-width="1.800" stroke-linecap="round"/>
      ${eyes.replace(/#2a2a2a/g, '#140c06')}${smile.replace(/#2a2a2a/g, '#140c06')}`),
  },
  {
    id: 'pal', name: 'Lil Pal', role: 'Patients',
    title: 'Lil Pal, for the patient.',
    body: 'Lil Pal walks a patient through their own operation in plain words, the way Lil Doc does for students.',
    says: 'Want to see what happened during your operation? I’ll keep it simple.',
    art: svg('pal', `<circle cx="32" cy="32" r="32" fill="#fde9e3"/>
      <path d="M12 64c0-12 9-19 20-19s20 7 20 19z" fill="#e07a5f"/><path d="M28 46v8M36 46v8" stroke="#fff" stroke-width="1.800" stroke-linecap="round"/>
      ${face('#f6cfa9')}<circle cx="22.500" cy="36" r="2.500" fill="#f4a2a2" opacity=".7"/><circle cx="41.500" cy="36" r="2.500" fill="#f4a2a2" opacity=".7"/>
      <path d="M16 27c0-11 7-18 16-18s16 7 16 18z" fill="#e07a5f"/><rect x="15" y="23.500" width="34" height="6" rx="3" fill="#c4583e"/><circle cx="32" cy="8" r="4.500" fill="#f4c93a"/>
      ${eyes}<path d="M26.500 37q5.500 6 11 0" fill="#fff" stroke="#2a2a2a" stroke-width="1.600" stroke-linejoin="round"/>`),
  },
];

/* The scene: Lil Doc up top, the four agents in a row, one speech bubble per agent. Every agent's state
   (--r reveal, --em spotlight, --say bubble) is set from the scroll, so on desktop one card stays in place
   and the agents reveal one after another without the scene restarting. On phones each chapter shows
   its own copy of the scene, revealing that chapter's agent. */
const scene = () => `<div class="sc fu-scene">
  <div class="fu-doc"><span class="fu-badge">${lilDoc}</span><b>Lil Doc</b><small>Teaching, today</small></div>
  <svg class="fu-links" viewBox="0 0 560 540" aria-hidden="true">${[76, 212, 348, 484].map((x, j) => `<path data-j="${j}" pathLength="1" d="M280 210C280 236 ${x} 224 ${x} 248"/>`).join('')}</svg>
  <div class="fu-row">${AGENTS.map((a, j) => `<div class="fu-agent" data-j="${j}">
    <span class="fu-badge">${a.art}<i class="fu-q" aria-hidden="true">?</i></span>
    <b><span class="real">${a.name}</span><span class="mystery">???</span></b><small>${a.role}</small></div>`).join('')}</div>
  ${AGENTS.map((a, j) => `<div class="fu-say" data-j="${j}"><span class="fu-mini">${a.art}</span><p>${a.says}</p></div>`).join('')}</div>`;

export function futureSection({per = 2} = {}) {
  return `<section class="dig dig-model dig-future" id="future" aria-labelledby="future-heading" data-intro="0" data-per="${per}" style="--travel:${4 * per};--nav:1">
    <div class="dig-pin">
      <div class="mn-heading"><h2 id="future-heading">What’s next.</h2><p>Lil Doc teaches. Next, a team of agents that read the same index for everyone else around an operation.</p></div>
      <div class="dig-map"><ol class="dig-labels" aria-label="Future agents">${AGENTS.map((a, i) => `<li><button type="button" data-dig="${i}"><span>${i + 1}</span>${a.name}</button></li>`).join('')}</ol></div>
      ${AGENTS.map((a, i) => `<div class="layer" id="future-${a.id}" data-layer="${i}" style="--p:0;--s:1">
        <div class="dig-copy layer-copy"><h3>${a.title}</h3><p>${a.body}</p></div>
        <div class="pit" style="--k:${i}" role="img" aria-label="${a.name}, a planned agent, revealed beside Lil Doc"><canvas class="sky-dither" data-horizon=".72" data-ceiling="4.6" aria-hidden="true"></canvas><div class="fit">${scene()}</div><p class="v-cap">Concept agents, not built yet. Each would read the same Surg+F index as Lil Doc.</p></div>
      </div>`).join('')}
    </div>
  </section>`;
}

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const reveal = p => clamp((p - .1) / .42);
const speak = p => clamp((p - .56) / .2);
onStage((section, ps, reduced, {d, stacked}) => {
  if (section.id !== 'future') return;
  section.querySelectorAll('.layer').forEach((layer, k) => {
    layer.querySelectorAll('[data-j]').forEach(el => {
      const j = Number(el.dataset.j);
      let r, em, say;
      if (stacked) { r = j < k ? 1 : j === k ? reveal(ps[k]) : 0; em = j === k ? r : 0; say = j === k ? speak(ps[k]) : 0; }
      else { r = reveal(ps[j]); const near = clamp(1 - Math.abs(j - d) * 2); em = r * near; say = speak(ps[j]) * clamp(1 - Math.abs(j - d) * 2.5); }
      el.style.setProperty('--r', r.toFixed(3));
      el.style.setProperty('--em', em.toFixed(3));
      el.style.setProperty('--say', say.toFixed(3));
    });
  });
});
