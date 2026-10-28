import React from 'react';
const names={planning:'规划',materials:'素材预检','visual-selection':'视觉选版',writing:'文案填充',review:'审校',export:'检查与导出'};
const seconds=ms=>`${(Math.max(0,Number(ms)||0)/1000).toFixed(1)} 秒`;
export default function RunMetrics({summary}){
 if(!summary)return null;
 return <details className="panel run-metrics"><summary>制作耗时 {seconds(summary.activeElapsedMs)} · {summary.modelRequests} 次模型请求</summary><p>{summary.historyComplete?'已累计本任务各轮有效运行时间，不含等待恢复的空闲时间。':'包含本轮及断点已记录的运行时间，早期任务的完整耗时不可追溯。'}</p><div className="run-metric-stages">{Object.entries(summary.stageMs||{}).filter(([key,ms])=>names[key]&&ms>0).map(([key,ms])=><span key={key}><b>{names[key]}</b>{seconds(ms)}</span>)}</div><p>输入 {Number(summary.inputTokens||0).toLocaleString()} tokens · 输出 {Number(summary.outputTokens||0).toLocaleString()} tokens · 工具校验失败 {summary.toolFailures||0} 次</p></details>;
}
