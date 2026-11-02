(function(root){
const parser=typeof module!=='undefined'?require('./query.cjs').parseQuery:root.parseQuery;
const norm=v=>String(v||'').normalize('NFKC').toLocaleLowerCase();
const label=x=>x?.localized?.['zh-Hans']?.value||x?.display_name||x?.name||'';
function matches(g,input){const p=parser(input),m=g.catalog||{},tags=(g.tags||m.tags||[]).flatMap(t=>[label(t),t.display_name]).map(norm);
 const objects=[...(g.companies||m.companies||[]),...(g.series||m.series||[]),...(g.credits||m.credits||[]).flatMap(r=>r.credits||[])];
 const text=norm([g.title,g.display_name,m.display_name,...Object.values(g.localized||{}).map(x=>x.value),...(g.titles||m.titles||[]).map(x=>x.value||x.title),...objects.flatMap(x=>[label(x),x.display_name,x.latin]),...tags].join(' '));
 return (!p.name||text.includes(norm(p.name)))&&p.include.every(t=>tags.includes(norm(t)))&&p.exclude.every(t=>!tags.includes(norm(t)));
}
if(typeof module!=='undefined')module.exports={matches};else root.libraryQueryMatches=matches;
})(globalThis);
