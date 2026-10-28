const fail=message=>new Error(message);
export function pageSelection(value,inspection){
 if(value===undefined||value===null)return null;
 if(!Array.isArray(value.shapeIds)||!value.shapeIds.length||value.shapeIds.length>20||value.shapeIds.some(id=>!Number.isInteger(id)||id<1))throw fail('请选择1–20个本页对象');
 if(value.fingerprint!==inspection.fingerprint)throw fail('页面版本已变化，请重新选择对象后发送');
 const ids=new Set(value.shapeIds);for(const id of ids)if(!inspection.shapes.some(s=>s.id===id))throw fail('所选对象不在当前页');
 let changed=true;while(changed){changed=false;for(const s of inspection.shapes)if(ids.has(s.parentId)&&!ids.has(s.id)){ids.add(s.id);changed=true;}}
 return {shapeIds:[...new Set(value.shapeIds)],allowedIds:ids,boxes:inspection.shapes.filter(s=>value.shapeIds.includes(s.id)).map(s=>s.box)};
}
export function enforcePageSelection(proposal,selection){
 if(!selection)return proposal;
 for(const op of proposal.operations){
  const id=op.shapeId||op.targetShapeId;
  if(id&&!selection.allowedIds.has(id))throw fail('修改超出所选对象范围，请清除选区后再修改整页');
  if(!id&&op.box&&!selection.boxes.some(b=>op.box.x>=b.x-.001&&op.box.y>=b.y-.001&&op.box.x+op.box.w<=b.x+b.w+.001&&op.box.y+op.box.h<=b.y+b.h+.001))throw fail('新增对象需位于选区内，请清除选区后再添加到页面其他位置');
 }
 return proposal;
}
export function placeSelectedPhotos(operations,placements,selection){
 const resolved=operations.map(op=>op.type==='image'&&placements.some(p=>p.assetId===op.assetId)?placements.find(p=>p.assetId===op.assetId):op);
 return enforcePageSelection({operations:resolved},selection).operations;
}
