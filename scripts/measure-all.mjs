import puppeteer from 'puppeteer-core';
const pages=[['index',''],['ad-work','ad-work'],['art','art'],['about-me','about-me'],['fun-things-and-hobbies','fun-things-and-hobbies'],['art-1','art-1'],['ads-1','ads-1']];
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});
const m=async(url,sel,w)=>{const p=await b.newPage();await p.setViewport({width:w,height:900});await p.goto(url,{waitUntil:'load',timeout:60000}).catch(()=>{});await new Promise(r=>setTimeout(r,1200));
 const r=await p.evaluate(s=>[...document.querySelectorAll(s)].filter(x=>!x.closest('footer')).map(x=>(x.querySelector('.fluid-engine,.fe')||x).offsetHeight),sel);await p.close();return r};
for(const w of [1440,390])for(const [o,n] of pages){const A=await m(`http://localhost:5301/www.seoyoungkong.art/${o}.html`,'section.page-section',w),B=await m(`http://localhost:5302/${n}`,'section.sec',w);
 const bad=A.map((a,i)=>Math.abs(a-(B[i]??0))>4?`#${i}:${a}vs${B[i]}`:null).filter(Boolean);console.log(w,o,A.length,B.length,bad.length?bad.join(' '):'OK');}
await b.close();
