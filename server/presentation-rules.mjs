export const PRESENTATION_RULES_MARKER='<!-- design-quality:v1 -->';
// Browser drafts can contain an older generated rules tail. Keep the user's
// own prompt and replace only that reserved tail with the current shared rules.
export function mergePresentationRules(prompt,rules){
 const base=String(prompt||'').split(PRESENTATION_RULES_MARKER)[0].trim();
 return `${base}\n\n${PRESENTATION_RULES_MARKER}\n以下是后续所有PPT的默认质量规则；与此前模板、字号或目录规则冲突时，以本节及本次用户明确要求为准。示例名称、年份、月份不得固定套用于其他文档。\n\n${rules}`;
}
