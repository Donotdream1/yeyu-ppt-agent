import path from 'node:path';
import {createHash} from 'node:crypto';
import mammoth from 'mammoth';
export async function extractDocument(buffer,name){
  const ext=path.extname(name).toLowerCase();let text='';
  if(ext==='.docx'){const out=await mammoth.extractRawText({buffer});text=out.value;}
  else if(ext==='.pdf'){
    const {PDFParse}=await import('pdf-parse');const parser=new PDFParse({data:new Uint8Array(buffer)});
    try{const out=await parser.getText();text=out.text;}finally{await parser.destroy();}
  }else if(['.txt','.md'].includes(ext)){
    const utf8=new TextDecoder('utf-8',{fatal:false}).decode(buffer);
    text=utf8.includes('\uFFFD')?new TextDecoder('gb18030').decode(buffer):utf8;
  }else throw new Error('支持 .docx、.pdf、.txt、.md 文档');
  text=text.replace(/\u0000/g,'').trim();
  if(text.length<20)throw new Error('提取的文字不足 20 字。扫描版 PDF 需先进行 OCR，也可以直接粘贴文字');
  if(text.length>120000)throw new Error('文档超过 12 万字，请分段导入');
  return {name,text,characters:text.length,sha256:createHash('sha256').update(buffer).digest('hex')};
}
