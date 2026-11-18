(function(root){
const normalize=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\s]/gu,'');
function distance(a,b,max){
 if(Math.abs(a.length-b.length)>max)return max+1;
 let prev=Array.from({length:b.length+1},(_,i)=>i),before=null;
 for(let i=1;i<=a.length;i++){const row=[i];let min=i;for(let j=1;j<=b.length;j++){row[j]=Math.min(row[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));if(before&&i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])row[j]=Math.min(row[j],before[j-2]+1);min=Math.min(min,row[j]);}if(min>max)return max+1;before=prev;prev=row;}return prev[b.length];
}
function score(value,query){
 const a=normalize(value).slice(0,512),b=normalize(query).slice(0,200);if(!b)return 1;if(a===b)return 100;if(a.includes(b))return 90;
 // Short terms and tags must not turn into arbitrary single-character matches.
 if(b.length<3||b.length>64)return 0;
 const limit=b.length>=7?2:1;let best=limit+1;
 for(let n=Math.max(3,b.length-limit);n<=b.length+limit;n++)for(let i=0;i+n<=a.length;i++){best=Math.min(best,distance(a.slice(i,i+n),b,limit));if(best===0)return 90;}
 return best<=limit?70-best*10:0;
}
function fields(x){
 const m=x.catalog||{},all=[x,m],out=[];
 for(const o of all){out.push(o.title,o.display_name,o.name,o.latin,...Object.values(o.localized||{}).map(v=>v?.value),...(o.titles||[]).map(v=>v.value||v.title));
 for(const a of ['companies','series','tags','credits'])for(const v of o[a]||[]){out.push(v.display_name,v.name,v.latin,...Object.values(v.localized||{}).map(t=>t?.value));for(const c of v.credits||[])out.push(c.display_name,c.name,c.latin,...Object.values(c.localized||{}).map(t=>t?.value));}}
 return out.filter(v=>typeof v==='string'&&v);
}
function rank(x,q){return Math.max(0,...fields(x).map(v=>score(v,q)));}
function variants(q){
 const n=String(q).normalize('NFKC').trim(),flat=normalize(n),tokens=n.split(/[\s\p{P}]+/u).filter(t=>normalize(t).length>=2).sort((a,b)=>b.length-a.length);
 if(flat.length<3)return [];
 return [...new Set([flat!==n?flat:'',tokens.length>1?tokens[0]:'',flat.slice(0,Math.max(2,Math.ceil(flat.length/2))),flat.slice(Math.floor(flat.length/2))])].filter(v=>v&&v!==n).slice(0,3);
}
const api={normalize,score,fields,rank,variants};if(typeof module!=='undefined')module.exports=api;else root.fuzzySearch=api;
})(globalThis);
