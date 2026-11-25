import fs from 'fs'; import * as cheerio from 'cheerio';
const f=process.argv[2]; const $=cheerio.load(fs.readFileSync(f,'utf8'));
$('#page section, article section').each((i,s)=>{
  const S=$(s); console.log('SECTION',i,S.attr('data-section-theme'),S.attr('class')?.slice(0,120), 'bg-img:',S.find('.section-background img').attr('data-src')||S.find('.section-background img').attr('src')||'');
  S.find('.fe-block').each((j,b)=>{const B=$(b); const def=B.find('[data-definition-name]').first().attr('data-definition-name')||'?';
    const txt=B.text().replace(/\s+/g,' ').trim().slice(0,80); const img=B.find('img').attr('data-src')||B.find('img').attr('src')||'';
    console.log('  ',B.attr('class').split(' ')[1],def.split('.').pop(),'|',txt,'|',img.slice(-60));});
});
