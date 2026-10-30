// Maintenance helper for the repository's synthetic blank presentation only.
import fs from 'node:fs/promises';
import JSZip from 'jszip';
const file=new URL('../server/base.pptx',import.meta.url),zip=await JSZip.loadAsync(await fs.readFile(file));
const part='docProps/core.xml',xml=await zip.file(part).async('string');
zip.file(part,xml.replace(/<dc:creator>[^<]*<\/dc:creator>/,'<dc:creator>Xuzhen contributors</dc:creator>').replace(/<cp:lastModifiedBy>[^<]*<\/cp:lastModifiedBy>/,'<cp:lastModifiedBy>Xuzhen contributors</cp:lastModifiedBy>'));
await fs.writeFile(file,await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
console.log('Synthetic base PPTX creator metadata sanitized; slide content and relationships unchanged.');
