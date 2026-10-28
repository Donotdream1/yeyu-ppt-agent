import React from 'react';

export default function BrandMark({size=28,...props}){
 return <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}><rect x="1" y="1" width="30" height="30" rx="9" fill="currentColor"/><path d="M9 8.5h11.5A2.5 2.5 0 0 1 23 11v9a2.5 2.5 0 0 1-2.5 2.5H16L11 26v-3.5H9A2.5 2.5 0 0 1 6.5 20v-9A2.5 2.5 0 0 1 9 8.5Z" stroke="white" strokeWidth="1.6" strokeLinejoin="round"/><path d="M11 13h8m-8 4h5" stroke="white" strokeWidth="1.6" strokeLinecap="round"/></svg>;
}
