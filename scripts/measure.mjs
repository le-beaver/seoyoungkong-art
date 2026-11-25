import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});
for (const [url,sel] of [[`http://localhost:5301/www.seoyoungkong.art/${process.argv[2]}.html`,'section.page-section'],[`http://localhost:5302/${process.argv[3]}`,'section.sec']]){
const p=await b.newPage();await p.setViewport({width:1440,height:900});await p.goto(url,{waitUntil:'load'});await new Promise(r=>setTimeout(r,1500));
console.log(url, JSON.stringify(await p.evaluate(s=>[...document.querySelectorAll(s)].map(x=>{const fe=x.querySelector('.fluid-engine,.fe');const cw=x.querySelector('.content-wrapper,.sec-in');const c=getComputedStyle(cw);return [x.offsetHeight,fe&&fe.offsetHeight,c.paddingTop,c.paddingBottom,getComputedStyle(fe).gridTemplateRows.split(' ').slice(0,3).join(' ')]}),sel)));}
await b.close();
