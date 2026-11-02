const fs=require('node:fs'),path=require('node:path');
function migrateData(destination,candidates){
 if(fs.existsSync(path.join(destination,'library.json')))return null;
 const source=candidates.find(p=>p&&path.resolve(p)!==path.resolve(destination)&&fs.existsSync(path.join(p,'library.json')));
 if(!source)return null;
 const value=JSON.parse(fs.readFileSync(path.join(source,'library.json'),'utf8'));
 if(!Array.isArray(value.games)||!Array.isArray(value.jobs)||!value.settings)throw Error('旧数据格式异常，已保留原文件');
 value.settings.libraryDir||=path.join(source,'library');
 if(!value.settings.downloadDir||path.resolve(value.settings.downloadDir)===path.join(source,'downloads'))value.settings.downloadDir=path.join(destination,'downloads');
 value.settings.legacyUploadDirs=[...new Set([...(value.settings.legacyUploadDirs||[]),path.join(source,'uploads')])];
 for(const job of [...value.jobs,...(value.deletedTasks||[]).filter(x=>x.kind==='download').map(x=>x.task)])job.archiveDir||=path.join(source,'downloads');
 fs.mkdirSync(destination,{recursive:true});
 const exclude=new Set(['Cache','Code Cache','GPUCache','DawnCache','Crashpad','ShaderCache','GrShaderCache']);
 if(fs.existsSync(path.join(source,'electron')))fs.cpSync(path.join(source,'electron'),path.join(destination,'electron'),{recursive:true,filter:p=>!exclude.has(path.basename(p))&&!path.basename(p).startsWith('Singleton')});
 if(fs.existsSync(path.join(source,'cache','banners')))fs.cpSync(path.join(source,'cache','banners'),path.join(destination,'cache','banners'),{recursive:true});
 if(fs.existsSync(path.join(source,'secrets.bin')))fs.copyFileSync(path.join(source,'secrets.bin'),path.join(destination,'secrets.bin'));
 fs.writeFileSync(path.join(destination,'migration.json'),JSON.stringify({source,at:new Date().toISOString(),version:1},null,2));
 fs.writeFileSync(path.join(destination,'library.json.tmp'),JSON.stringify(value,null,2));
 fs.renameSync(path.join(destination,'library.json.tmp'),path.join(destination,'library.json'));
 return source;
}
module.exports={migrateData};
