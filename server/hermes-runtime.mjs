// Runtime configuration must load before any caller captures source paths.
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';

export const HERMES_CORE_FILES=['hermes_bootstrap.py','run_agent.py','tools/registry.py','tools/skills_tool.py'];
export function hermesRuntimePaths({env=process.env,root=process.cwd()}={}){
 const configured=value=>typeof value==='string'&&value.trim()?value.trim():undefined;
 return {sourcePath:path.resolve(root,configured(env.HERMES_SOURCE_PATH)||'data/hermes-agent'),pythonPath:path.resolve(root,configured(env.HERMES_PYTHON)||'data/hermes-runtime/Scripts/python.exe')};
}
export async function inspectHermesRuntime(options){
 const paths=hermesRuntimePaths(options),fileExists=async p=>fs.stat(p).then(s=>s.isFile(),()=>false),[pythonExists,...sourceFiles]=await Promise.all([fileExists(paths.pythonPath),...HERMES_CORE_FILES.map(f=>fileExists(path.join(paths.sourcePath,f)))]),missingSourceFiles=HERMES_CORE_FILES.filter((_,i)=>!sourceFiles[i]);
 return {...paths,available:pythonExists&&!missingSourceFiles.length,pythonExists,missingSourceFiles};
}
export async function requireHermesRuntime(options){
 const runtime=await inspectHermesRuntime(options);
 if(runtime.missingSourceFiles.length)throw Object.assign(Error('Hermes 源码目录不完整，缺少 '+runtime.missingSourceFiles.join('、')+'。请检查 .env 的 HERMES_SOURCE_PATH 是否指向 Hermes 仓库根目录；修复后可从断点继续。'),{code:'HERMES_SOURCE_INCOMPLETE'});
 if(!runtime.pythonExists)throw Object.assign(Error('Hermes Python 运行环境不存在，请检查 HERMES_PYTHON 或运行 npm run setup:hermes；修复后可从断点继续。'),{code:'HERMES_PYTHON_UNAVAILABLE'});
 return runtime;
}
