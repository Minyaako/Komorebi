// Shared by the browser and Node tests. Quotes group words; no regular expressions execute.
(function(root){
function parseQuery(input,mode='name'){
 const terms=[];let i=0;
 while(i<input.length){
  while(/\s/.test(input[i]||'')&&i<input.length)i++;
  if(i===input.length)break;
  let op=mode==='tag'?'+':'';
  if(['+','-','#'].includes(input[i])){op=input[i++]==='-'?'-':'+';while(i<input.length&&/\s/.test(input[i]))i++;}
  let value='',quoted=false;
  if(['"','“'].includes(input[i])){quoted=true;const end=input[i++]==='“'?'”':'"';while(i<input.length&&input[i]!==end){if(input[i]==='\\'&&i+1<input.length)i++;value+=input[i++];}if(input[i]!==end)throw Error('引号还没有闭合');i++;if(i<input.length&&!/\s/.test(input[i]))throw Error('引号后请用空格分隔条件');}
  else while(i<input.length&&!/\s/.test(input[i]))value+=input[i++];
  if(!value.trim())throw Error('请在 + 或 - 后填写标签名称');terms.push({op,value,quoted});
 }
 return {name:terms.filter(t=>!t.op).map(t=>t.value).join(' '),include:terms.filter(t=>t.op==='+').map(t=>t.value),exclude:terms.filter(t=>t.op==='-').map(t=>t.value)};
}
if(typeof module!=='undefined')module.exports={parseQuery};else root.parseQuery=parseQuery;
})(globalThis);
