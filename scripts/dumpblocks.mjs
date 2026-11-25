import fs from 'fs'; import * as cheerio from 'cheerio';
const seen=new Set();
for(const f of ['index.html','about-me.html','ad-work.html','art.html','fun-things-and-hobbies.html','art-1.html']){
 const $=cheerio.load(fs.readFileSync('../seoyoungkong-art-backup/site/www.seoyoungkong.art/'+f,'utf8'));
 $('section.page-section .fe-block').each((i,b)=>{const B=$(b);const def=(B.find('[data-definition-name]').first().attr('data-definition-name')||'').split('.').pop();
  if(seen.has(def))return; seen.add(def); B.find('style').remove();
  console.log('=====',f,def); console.log(B.html().replace(/\s*\n\s*/g,'\n').slice(0,2500));});
}
