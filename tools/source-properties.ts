/** Locate source edits without evaluating Contract expressions. All offsets are
 * checked against the source digest again before the compiler validates Apply. */
export type SourceAddress={line:number;col:number;property:string};
function offset(source:string,line:number,col:number){
  const lines=source.split('\n'),text=lines[line-1];
  if(text===undefined||!Number.isSafeInteger(col)||col<1)return null;
  const prefix=Buffer.from(text).subarray(0,col-1).toString('utf8');
  if(Buffer.byteLength(prefix)!==col-1)return null;
  return lines.slice(0,line-1).reduce((n,l)=>n+l.length+1,0)+prefix.length;
}
/** One balanced Contract value (quoted literal, template, name, or expression). */
export function valueEnd(source:string,start:number){
  let quote='',escaped=false;const stack:string[]=[];
  for(let i=start;i<source.length;i++){
    const c=source[i];
    if(quote){if(escaped){escaped=false;continue;}if(c==='\\'){escaped=true;continue;}if(c===quote)quote='';continue;}
    if(c==='"'||c==='`'){quote=c;continue;}
    if('([{'.includes(c)){stack.push(c);continue;}
    if(')]}'.includes(c)){if(!stack.length||'([{'.indexOf(stack.pop()!)!==')]}'.indexOf(c))return null;continue;}
    if(!stack.length&&( /\s/.test(c)||source.slice(i,i+2)==='//'))return i;
  }
  return quote||stack.length?null:source.length;
}
export function attributeRange(source:string,at:SourceAddress){
  const start=offset(source,at.line,at.col);if(start===null)return null;
  const prefix=at.property==='text-content'?/^text\s+/:new RegExp('^'+at.property.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*=\\s*');
  const match=prefix.exec(source.slice(start));if(!match)return null;
  const valueStart=start+match[0].length,end=valueEnd(source,valueStart);
  return end===null||end===valueStart?null:{start:valueStart,end,raw:source.slice(valueStart,end)};
}
export function elementInsertion(source:string,at:SourceAddress){
  const start=offset(source,at.line,at.col);if(start===null)return null;
  const tag=/^[a-z][\w-]*/.exec(source.slice(start));
  if(!tag||!['main','column','row','scroll','text','span','button','input','textarea','select','image','svg','path','circle','rect','group','div','section','article','header','footer','nav','aside','a','p','h1','h2','h3','form','canvas'].includes(tag[0]))return null;
  let i=start+tag[0].length;
  // Append on the node's first complete line, before a comment. Refuse a
  // multiline opening expression; don't guess where the opening node ends.
  for(;i<source.length;){
    while(source[i]===' '||source[i]==='\t')i++;
    if(i>=source.length||source[i]==='\n'||source[i]==='\r'||source.slice(i,i+2)==='//')return i;
    const end=valueEnd(source,i);if(end===null||source.slice(i,end).includes('\n'))return null;
    i=end;
  }
  return i;
}
