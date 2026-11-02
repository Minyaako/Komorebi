const path=require('node:path'),fs=require('node:fs/promises'),{randomUUID}=require('node:crypto');
function initStorage(store,dataDir){const s=store.value.settings;s.libraries||=[{id:'default',name:'默认游戏库',path:s.libraryDir||path.join(dataDir,'library')}];if(!s.libraries.some(x=>x.id===s.defaultLibraryId))s.defaultLibraryId=s.libraries[0].id;s.libraryDir=s.libraries.find(x=>x.id===s.defaultLibraryId).path;s.downloadDir||=path.join(dataDir,'downloads');s.watchFolders||=[];store.value.watchSeen||={};store.save();}
function libraryRoot(store,id){const s=store.value.settings;if(!s.libraries)return s.libraryDir;const entry=s.libraries.find(x=>x.id===(id||s.defaultLibraryId));if(!entry)throw new Error('游戏库位置已移除，请重新选择');return entry.path;}
const overlap=(a,b)=>{const rel=path.relative(a,b);return rel===''||rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);};
async function addLibrary(store,folder){const real=await fs.realpath(folder);if(real===path.parse(real).root)throw new Error('请选择磁盘里的专用游戏库文件夹');const s=store.value.settings;if(s.watchFolders.some(w=>overlap(real,w.path)||overlap(w.path,real)))throw new Error('游戏库不能与下载监听目录嵌套');const existing=s.libraries.find(x=>x.path.toLowerCase()===real.toLowerCase());if(existing)return existing;const entry={id:randomUUID(),name:path.basename(real),path:real};s.libraries.push(entry);store.save();return entry;}
async function normalizeLaunch(game){
 const root=await fs.realpath(game.dir);if(!game.executable)return null;
 const exe=await fs.realpath(path.resolve(root,game.executable));if(!overlap(root,exe)||exe===root||!exe.toLowerCase().endsWith('.exe'))throw new Error('启动程序不在游戏目录中');
 if(!(await fs.stat(exe)).isFile())throw new Error('启动程序不是文件');
 game.dir=root;game.executable=path.relative(root,exe);game.launchDir=path.dirname(exe);game.pathNormalizedAt=Date.now();return exe;
}
module.exports={initStorage,libraryRoot,addLibrary,normalizeLaunch,overlap};
