export function accountStorage(user,kind='local'){
 const area=kind==='session'?window.sessionStorage:window.localStorage,prefix='yeyu:'+(user?.id||'local')+':';
 return {getItem:key=>area.getItem(prefix+key)??(user?.role==='owner'?area.getItem(key):null),setItem:(key,value)=>area.setItem(prefix+key,value),removeItem:key=>{area.removeItem(prefix+key);if(user?.role==='owner')area.removeItem(key);}};
}
