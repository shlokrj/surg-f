import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {homePage,mountHome,plusDither} from '../src/home.js';
const markup=()=>homePage({videoUrl:'/videos/VID01.mp4',filterOn:true,filterButton:'<button>Content filter</button>',error:''});
test('homepage preserves real entry points and honest upload scope',()=>{
 const doc=new JSDOM(markup()).window.document;
 assert.equal(doc.querySelectorAll('h1').length,1);
 for(const id of ['sample','sample-event','open-sample','drop-zone','file-input'])assert.ok(doc.getElementById(id));
 assert.equal(doc.querySelector('#drop-zone').tagName,'BUTTON');
 assert.match(doc.querySelector('.local-section').textContent,/local playback/);
 assert.ok(doc.querySelector('.surgical-media.filtered'));
 assert.equal(doc.querySelector('video').hasAttribute('autoplay'),false);
});
test('scroll progress clamps, honors reduced motion, and cleans up listeners',()=>{
 const dom=new JSDOM(markup());globalThis.window=dom.window;
 let reduced=false;let handler;let removed=false;
 window.matchMedia=()=>({get matches(){return reduced;},addEventListener:(_,f)=>handler=f,removeEventListener:()=>removed=true});
 let queued;globalThis.requestAnimationFrame=f=>{queued=f;return 1;};globalThis.cancelAnimationFrame=()=>{queued=null;};
 const root=window.document.querySelector('.landing'),intro=root.querySelector('.landing-intro');
 Object.defineProperty(intro,'offsetHeight',{value:2000});intro.getBoundingClientRect=()=>({top:-9999});
 const dispose=mountHome(root);assert.equal(root.style.getPropertyValue('--journey'),'1.0000');
 reduced=true;handler();queued();assert.equal(root.style.getPropertyValue('--journey'),'0.0000');
 root.querySelector('video').dispatchEvent(new window.Event('error'));assert.equal(root.querySelector('.preview-unavailable').hidden,false);
 dispose();assert.ok(removed);assert.equal(queued,null);
});

test('revised branding uses magnifier-plus and stable decorative dither',()=>{
 const doc=new JSDOM(markup()).window.document;
 const title=doc.querySelector('h1');
 assert.equal(title.getAttribute('aria-label'),'surg+f');
 assert.equal(title.textContent,'surgf');
 assert.ok(title.querySelector('svg circle'));
 assert.equal(doc.querySelector('.plus-dither').getAttribute('aria-hidden'),'true');
 assert.ok(doc.querySelectorAll('.plus-dither path').length>100);
 assert.equal(plusDither(),plusDither());
 assert.equal(doc.querySelector('.field-ring'),null);
 assert.doesNotMatch(doc.body.textContent,/Less scrubbing|More finding|familiar shortcut/);
});
