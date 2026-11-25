// Inlines the shared rich-text code into the Figma plugin UI.
import fs from 'fs';
const rt = fs.readFileSync('src/richtext.cjs', 'utf8');
const ui = fs.readFileSync('figma-plugin/src/ui.template.html', 'utf8').replace('/*RICHTEXT*/', () => rt);
fs.writeFileSync('figma-plugin/ui.html', ui);
console.log('figma-plugin/ui.html written');
