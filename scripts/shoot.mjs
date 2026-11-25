// node scripts/shoot.mjs <outdir> [width] [pages...]  -> full-page screenshots of local dist
import puppeteer from 'puppeteer-core'; import fs from 'fs';
const [out, w='1440', ...pages] = process.argv.slice(2); fs.mkdirSync(out,{recursive:true});
const list = pages.length ? pages : ['homepage:', 'about-me:about-me', 'ad-work:ad-work', 'art:art', 'fun-things-and-hobbies:fun-things-and-hobbies'];
const b = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});
for (const item of list) { const [name, slug] = item.split(':');
  const p = await b.newPage(); await p.setViewport({width:+w,height:900});
  await p.goto(`http://localhost:5302/${slug}`,{waitUntil:'load',timeout:60000}).catch(()=>{});
  await p.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=700){scrollTo(0,y);await new Promise(r=>setTimeout(r,60))}scrollTo(0,0)});
  await new Promise(r=>setTimeout(r,800));
  await p.screenshot({path:`${out}/${name}.png`,fullPage:true}); await p.close(); }
await b.close();
