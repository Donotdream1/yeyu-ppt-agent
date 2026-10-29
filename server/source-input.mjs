export function normalizeSourceInput(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return value;
 if(value.inputMode!=='topic')return {...value,sourceProvenance:{kind:'user-document',verified:false}};
 const topic=typeof (value.topic??value.document)==='string'?(value.topic??value.document).trim():value.topic;
 return {...value,topic,sourceName:'主题初稿',sourceProvenance:{kind:'topic-draft',verified:false,requiresFactCheck:true,topic},document:`创作类型：主题初稿，属于待核实的建议方案。\n主题：${topic||''}\n当前仅有主题与用户需求，没有可核验的项目事实、业绩数据或实验结果。可以围绕主题组织背景问题、分析框架、实施建议、验证方法和后续工作；这些内容均须使用建议或计划表述。涉及具体单位、人名、日期、样本量、统计值、业绩及引用来源时，未提供的写待补充，不编造数字或假装已经验证。禁止将模板的示例数据当作用户数据。`};
}
