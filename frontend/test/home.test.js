import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {homePage,mountHome,ditherCells,wordmark} from '../src/home.js';
const showcase={steps:{steps:[{order:1,key:'Preparation',label:'Preparation',start_sec:0,end_sec:21},{order:3,key:'ClippingCutting',label:'Clipping and cutting',start_sec:673,end_sec:887}]},timeline:{summary:[{label:'clipper',count:5,total_sec:102,first_sec:674}]},quiz:{reviewed:false,questions:[{prompt:'Next step?',options:[{id:'a',text:'One'},{id:'d',text:'Clip'}],correct_option_id:'d'}]}};
const markup=()=>homePage({videoUrl:'/videos/VID01.mp4',filterOn:true,filterButton:'<button>Content filter</button>',error:'',showcase});
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

test('wordmark keeps the real plus with the lens around it, and the plus dither is deterministic',()=>{
 const doc=new JSDOM(markup()).window.document;
 const title=doc.querySelector('h1');
 assert.equal(title.textContent,'surg+f');
 assert.equal(title.querySelector('.sf-plus').textContent,'+');
 assert.equal(title.querySelector('.sf-lens').getAttribute('aria-hidden'),'true');
 assert.ok(title.querySelector('.sf-lens circle'));
 assert.equal(doc.querySelector('.small-brand .sf-mark').outerHTML,title.querySelector('.sf-mark').outerHTML,'nav and hero marks are identical');
 assert.ok([...doc.querySelectorAll('.sky-dither')].every(c=>c.getAttribute('aria-hidden')==='true'));
 const a=ditherCells(64,40),b=ditherCells(64,40);
 assert.deepEqual(a,b);
 const row=y=>{let t=0;for(let x=0;x<64;x++){const i=(y*64+x)*3;t+=a.bg[i]+a.bg[i+1]+a.bg[i+2];}return t;};
 assert.ok(row(39)>row(0),'bottom rows are lighter than the top');
 assert.ok(a.mark.some((v,i)=>i%4===3&&v===255),'some cells carry a plus mark');
 assert.doesNotMatch(doc.body.textContent,/Less scrubbing|More finding|familiar shortcut/);
});
test('feature sections show fixture data and open the demo with a real command',()=>{
 const doc=new JSDOM(markup()).window.document;
 assert.equal(doc.querySelectorAll('.feature').length,3);
 assert.match(doc.querySelector('#feature-steps').closest('section').textContent,/Clipping and cutting/);
 assert.match(doc.querySelector('#feature-chart').closest('section').textContent,/1:42/);
 assert.match(doc.querySelector('#feature-quiz').closest('section').textContent,/Not yet clinically reviewed/);
 assert.deepEqual([...doc.querySelectorAll('[data-open-sample]')].map(b=>b.dataset.command??''),['','/chart instruments','/quiz']);
 assert.ok(doc.querySelector('.hero-search'),'hero search sits inside the frame');
});
test('logo and back-to-top scroll only the window, never the clipped hero layers',()=>{
 const dom=new JSDOM(markup());globalThis.window=dom.window;globalThis.document=dom.window.document;
 window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
 globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 const root=document.querySelector('.landing');
 assert.equal(root.querySelector('.small-brand').getAttribute('href'),'#top');
 assert.match(root.querySelector('.hero-search').textContent,/When is the cystic duct clipped\?/);
 const calls=[];window.scrollTo=o=>calls.push(o);
 let intoView=0;window.HTMLElement.prototype.scrollIntoView=()=>intoView++;
 const dispose=mountHome(root);
 root.querySelector('.small-brand').dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true}));
 assert.deepEqual(calls.at(-1),{top:0,behavior:'smooth'});
 assert.equal(intoView,0);
 assert.equal(window.location.hash,'');
 dispose();
});
