const {variants,rank}=require('./ui/fuzzy-search.cjs');
async function fallback(result,query,fetch){
 if(result.items?.length||result.next_cursor||!String(query).trim())return result;
 const probes=variants(query);if(!probes.length)return result;
 const responses=await Promise.allSettled(probes.map(fetch)),items=new Map();
 for(const r of responses)if(r.status==='fulfilled')for(const x of r.value.items||[]){const score=rank(x,query);if(score&&!items.has(String(x.id)))items.set(String(x.id),{x,score});}
 const matches=[...items.values()].sort((a,b)=>b.score-a.score).slice(0,48).map(v=>v.x);
 return matches.length?{...result,items:matches,total:undefined,next_cursor:null,approximate:true}:result;
}
module.exports={fallback};
