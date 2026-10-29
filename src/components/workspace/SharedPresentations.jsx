import React,{useState} from 'react';
import {Users} from 'lucide-react';
import {api} from '@/lib/api';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
export default function SharedPresentations(){
 const [open,setOpen]=useState(false),[items,setItems]=useState(null),[error,setError]=useState('');
 return <><Button variant="outline" onClick={async()=>{setOpen(true);setItems(null);setError('');try{setItems((await api('/api/collaboration/rooms')).items);}catch(e){setError(e.message);}}}><Users/>协作演示</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="collaboration-dialog"><DialogHeader><DialogTitle>协作演示</DialogTitle><DialogDescription>打开你创建或受邀加入的演示。</DialogDescription></DialogHeader>{error&&<p role="alert">{error}</p>}{!items&&!error&&<p role="status">正在加载…</p>}<div className="shared-presentations">{items?.map(item=><a href={'/slides/'+item.roomId} key={item.roomId}><img src={item.thumbnail} alt=""/><span><strong>{item.title}</strong><small>{item.pages} 页 · {item.role==='viewer'?'可查看':item.role==='editor'?'可编辑':'拥有者'}</small></span></a>)}</div>{items?.length===0&&<p>暂无协作演示。打开作品后可邀请协作者。</p>}</DialogContent></Dialog></>;
}
