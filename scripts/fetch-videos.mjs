// Saves each Squarespace-hosted video: full-quality archive (backup folder) + 720p web copy (public/video/<id>/video.mp4)
import fs from 'fs'; import { execFileSync } from 'child_process'; import ffmpeg from 'ffmpeg-static'; import sharp from 'sharp';
const site = JSON.parse(fs.readFileSync('content/site.json', 'utf8'));
const ids = [...new Set(site.pages.flatMap(p => p.sections.flatMap(s => s.blocks.filter(b => b.video?.kind === 'native').map(b => b.video.id))))];
const base = 'https://video.squarespace-cdn.com/content/v1/691bd12e71cefc45336d4cf8/';
const ARCH = '../seoyoungkong-art-backup/videos'; fs.mkdirSync(ARCH, { recursive: true });
for (const id of ids) {
  const arch = `${ARCH}/${id}.mp4`, webDir = `public/video/${id}`, web = `${webDir}/video.mp4`;
  fs.mkdirSync(webDir, { recursive: true });
  if (!fs.existsSync(arch)) {
    const master = await (await fetch(base + id + '/playlist.m3u8')).text();
    const urls = [...master.matchAll(/(https:[^"\s]+\.m3u8[^"\s]*)/g)].map(m => m[1]);
    const vids = urls.filter(u => /h264-(\d+):(\d+)/.test(u)).sort((a, b) => +b.match(/h264-(\d+)/)[1] - +a.match(/h264-(\d+)/)[1]);
    const aud = urls.find(u => /aac/.test(u));
    const args = ['-y', '-loglevel', 'error', '-i', vids[0], ...(aud ? ['-i', aud, '-map', '0:v', '-map', '1:a'] : []), '-c', 'copy', '-movflags', '+faststart', arch];
    execFileSync(ffmpeg, args, { stdio: 'inherit' });
  }
  if (!fs.existsSync(web)) {
    execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', arch, '-vf', "scale='min(1280,iw)':-2", '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '112k', '-movflags', '+faststart', web], { stdio: 'inherit' });
  }
  const poster = `${webDir}/poster.jpg`;
  if (!fs.existsSync(`${webDir}/poster.webp`)) {
    execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-ss', '0.5', '-i', web, '-frames:v', '1', poster]);
    await sharp(poster).webp({ quality: 75 }).toFile(`${webDir}/poster.webp`); fs.rmSync(poster);
  }
  console.log(id, (fs.statSync(arch).size / 1e6).toFixed(1) + 'MB archive', (fs.statSync(web).size / 1e6).toFixed(1) + 'MB web');
}
console.log('done');
