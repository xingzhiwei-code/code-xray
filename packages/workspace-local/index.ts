import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat,open,readdir,realpath,readFile} from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import ignore from 'ignore';
import {type AnalyzeRequest,type SourceFile,type Diagnostic,type Snapshot,XrayError} from '../protocol/index.js';

const exec = promisify(execFile);
export const digest = (input:string|Buffer):string=>createHash('sha256').update(input).digest('hex');
const within = (root:string,file:string)=>file===root || file.startsWith(root+path.sep);
const hidden = new Set(['.git','node_modules','target','build','dist','.idea','.gradle','.xray','vendor']);
const secretPath = /(^|\/)(?:\.env(?:\..*)?|credentials[^/]*|secrets?[^/]*|[^/]*\.(?:pem|key|p12|pfx|keystore))$/i;
export const hasSecret = (text:string)=> /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{24,})\b|(?:password|api[_-]?key|secret|token)\s*[:=]\s*["'][^"'\n]{8,}["']/i.test(text);
function safeEnv():NodeJS.ProcessEnv {
  return {...Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('GIT_'))),GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_OPTIONAL_LOCKS:'0',GIT_TERMINAL_PROMPT:'0'};
}
async function git(cwd:string,args:string[]):Promise<string>{
  try {return (await exec('git',['-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null',...args],{cwd,env:safeEnv(),encoding:'utf8',timeout:15_000,maxBuffer:8*1024*1024})).stdout;}
  catch {throw new XrayError('GIT_ERROR','无法读取指定 Git 数据；请确认仓库和基线有效。',2);}
}
export interface WorkspaceSnapshot {root:string;files:SourceFile[];snapshot:Snapshot;reasons:Diagnostic[];discovered:number;gitRoot:string|null;tracked:Set<string>|null;request:AnalyzeRequest}
function cancelled(signal?:AbortSignal){if(signal?.aborted)throw new XrayError('CANCELLED','已取消分析。',130);}
async function boundedRead(root:string,relative:string,max:number):Promise<string>{
  const file=path.join(root,relative);
  const resolved=await realpath(file);
  if(!within(root,resolved))throw new XrayError('PATH_POLICY','路径超出工作区。',4);
  const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  try {
    const before=await handle.stat();
    if(!before.isFile()||before.size>max)throw new XrayError('FILE_LIMIT','文件超过大小限制或不是常规文件。',3);
    if(await realpath(file)!==resolved)throw new XrayError('SNAPSHOT_CHANGED','读取时路径发生变化。',3);
    const bytes=await handle.readFile();
    const after=await handle.stat();
    if(bytes.length>max||before.size!==after.size||before.mtimeMs!==after.mtimeMs||await realpath(file)!==resolved)throw new XrayError('SNAPSHOT_CHANGED','读取时文件发生变化，请重新扫描。',3);
    if(bytes.includes(0))throw new XrayError('BINARY_FILE','跳过二进制文件。',3);
    try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new XrayError('ENCODING','仅支持 UTF-8 源码。',3);}
  }finally{await handle.close();}
}
export async function snapshotWorkspace(request:AnalyzeRequest):Promise<WorkspaceSnapshot>{
  cancelled(request.signal);
  let root:string;
  try{root=await realpath(request.path);if(!(await lstat(root)).isDirectory())throw new Error();}
  catch{throw new XrayError('INVALID_PATH','请选择存在且可读取的项目目录。',2);}
  const maxFiles=request.maxFiles??1000,maxFileBytes=request.maxFileBytes??1024*1024;
  if(!Number.isInteger(maxFiles)||maxFiles<1||maxFiles>10000||!Number.isInteger(maxFileBytes)||maxFileBytes<1||maxFileBytes>5*1024*1024)throw new XrayError('INVALID_LIMIT','文件数范围 1–10000，单文件上限 5 MiB。',2);
  const reasons:Diagnostic[]=[],files:SourceFile[]=[];
  let gitRoot:string|null=null,gitHead:string|null=null,tracked:Set<string>|null=null;
  try{gitRoot=(await git(root,['rev-parse','--show-toplevel'])).trim();}catch{}
  if(gitRoot){
    try{gitHead=(await git(root,['rev-parse','--verify','HEAD'])).trim();}catch{}
    tracked=new Set((await git(root,['ls-files','--cached','-z'])).split('\0').filter(Boolean));
  }
  const exclusions=ignore().add(request.exclude??[]);
  let discovered=0,visited=0,limitReached=false;
  async function walk(dir:string,localIgnore:ReturnType<typeof ignore>):Promise<void>{
    cancelled(request.signal);
    if(limitReached)return;
    let entries;
    try{entries=await readdir(path.join(root,dir),{withFileTypes:true});}catch{reasons.push({path:dir,code:'UNREADABLE',message:'目录不可读取。'});return;}
    const rules=ignore().add(localIgnore);
    if(entries.some(e=>e.name==='.gitignore'&&e.isFile())){
      try{const raw=await boundedRead(root,path.posix.join(dir,'.gitignore'),65536);const prefix=dir?dir+'/':'';rules.add(raw.split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>{const neg=l.startsWith('!');const v=neg?l.slice(1):l;return (neg?'!':'')+prefix+(v.startsWith('/')?v.slice(1):v.includes('/')?v:'**/'+v);}));}catch{reasons.push({path:path.posix.join(dir,'.gitignore'),code:'IGNORE_UNREADABLE',message:'无法读取忽略规则。'});}
    }
    for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name,'en'))){
      cancelled(request.signal);
      if(++visited>20000){reasons.push({path:dir,code:'ENTRY_LIMIT',message:'超过 20000 个目录条目，请选择较小模块。'});limitReached=true;return;}
      const rel=path.posix.join(dir,entry.name);
      if(entry.isSymbolicLink()){reasons.push({path:rel,code:'SYMLINK_SKIPPED',message:'跳过符号链接，防止扫描越界。'});continue;}
      if(hidden.has(entry.name)){continue;}
      if(secretPath.test(rel)){if(entry.name.endsWith('.java'))reasons.push({path:rel,code:'SENSITIVE_PATH',message:'按敏感文件名策略排除；内容未读取。'});continue;}
      if(rules.ignores(rel+(entry.isDirectory()?'/':''))||exclusions.ignores(rel+(entry.isDirectory()?'/':''))){if(entry.name.endsWith('.java'))reasons.push({path:rel,code:'EXCLUDED',message:'按忽略规则排除。'});continue;}
      if(entry.isDirectory()){await walk(rel,rules);continue;}
      if(!entry.name.endsWith('.java'))continue;
      discovered++;
      if(!entry.isFile()){reasons.push({path:rel,code:'SPECIAL_FILE',message:'跳过非常规文件。'});continue;}
      // Working-tree scan sees what is on disk: untracked files are current
      // changes too. Opt out explicitly with includeUntracked:false.
      if(tracked && request.includeUntracked===false && !tracked.has(rel)){reasons.push({path:rel,code:'UNTRACKED',message:'未跟踪文件被 --include-untracked=false 排除。'});continue;}
      if(files.length>=maxFiles){reasons.push({path:rel,code:'FILE_LIMIT',message:'超过文件数量上限，请选择较小模块。'});limitReached=true;return;}
      try{
        const content=await boundedRead(root,rel,maxFileBytes);
        if(hasSecret(content)){reasons.push({path:rel,code:'SECRET_FILTER',message:'检测到疑似凭据，已排除此文件。'});continue;}
        files.push({path:rel,content,digest:digest(content)});
      }catch(error){reasons.push({path:rel,code:error instanceof XrayError?error.code:'UNREADABLE',message:error instanceof XrayError?error.message:'文件不可读取。'});}
    }
  }
  await walk('',ignore());
  files.sort((a,b)=>a.path.localeCompare(b.path,'en'));
  const manifest=files.map(({path,digest})=>({path,digest}));
  return {root,files,snapshot:{id:digest(JSON.stringify(manifest)),workspaceId:digest(root),files:manifest,gitHead,gitBase:null},reasons,discovered,gitRoot,tracked,request};
}
export async function snapshotBaseline(current:WorkspaceSnapshot,base:string):Promise<WorkspaceSnapshot>{
  if(!current.gitRoot)throw new XrayError('NOT_GIT','diff 需要 Git 仓库；普通目录请使用 scan。',2);
  if(!base||base.startsWith('-')||base.includes('\0'))throw new XrayError('INVALID_BASE','请指定有效的 Git 基线。',2);
  const sha=(await git(current.root,['rev-parse','--verify','--end-of-options',base+'^{commit}'])).trim();
  const prefix=path.relative(current.gitRoot,current.root).split(path.sep).join('/');
  const names=(await git(current.gitRoot,['ls-tree','-r','--name-only','-z',sha])).split('\0').filter(Boolean);
  const files:SourceFile[]=[],reasons:Diagnostic[]=[];
  const excluded=ignore().add(current.request.exclude??[]);
  for(const name of names){
    cancelled(current.request.signal);
    if(prefix&&!name.startsWith(prefix+'/'))continue;
    const rel=prefix?name.slice(prefix.length+1):name;
    if(!rel.endsWith('.java')||rel.split('/').some(p=>hidden.has(p)||p==='..'))continue;
    if(secretPath.test(rel)||excluded.ignores(rel)){reasons.push({path:rel,code:'BASE_EXCLUDED',message:'基线文件按敏感文件名或排除策略跳过。'});continue;}
    if(files.length>=(current.request.maxFiles??1000)){reasons.push({path:rel,code:'FILE_LIMIT',message:'基线文件数量超过上限。'});break;}
    try{
      // A blob read never invokes a worktree filter or project command.
      const content=await git(current.gitRoot,['cat-file','blob',sha+':'+name]);
      if(Buffer.byteLength(content)>(current.request.maxFileBytes??1024*1024)||content.includes('\0')||hasSecret(content)){reasons.push({path:rel,code:'BASE_EXCLUDED',message:'基线文件超过限制或触发隐私过滤。'});continue;}
      files.push({path:rel,content,digest:digest(content)});
    }catch{reasons.push({path:rel,code:'BASE_UNREADABLE',message:'基线条目不是可读取的源码 blob。'});}
  }
  files.sort((a,b)=>a.path.localeCompare(b.path,'en'));
  const manifest=files.map(({path,digest})=>({path,digest}));
  return {...current,files,reasons,discovered:files.length,snapshot:{...current.snapshot,id:digest(JSON.stringify(manifest)),files:manifest,gitHead:sha,gitBase:sha}};
}
export async function stalePaths(root:string,report:Pick<Snapshot,'files'>):Promise<string[]>{
  const stale:string[]=[];
  for(const f of report.files){try{if(digest(await boundedRead(await realpath(root),f.path,5*1024*1024))!==f.digest)stale.push(f.path);}catch{stale.push(f.path);}}
  return stale;
}
