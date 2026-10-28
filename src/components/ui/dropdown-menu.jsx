import React from 'react';
import {DropdownMenu as Primitive} from 'radix-ui';
export const DropdownMenu=Primitive.Root;
export const DropdownMenuTrigger=Primitive.Trigger;
export const DropdownMenuSeparator=props=><Primitive.Separator className="account-menu-separator" {...props}/>;
export const DropdownMenuItem=({children,...props})=><Primitive.Item className="account-menu-item" {...props}>{children}</Primitive.Item>;
export const DropdownMenuContent=({children,...props})=><Primitive.Portal><Primitive.Content side="top" align="start" sideOffset={10} className="account-menu-content" {...props}>{children}</Primitive.Content></Primitive.Portal>;
