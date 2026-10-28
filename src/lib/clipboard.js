export async function copyText(text){
 if(navigator.clipboard?.writeText){try{await navigator.clipboard.writeText(text);return;}catch{}}
 const input=document.createElement('textarea');input.value=text;input.setAttribute('readonly','');input.style.cssText='position:fixed;left:-9999px;top:0';document.body.appendChild(input);input.select();let ok;try{ok=document.execCommand('copy');}finally{input.remove();}if(!ok)throw Error('复制失败，请手动选中路径后复制');
}
