import puppeteer from 'puppeteer-core';
const pages=['index.html','about-me.html','ad-work.html','art.html','fun-things-and-hobbies.html','art-1.html','ads-1.html'];
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});
const typo={},themes={},btn={};
for(const w of [1440,390]) for(const pg of pages){
 const p=await b.newPage(); await p.setViewport({width:w,height:900});
 await p.goto('http://localhost:5301/www.seoyoungkong.art/'+pg,{waitUntil:'networkidle2',timeout:60000}).catch(()=>{});
 const r=await p.evaluate(()=>{const g=(e,k)=>getComputedStyle(e)[k];const T={},TH={},B={};
  document.querySelectorAll('section.page-section').forEach(s=>{const th=s.dataset.sectionTheme;
   const h=s.querySelector('h1,h2,h3,h4'),pp=s.querySelector('.sqs-html-content p'),a=s.querySelector('.sqs-html-content a');
   TH[th]={bg:g(s.querySelector('.section-background'),'backgroundColor'),h:h&&g(h,'color'),p:pp&&g(pp,'color'),a:a&&g(a,'color')};
   s.querySelectorAll('.sqs-html-content h1,.sqs-html-content h2,.sqs-html-content h3,.sqs-html-content h4,.sqs-html-content p').forEach(e=>{
    if(e.closest('.sqsrte-scaled-text-container'))return;
    const k=e.tagName+'.'+[...e.classList].filter(c=>c.startsWith('sqsrte')).join('.');
    T[k]=['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','textTransform'].map(x=>g(e,x)).join(' | ');});
   s.querySelectorAll('.sqs-block-button-element').forEach(e=>{B[[...e.classList].join('.')+'@'+th]=['backgroundColor','color','borderTop','borderRadius','fontSize','fontFamily','fontWeight','paddingTop','paddingLeft','height','letterSpacing','textTransform'].map(x=>g(e,x)).join(' | ')});
  });return {T,TH,B};});
 for(const k in r.T){(typo[k]??={})[w]=r.T[k]} Object.assign(themes,r.TH); Object.assign(btn,r.B); await p.close();}
console.log(JSON.stringify({typo,themes,btn},null,1)); await b.close();
