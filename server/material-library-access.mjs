const grants=new Map(),ttl=24*60*60*1000;
export const canViewMaterialLibrary=user=>user?.role==='owner';
export function grantMaterialPreviews(user,items){
 if(!user?.id||canViewMaterialLibrary(user))return;const paths=grants.get(user.id)||new Map(),expires=Date.now()+ttl;
 for(const c of items||[]){if(c.id)paths.set('/components/'+encodeURIComponent(c.id)+'/preview',expires);if(/^[a-f0-9]{16}$/i.test(c.sourceId||'')&&Number.isInteger(c.page))paths.set('/previews/'+c.sourceId+'/'+c.page+'.png',expires);}
 for(const [p,time]of paths)if(time<Date.now())paths.delete(p);while(paths.size>600)paths.delete(paths.keys().next().value);grants.set(user.id,paths);
}
export function grantSourcePreviews(user,templates){
 if(!user?.id||canViewMaterialLibrary(user))return;const paths=grants.get(user.id)||new Map();for(const t of templates||[])for(const p of t.pages||[]){const value=p.thumbnail?.split('?')[0];if(value?.startsWith('/api/previews/'))paths.set(value.slice(4),Date.now()+ttl);}while(paths.size>600)paths.delete(paths.keys().next().value);grants.set(user.id,paths);
}
export function hasMaterialPreview(user,path){const until=grants.get(user?.id)?.get(path);return Boolean(until&&until>Date.now());}
export function isMaterialLibraryRequest(path){return /^\/(?:library|material-pages|material-audits|material-preferences|components)(?:\/|$)/.test(path);}
export function materialLibraryForbidden(user,path,method='GET'){
 if(canViewMaterialLibrary(user))return false;
 if(/^\/components\/[^/]+\/preview$/.test(path)&&method==='GET')return !hasMaterialPreview(user,path);
 if(/^\/previews\/[a-f0-9]{16}\//i.test(path)&&method==='GET')return !hasMaterialPreview(user,path);
 return isMaterialLibraryRequest(path);
}
