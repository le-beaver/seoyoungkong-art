import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});
for (const slug of process.argv.slice(2)) { const p=await b.newPage(); await p.setViewport({width:1440,height:900});
 await p.goto('http://localhost:5302/'+slug,{waitUntil:'load'});
 await p.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=400){scrollTo(0,y);await new Promise(r=>setTimeout(r,120))}});
 await new Promise(r=>setTimeout(r,1500));
 console.log(slug, JSON.stringify(await p.evaluate(()=>[...document.images].filter(i=>!i.naturalWidth||i.getBoundingClientRect().height<5).map(i=>[i.getAttribute('src'),Math.round(i.getBoundingClientRect().height),i.closest('.fe-block').style.cssText.slice(0,40)]))));
 await p.close(); }
await b.close();
