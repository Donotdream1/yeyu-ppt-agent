import React from 'react';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem,SelectGroup,SelectLabel} from './select';
const empty='__yeyu_empty_value__';
// Native-like props let all application modules share the same shadcn control.
export function SelectField({children,value,defaultValue,onChange,onValueChange,className='',placeholder,disabled,id,...props}){
 const options=React.Children.toArray(children).filter(React.isValidElement);
 const items=nodes=>React.Children.toArray(nodes).filter(React.isValidElement).map((node,i)=>{
  if(node.type==='optgroup')return <SelectGroup key={i}><SelectLabel>{node.props.label}</SelectLabel>{items(node.props.children)}</SelectGroup>;
  if(node.type!=='option')return null;const v=String(node.props.value??node.props.children??'');return <SelectItem key={v} data-value={v} value={v||empty} disabled={node.props.disabled}>{node.props.children}</SelectItem>;
 });
 const selected=value??defaultValue??options.find(n=>n.type==='option')?.props.value??'';
 return <Select value={String(selected)||empty} disabled={disabled} onValueChange={v=>{const next=v===empty?'':v;onValueChange?.(next);onChange?.({target:{value:next},currentTarget:{value:next}});}}><SelectTrigger id={id} className={'app-select-field '+className} {...props}><SelectValue placeholder={placeholder}/></SelectTrigger><SelectContent position="popper" className="app-select-menu">{items(children)}</SelectContent></Select>;
}
