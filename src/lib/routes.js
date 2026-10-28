const uuid=/^[a-f0-9-]{36}$/i;
const tabs={projects:'/projects',styles:'/styles',create:'/workspace',history:'/history',hermes:'/agents',library:'/library',templates:'/templates',settings:'/settings',rules:'/settings/rules',charts:'/settings/charts',skills:'/settings/skills'};
export function readWorkspaceLocation(location){
 const pathname=location.pathname||'/',settings=pathname.match(/^\/settings\/(account|model|users|presentation|skills|personalization|help|agents)\/?$/),q=new URLSearchParams((location.search||'').replace(/\\(?=&)/g,'')),deck=pathname.match(/^\/presentations\/([A-Za-z0-9_.-]{20,180})\/pages\/(\d+)\/?$/),job=pathname.match(/^\/jobs\/([a-f0-9-]{36})\/?$/i),tab=settings?'settings':Object.entries(tabs).find(([,p])=>p===pathname)?.[0]||q.get('tab')||'create',id=deck?.[1]||q.get('output'),jobId=job?.[1]||q.get('job');
 return {...(settings?{settingsSection:settings[1]}:{}),tab:Object.hasOwn(tabs,tab)?tab:'create',outputId:uuid.test(id||'')?id:null,publicId:deck&&!uuid.test(id)?id:null,jobId:uuid.test(jobId||'')?jobId:null,page:Math.max(0,(parseInt(deck?.[2]||q.get('page')||'1',10)||1)-1)};
}
export const presentationPath=(id,page=0)=>{if(!/^[A-Za-z0-9_.-]{20,180}$/.test(id))throw Error('无效的作品编号');return `/presentations/${id}/pages/${Math.max(1,Math.trunc(page)+1)}`;};
export const jobPath=id=>`/jobs/${id}`;
export const tabPath=tab=>tabs[tab]||tabs.create;
