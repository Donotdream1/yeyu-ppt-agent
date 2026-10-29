import React,{useState} from 'react';
import {post} from '@/lib/api';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {SelectField} from '@/components/ui/select-field';
export default function CloudSlidesExport({outputId}){
 const [provider,setProvider]=useState('google'),[token,setToken]=useState(''),[result,setResult]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <details className="cloud-slides-export"><summary>可选：发送到飞书 / Google Slides</summary><p>创建云端副本，转换后请检查字体和版式。访问令牌仅用于本次请求，不保存；需要目标服务的文件写入权限。</p><SelectField aria-label="云端演示平台" value={provider} onChange={e=>{setProvider(e.target.value);setResult(null);setToken('');}}><option value="google">Google Slides</option><option value="feishu">飞书 Slides</option><option value="lark">Lark Slides</option></SelectField><Input type="password" autoComplete="off" aria-label="云端访问令牌" value={token} onChange={e=>setToken(e.target.value)} placeholder="目标服务的 access token"/>{error&&<p role="alert">{error}</p>}{result?.ready&&<p role="status">云端副本已创建。{result.url&&<a href={result.url} target="_blank" rel="noreferrer">打开演示</a>}</p>}{result&&!result.ready&&<p role="status">正在转换。任务 {result.ticket}，可继续查询，不会重新上传。</p>}<Button variant="outline" disabled={busy||token.length<10||result?.ready} onClick={async()=>{setBusy(true);setError('');try{const value=await post('/api/slides-connectors/export',{provider,outputId,token,ticket:result?.ticket});setResult(value);if(value.ready)setToken('');}catch(e){setError(e.message);}finally{setBusy(false);}}}>{busy?'处理中…':result?.ticket?'查询导入结果':'发送当前版本的副本'}</Button></details>;
}
