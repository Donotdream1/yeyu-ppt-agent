import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
let files;try{files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);}catch{console.error('Run this check in the Git checkout after staging the intended public files.');process.exit(1);}
if(!files.length){console.error('No tracked files to inspect. Stage the public source files first.');process.exit(1);}
const issues=[],root=process.cwd(),forbidden=/^(?:data|node_modules|dist|test-output|playwright-report|agents\/vendor-skills)\/|(?:^|\/)\.env(?:\.|$)(?!(?:example)$)|\.(?:pem|key|docx|xlsx|pdf)$/i;
const patterns=[['API key',/\bsk-[A-Za-z0-9_-]{24,}\b/g],['GitHub token',/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,})\b/g],['Private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],['Private attachment path',/(?:\.codex[\\/]attachments|xwechat_files[\\/]|wxid_[A-Za-z0-9_]+)/g]];
for(const file of files){
 if(forbidden.test(file)||/\.pptx$/i.test(file)&&file!=='server/base.pptx')issues.push(file+': private/generated file must not be tracked');
 const full=path.resolve(root,file);if(!full.startsWith(root+path.sep))throw Error('Unexpected tracked path');const stat=await fs.lstat(full);if(stat.isSymbolicLink()){issues.push(file+': inspect symlinks manually before publication');continue;}if(stat.size>2*1024*1024)issues.push(file+': source asset exceeds 2 MB; review distribution rights');
 if(/\.(?:png|jpe?g|gif|webp|ico|pptx)$/i.test(file))continue;const text=await fs.readFile(full,'utf8');for(const [name,pattern]of patterns){pattern.lastIndex=0;const match=pattern.exec(text);if(match)issues.push(file+':'+(text.slice(0,match.index).split('\n').length)+': possible '+name+' (value not printed)');}
}
if(issues.length){console.error(issues.join('\n'));process.exitCode=1;}else console.log(`Publication check passed: ${files.length} tracked files; no forbidden data paths or recognized credential patterns. Manual review is still required.`);
