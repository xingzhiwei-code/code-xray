import { createHash } from 'node:crypto';
import { parse, type CstNode, type IToken } from 'java-parser';
import type { JavaAnalysis, JavaDiagnostic, JavaEvidence, JavaFinding, JavaSourceFile } from './types.js';
export type * from './types.js';

export const JAVA_ANALYZER_VERSION = '0.1.0';
export const JAVA_RULES = [
  'TX_SELF_INVOCATION', 'JPA_CALL_IN_LOOP', 'WEB_ENTITY_RELATION',
  'SPRING_BEAN_CANDIDATE', 'TRANSACTION_BOUNDARY', 'JPA_PERSISTENCE_CONTEXT',
] as const;
const TX = 'org.springframework.transaction.annotation.Transactional';
const WEB = 'org.springframework.web.bind.annotation.';
const REPOSITORIES = new Set(['org.springframework.data.jpa.repository.JpaRepository', 'org.springframework.data.repository.CrudRepository', 'org.springframework.data.repository.ListCrudRepository']);
const RELATIONS = new Set(['OneToMany', 'ManyToMany', 'OneToOne', 'ManyToOne'].flatMap(n => [`jakarta.persistence.${n}`, `javax.persistence.${n}`]));
const ENTITIES = new Set(['jakarta.persistence.Entity', 'javax.persistence.Entity']);
const MAPPINGS = new Set(['RequestMapping', 'GetMapping', 'PostMapping', 'PutMapping', 'DeleteMapping', 'PatchMapping'].map(n => WEB + n));
const QUERY_NAMES = new Set(['findById', 'findAll', 'getReferenceById', 'getOne', 'getById', 'existsById', 'count', 'save', 'saveAndFlush', 'delete', 'deleteById', 'flush']);
const BEAN_ANNOTATIONS = new Set([
  'org.springframework.stereotype.Service', 'org.springframework.stereotype.Component',
  'org.springframework.stereotype.Repository', 'org.springframework.stereotype.Controller',
  'org.springframework.web.bind.annotation.RestController',
]);
const LOOPS = new Set(['basicForStatement', 'enhancedForStatement', 'whileStatement', 'doStatement']);
const NESTED = new Set(['classDeclaration', 'interfaceDeclaration', 'recordDeclaration', 'enumDeclaration', 'anonymousClassBody']);
type Node = CstNode;
type Part = Node | IToken;
interface Annotation { raw: string; full?: string; node: Node }
interface Field { name: string; type: string; node: Node; annotations: Annotation[] }
interface Method { name: string; signature: string; arity: number; node: Node; header: Node; body?: Node; annotations: Annotation[]; parameters: Field[]; type: string; owner: TypeInfo }
interface TypeInfo { name: string; full: string; kind: 'class' | 'interface'; node: Node; file: Unit; annotations: Annotation[]; methods: Method[]; fields: Field[]; extendsTypes: string[] }
interface Unit { source: JavaSourceFile; tree: Node; packageName: string; imports: Map<string, string>; stars: string[]; types: TypeInfo[] }
const isNode = (v: Part): v is Node => 'children' in v;
const children = (n: Node): Part[] => Object.values(n.children).flat() as Part[];
const nodes = (n: Node, key: string): Node[] => ((n.children[key] ?? []) as Part[]).filter(isNode);
const direct = (n: Node, key: string): Node | undefined => nodes(n, key)[0];
const tokenChildren = (n: Node, key: string): IToken[] => ((n.children[key] ?? []) as Part[]).filter(v => !isNode(v)) as IToken[];
function descendants(n: Node, name: string): Node[] {
  const found: Node[] = [];
  for (const c of children(n)) if (isNode(c)) { if (c.name === name) found.push(c); found.push(...descendants(c, name)); }
  return found;
}
function tokens(n: Node): IToken[] {
  const result: IToken[] = [];
  for (const c of children(n)) isNode(c) ? result.push(...tokens(c)) : result.push(c);
  return result.sort((a,b) => a.startOffset-b.startOffset);
}
const textOf = (n: Node): string => tokens(n).map(t => t.image).join('');
const hash = (...items: (string|number)[]) => createHash('sha256').update(JSON.stringify(items)).digest('hex').slice(0,20);
function resolveName(raw: string, unit: Unit): string | undefined {
  if (raw.includes('.')) return raw;
  return unit.imports.get(raw);
}
function annotations(n: Node, modifier: string, unit: Unit): Annotation[] {
  return nodes(n, modifier).flatMap(m => nodes(m, 'annotation')).map(a => {
    const name = direct(a, 'typeName'); const raw = name ? textOf(name) : '';
    return {raw, full: resolveName(raw, unit), node:a};
  });
}
function typeName(node: Node | undefined): string {
  if (!node) return '';
  return textOf(node);
}
function outerType(raw: string): string { return raw.split('<')[0].split('[')[0]; }
function typeFields(n: Node, typeKey: string, anns: Annotation[]): Field[] {
  const typeNode = direct(n, typeKey) ?? descendants(n, 'unannType')[0];
  const list = direct(n, 'variableDeclaratorList');
  if (!list) return [];
  return nodes(list, 'variableDeclarator').flatMap(v => {
    const id = direct(v, 'variableDeclaratorId'); const name = id && tokenChildren(id, 'Identifier')[0]?.image;
    return name ? [{name, type:typeName(typeNode), node:v, annotations:anns}] : [];
  });
}
function parseUnit(source: JavaSourceFile): Unit {
  const tree = parse(source.content) as Node;
  const ordinary = direct(tree, 'ordinaryCompilationUnit');
  const packageNode = ordinary && direct(ordinary, 'packageDeclaration');
  const unit: Unit = {source, tree, packageName:packageNode ? tokenChildren(packageNode, 'Identifier').map(t=>t.image).join('.') : '', imports:new Map(), stars:[], types:[]};
  if (!ordinary) return unit;
  for (const imp of nodes(ordinary, 'importDeclaration')) {
    if (tokenChildren(imp, 'Static').length) continue;
    const nameNode = direct(imp, 'packageOrTypeName'); if (!nameNode) continue;
    const name = textOf(nameNode);
    if (tokens(imp).some(t=>t.image==='*')) unit.stars.push(name);
    else {const key=name.split('.').at(-1)!; unit.imports.set(key, unit.imports.has(key) ? '' : name);}
  }
  for (const declaration of nodes(ordinary, 'typeDeclaration')) {
    const classWrap = direct(declaration, 'classDeclaration');
    const interfaceWrap = direct(declaration, 'interfaceDeclaration');
    const wrapper = classWrap ?? interfaceWrap; if (!wrapper) continue;
    const normal = direct(wrapper, classWrap ? 'normalClassDeclaration' : 'normalInterfaceDeclaration');
    if (!normal) continue;
    const id = direct(normal, 'typeIdentifier'); if (!id) continue;
    const name=textOf(id), full=[unit.packageName,name].filter(Boolean).join('.');
    const info:TypeInfo = {name, full, kind:classWrap?'class':'interface', node:wrapper, file:unit,
      annotations:annotations(wrapper,classWrap?'classModifier':'interfaceModifier',unit),methods:[],fields:[],extendsTypes:[]};
    const ext = direct(normal,classWrap?'classExtends':'interfaceExtends');
    if (ext) {
      const list = direct(ext,'interfaceTypeList');
      info.extendsTypes = list ? nodes(list,'interfaceType').map(n=>outerType(textOf(n))) : nodes(ext,'classType').map(n=>outerType(textOf(n)));
    }
    const body=direct(normal,classWrap?'classBody':'interfaceBody');
    if (body) for (const bodyDecl of nodes(body,classWrap?'classBodyDeclaration':'interfaceMemberDeclaration')) {
      const member=direct(bodyDecl,'classMemberDeclaration') ?? bodyDecl;
      const field=direct(member,'fieldDeclaration');
      if(field) info.fields.push(...typeFields(field,'unannType',annotations(field,'fieldModifier',unit)));
      const method=direct(member,'methodDeclaration') ?? direct(member,'interfaceMethodDeclaration');
      if(!method) continue;
      const header=direct(method,'methodHeader'), declarator=header && direct(header,'methodDeclarator');
      const methodName=declarator && tokenChildren(declarator,'Identifier')[0]?.image;
      if(!header || !declarator || !methodName) continue;
      const parameters: Field[] = [];
      const paramList=direct(declarator,'formalParameterList');
      if(paramList) for(const param of nodes(paramList,'formalParameter')) {
        const regular=direct(param,'variableParaRegularParameter') ?? direct(param,'variableArityParameter') ?? param;
        const variable=direct(regular,'variableDeclaratorId');
        const paramName=variable ? tokenChildren(variable,'Identifier')[0]?.image : tokenChildren(regular,'Identifier')[0]?.image;
        if(paramName) parameters.push({name:paramName,type:typeName(direct(regular,'unannType')),node:regular,annotations:[]});
      }
      info.methods.push({name:methodName,signature:`${full}#${methodName}(${parameters.map(p=>p.type).join(',')})`,arity:parameters.length,node:method,header,
        body:direct(method,'methodBody'),annotations:annotations(method,'methodModifier',unit),parameters,type:typeName(direct(header,'result')),owner:info});
    }
    unit.types.push(info);
  }
  return unit;
}

/** Parses source only; never builds, imports or executes the inspected application. */
export async function analyzeJava(files: JavaSourceFile[], onProgress?: (parsed: number, total: number) => void): Promise<JavaAnalysis> {
  const result:JavaAnalysis={analyzerId:'java-cst',analyzerVersion:JAVA_ANALYZER_VERSION,parserVersion:'3.0.1',analyzedFiles:[],failedFiles:[],facts:[],evidence:[],findings:[],flows:[],diagnostics:[]};
  const units:Unit[]=[];
  const evidenceMap=new Map<string,JavaEvidence>();
  function ev(unit:Unit,n:Node|IToken,kind:JavaEvidence['kind']):string {
    const loc=isNode(n)?n.location:n; const id=`ev_${hash(unit.source.path,unit.source.digest,loc.startOffset,loc.endOffset,kind)}`;
    if(!evidenceMap.has(id)) evidenceMap.set(id,{id,path:unit.source.path,digest:unit.source.digest,
      start:{line:loc.startLine,column:loc.startColumn,offset:loc.startOffset},
      end:{line:loc.endLine,column:loc.endColumn,offset:loc.endOffset},
      excerpt:unit.source.content.slice(loc.startOffset,Math.min(loc.endOffset+1,loc.startOffset+500)),kind});
    return id;
  }
  function diag(unit:Unit,code:string,message:string,ruleId?:string,n?:Node|IToken) {
    result.diagnostics.push({code,message,path:unit.source.path,...(ruleId?{ruleId}:{}),...(n?{evidenceIds:[ev(unit,n,'declaration')]}:{})});
  }
  for(const file of [...files].sort((a,b)=>a.path.localeCompare(b.path,'en'))) {
    try {const unit=parseUnit(file);units.push(unit);result.analyzedFiles.push(file.path);}
    catch {result.failedFiles.push(file.path);result.diagnostics.push({code:'JAVA_PARSE_ERROR',path:file.path,message:'Java 语法解析失败；该文件未应用规则。请用 Java 编译器检查语法或确认受支持语法范围。'});}
    if (onProgress) {
      onProgress(result.analyzedFiles.length + result.failedFiles.length, files.length);
      // Yield periodically so the host can process signals (cancellation)
      // and flush progress output while large scans are still running.
      if ((result.analyzedFiles.length + result.failedFiles.length) % 50 === 0)
        await new Promise<void>(resolve => setImmediate(resolve));
    }
  }
  const types=units.flatMap(u=>u.types), byName=new Map<string,TypeInfo[]>();
  for(const type of types) byName.set(type.full,[...(byName.get(type.full)??[]),type]);
  function localType(raw:string,unit:Unit):TypeInfo|undefined {
    const base=outerType(raw); const key=base.includes('.')?base:unit.imports.get(base)??[unit.packageName,base].filter(Boolean).join('.');
    const candidates=byName.get(key); return candidates?.length===1?candidates[0]:undefined;
  }
  const isRepository=(type:TypeInfo):boolean=>type.kind==='interface'&&type.extendsTypes.some(n=>REPOSITORIES.has(resolveName(n,type.file)??''));
  function finding(ruleId:string,conceptId:string,title:string,summary:string,symbol:string,evidenceIds:string[],assumptions:string[],uncertainties:string[],verification:string) {
    result.findings.push({id:`finding_${hash(ruleId,...evidenceIds)}`,ruleId,ruleVersion:'1.0.0',conceptId,category:'inference',severity:'medium',title,summary,symbol,evidenceIds:[...new Set(evidenceIds)],assumptions,uncertainties,verification});
  }
  function uncertainAnnotation(as:Annotation[],raw:string):boolean {return as.some(a=>!a.full&&a.raw===raw);}
  function addAnnotations(as:Annotation[],unit:Unit,parent:string) {
    for(const a of as) {
      result.facts.push({id:`fact_${hash(unit.source.path,parent,'annotation',a.raw,a.node.location.startOffset)}`,kind:'annotation',name:a.raw,qualifiedName:a.full??a.raw,evidenceIds:[ev(unit,a.node,'annotation')],attributes:{owner:parent,resolution:a.full?'explicit-name':'unknown'}});
      if(!a.full) diag(unit,'JAVA_ANNOTATION_UNRESOLVED',`注解 ${a.raw} 缺少唯一显式 import/FQN；不推断元注解或通配导入。`,undefined,a.node);
    }
  }
  for(const unit of units) {
    if(!unit.types.length) diag(unit,'JAVA_STRUCTURE_UNSUPPORTED','未识别受支持的顶层 class/interface；module/record/enum 结构暂不做框架规则。');
    for(const nested of [...descendants(unit.tree,'recordDeclaration'),...descendants(unit.tree,'enumDeclaration')]) diag(unit,'JAVA_STRUCTURE_UNSUPPORTED','record/enum 暂不做框架规则；不会从其方法推断调用。',undefined,nested);
    for(const type of unit.types) {
      const typeEv=ev(unit,type.node,'declaration');
      result.facts.push({id:`fact_${hash(unit.source.path,type.full)}`,kind:'type',name:type.name,qualifiedName:type.full,evidenceIds:[typeEv],attributes:{kind:type.kind,extends:type.extendsTypes,annotations:type.annotations.map(a=>a.full??a.raw)}});
      addAnnotations(type.annotations,unit,type.full);
      for(const field of type.fields) {
        result.facts.push({id:`fact_${hash(unit.source.path,type.full,field.name)}`,kind:'field',name:field.name,qualifiedName:`${type.full}#${field.name}`,evidenceIds:[ev(unit,field.node,'declaration')],attributes:{type:field.type,owner:type.full}});
        addAnnotations(field.annotations,unit,`${type.full}#${field.name}`);
      }
      for(const method of type.methods) {
        result.facts.push({id:`fact_${hash(unit.source.path,method.signature)}`,kind:'method',name:method.name,qualifiedName:method.signature,evidenceIds:[ev(unit,method.header,'declaration')],attributes:{returnType:method.type,owner:type.full,annotations:method.annotations.map(a=>a.full??a.raw)}});
        addAnnotations(method.annotations,unit,method.signature);
        webRule(method);
        beanAndTransactionRules(method);
        persistenceRule(method);
        if(method.body) visitBody(method.body,method);
      }
    }
  }
  function beanAndTransactionRules(method:Method) {
    const type=method.owner, unit=type.file;
    const beanAnnotation=type.annotations.find(a=>BEAN_ANNOTATIONS.has(a.full??''));
    if(!beanAnnotation) return;
    const injected=[];
    for(const field of type.fields) {
      const declared=localType(field.type,unit);
      if(!declared || declared.full===type.full) continue;
      const candidateBean=declared.annotations.find(a=>BEAN_ANNOTATIONS.has(a.full??''));
      if(!candidateBean) continue;
      injected.push({field,declared,candidateBean});
    }
    if(injected.length) {
      const evidenceIds=[ev(unit,beanAnnotation.node,'annotation'),ev(unit,method.header,'declaration'),...injected.flatMap(x=>[
        ev(unit,x.field.node,'declaration'),ev(x.declared.file,x.candidateBean.node,'annotation'),ev(x.declared.file,x.declared.node,'declaration')
      ])];
      finding('SPRING_BEAN_CANDIDATE','spring.bean-relationship','Bean 候选与注入关系需要核对代理边界',`${type.full} 是 Spring Bean 候选，${method.signature} 可通过候选 Bean 关系进入 ${injected.map(x=>x.declared.full).join(', ')}。`,method.signature,evidenceIds,
        ['仅当这些类型实际由 Spring 容器注册并通过代理调用时，Bean 关系成立。'],
        ['静态分析不能确认组件扫描范围、条件 Bean、Profile、多实现选择或代理模式。','同名类型或多个候选时可能存在其他绑定。'],
        '用真实 Spring 上下文打印 Bean 类型并验证调用路径是否经过代理。');
    }
    const tx=method.annotations.find(a=>a.full===TX);
    if(!tx) return;
    const external=type.methods.some(other=>other!==method && other.body && descendants(other.body,'primary').some(primary=>{
      const before=tokens(primary); return before.some(t=>t.image===method.name);
    }));
    finding('TRANSACTION_BOUNDARY','spring.transaction-boundary','事务边界需要用外部入口验证',`${method.signature} 标有 @Transactional，事务拦截依赖从 Bean 外部经过代理进入。`,method.signature,
      [ev(unit,tx.node,'annotation'),ev(unit,method.header,'declaration')],
      ['方法由容器管理 Bean 调用且使用基于代理的事务时，拦截器在该边界工作。','同类内部 this 调用不经过代理，事务边界可能不同。'],
      ['未解析事务管理器、传播配置、异常类型、回滚规则、AspectJ 或实际 Bean 绑定。'],
      external
        ? '从另一个 Bean 调用该方法并断言回滚行为；同时测试同类 this 调用路径。'
        : '从测试中的外部 Bean 调用该方法并断言回滚行为；避免只测试 this 调用。');
  }
  function persistenceRule(method:Method) {
    const type=method.owner, unit=type.file;
    const entity=localType(method.type,unit);
    if(!entity || !entity.annotations.some(a=>ENTITIES.has(a.full??''))) return;
    const entityAnn=entity.annotations.find(a=>ENTITIES.has(a.full??''))!;
    const relations=entity.fields.flatMap(f=>f.annotations.filter(a=>RELATIONS.has(a.full??'')));
    if(!relations.length) return;
    finding('JPA_PERSISTENCE_CONTEXT','jpa.persistence-context','返回实体关系需检查持久化上下文边界',`${method.signature} 返回实体 ${entity.full}；调用方可能触发持久化关系加载或把实体带出事务边界。`,method.signature,
      [ev(unit,method.header,'return-type'),ev(entity.file,entityAnn.node,'annotation'),...relations.map(a=>ev(entity.file,a.node,'annotation'))],
      ['返回对象确实是该 JPA 实体，并且调用方访问声明的持久化关系。'],
      ['静态分析不确认 fetch 策略、Open Session in View、DTO 转换、序列化访问路径或事务状态。'],
      '在调用方访问关系字段并记录 SQL/LazyInitializationException；如需稳定 API，请在事务内完成加载或返回 DTO。');
  }
  function webRule(method:Method) {
    const {owner:type}=method, unit=type.file, anns=[...method.annotations,...type.annotations];
    const mapped=method.annotations.some(a=>MAPPINGS.has(a.full??''));
    if(!mapped) return;
    const rest=type.annotations.some(a=>a.full===WEB+'RestController');
    const controller=type.annotations.some(a=>a.full==='org.springframework.stereotype.Controller');
    const body=anns.some(a=>a.full===WEB+'ResponseBody');
    if(!rest&&!(controller&&body)) return;
    let returned=method.type;
    const outer=outerType(returned), full=resolveName(outer,unit);
    if(returned.includes('<')) {
      if(!['java.util.List','java.util.Set','java.util.Collection','org.springframework.http.ResponseEntity'].includes(full??'')) {
        diag(unit,'JAVA_RETURN_WRAPPER_UNRESOLVED','响应泛型容器未在支持范围内；实体边界为 unknown。','WEB_ENTITY_RELATION',method.header); return;
      }
      returned=returned.slice(returned.indexOf('<')+1,-1);
      if(returned.includes('<')||returned.includes(',')||returned.includes('?')) {diag(unit,'JAVA_RETURN_WRAPPER_UNRESOLVED','嵌套、通配或多参数响应泛型未解析。','WEB_ENTITY_RELATION',method.header);return;}
    }
    const entity=localType(returned,unit);
    if(!entity) {
      if(!['void','String','java.lang.String','boolean','int','long','double'].includes(returned)) diag(unit,'JAVA_ENTITY_TYPE_UNRESOLVED','响应声明类型不在可见的唯一局部类型中；无法确定实体/DTO 与关系。','WEB_ENTITY_RELATION',method.header);
      return;
    }
    if(!entity.annotations.some(a=>ENTITIES.has(a.full??''))) {
      if(uncertainAnnotation(entity.annotations,'Entity')) diag(unit,'JAVA_ENTITY_ANNOTATION_UNRESOLVED','Entity 注解未由显式名称解析；不报告实体暴露风险。','WEB_ENTITY_RELATION',method.header);
      return;
    }
    const relations=entity.fields.flatMap(f=>f.annotations.filter(a=>RELATIONS.has(a.full??'')));
    if(!relations.length) return;
    const mapping=method.annotations.find(a=>MAPPINGS.has(a.full??''))!;
    const entityAnn=entity.annotations.find(a=>ENTITIES.has(a.full??''))!;
    finding('WEB_ENTITY_RELATION','jpa.entity-boundary','Web 响应直接携带实体关系',`${method.signature} 的声明响应类型包含实体 ${entity.full}，其持久化关系可能进入序列化边界。`,method.signature,
      [ev(unit,method.header,'return-type'),ev(unit,mapping.node,'annotation'),ev(entity.file,entityAnn.node,'annotation'),...relations.map(a=>ev(entity.file,a.node,'annotation'))],
      ['该映射作为响应体处理，返回对象按声明实体类型使用。','序列化器实际访问这些关系时，才产生加载或序列化影响。'],
      ['未加载运行时 Jackson 配置、忽略注解、DTO 转换、Open Session in View 或实际 fetch 状态。','静态形态不能证明信息泄露、额外 SQL 或循环序列化已经发生。'],
      '为真实响应写序列化测试，检查字段白名单与 SQL 次数；必要时显式映射 DTO。');
  }
  function visitBody(n:Node,method:Method,loop?:Node,deferred=false) {
    const unit=method.owner.file;
    if(NESTED.has(n.name)) {diag(unit,'JAVA_NESTED_SCOPE_UNSUPPORTED','嵌套/匿名类作用域不并入外层方法。',undefined,n);return;}
    if(n.name==='lambdaExpression') {
      diag(unit,'JAVA_DEFERRED_CALL_UNKNOWN','Lambda 执行时机与接收者未解析；其中调用不连接到外层确定路径。',loop?'JPA_CALL_IN_LOOP':undefined,n);
      for(const c of children(n)) if(isNode(c)) visitBody(c,method,loop,true);
      return;
    }
    if(n.name==='methodReferenceSuffix') diag(unit,'JAVA_METHOD_REFERENCE_UNKNOWN','方法引用的执行时机/目标未解析。',undefined,n);
    if(n.name==='primary') analyzeCall(n,method,loop,deferred);
    for(const c of children(n)) if(isNode(c)) {
      const bodyLoop=LOOPS.has(n.name) && (c.name==='statement'||c.name==='statementNoShortIf') ? n : loop;
      visitBody(c,method,bodyLoop,deferred);
    }
  }
  function analyzeCall(primary:Node,method:Method,loop:Node|undefined,deferred:boolean) {
    const invocation=nodes(primary,'primarySuffix').flatMap(s=>nodes(s,'methodInvocationSuffix'));
    if(!invocation.length) return;
    const unit=method.owner.file;
    for(const inv of invocation) {
      const before=tokens(primary).filter(t=>t.endOffset<inv.location.startOffset);
      const valid=before.length>0&&before.every((t,i)=>i%2===0?(t.image==='this'||t.tokenType.name==='Identifier'):t.image==='.');
      const parts=valid?before.filter((_,i)=>i%2===0).map(t=>t.image):[];
      const methodName=parts.at(-1), receiver=parts.slice(0,-1).join('.');
      const callEvidence=ev(unit,primary,'call');
      const label=valid?parts.join('.')+'()':'复杂接收者调用';
      const args=direct(inv,'argumentList'); const arity=args?nodes(args,'expression').length:0;
      let target:Method|undefined; let reason='外部、生成或复杂接收者的运行目标未解析。';
      const self=valid&&(receiver===''||receiver==='this');
      const sameCandidates=self?method.owner.methods.filter(m=>m.name===methodName&&m.arity===arity):[];
      if(self&&!deferred&&sameCandidates.length===1) target=sameCandidates[0];
      if(sameCandidates.length>1) reason='同名同参数个数重载需要完整类型解析；不选择猜测目标。';
      if(deferred) reason='Lambda 延迟执行：静态出现不等于外层方法立即调用。';
      result.flows.push({id:`flow_${hash(method.signature,primary.location.startOffset,inv.location.startOffset,unit.source.digest)}`,from:method.signature,...(target?{to:target.signature}:{}),label,resolution:target?'resolved':'unknown',...(target?{}:{reason}),evidenceIds:[callEvidence,...(target?[ev(unit,target.header,'declaration')]:[])]});
      if(!target) diag(unit,'JAVA_CALL_UNRESOLVED',reason,undefined,primary);
      if(self&&methodName&&sameCandidates.some(m=>m.annotations.some(a=>a.full===TX))) {
        if(!target) diag(unit,'JAVA_TRANSACTION_TARGET_UNKNOWN','事务候选目标存在，但重载或延迟执行超出规则范围。','TX_SELF_INVOCATION',primary);
        else if(target!==method) {
          const annotation=target.annotations.find(a=>a.full===TX)!;
          finding('TX_SELF_INVOCATION','spring.transaction-proxy','同类调用需要核对事务代理边界',`${method.signature} 直接调用本类 ${target.signature}；目标方法标有 Spring @Transactional。`,method.signature,
            [callEvidence,ev(unit,annotation.node,'annotation'),ev(unit,target.header,'declaration')],
            ['适用于 Spring 基于代理的事务拦截模式，且对象由容器管理。','关注的是目标方法注解的拦截边界；调用者可能已经处于事务中。'],
            ['没有解析运行时 Bean 绑定、AspectJ weaving、事务管理器或传播配置。','不据此断言事务完全失效或写入未回滚。'],
            '通过真实 Bean 的外部入口测试回滚/传播行为；检查自调用是否绕过所需代理。');
        }
      } else if(self&&sameCandidates.some(m=>uncertainAnnotation(m.annotations,'Transactional'))) diag(unit,'JAVA_TRANSACTION_ANNOTATION_UNRESOLVED','Transactional 注解没有唯一显式名称，规则前提 unknown。','TX_SELF_INVOCATION',primary);
      if(!loop||!valid||!methodName) continue;
      const simpleReceiver=receiver.startsWith('this.')?receiver.slice(5):receiver;
      if(!simpleReceiver||simpleReceiver.includes('.')) continue;
      const explicitThis=receiver.startsWith('this.');
      const localVars=method.body?descendants(method.body,'localVariableDeclaration').flatMap(v=>typeFields(v,'localVariableType',[])):[];
      const shadow=explicitThis?undefined:[...method.parameters,...localVars].find(v=>v.name===simpleReceiver);
      const field=shadow??method.owner.fields.find(f=>f.name===simpleReceiver);
      if(!field) {diag(unit,'JAVA_RECEIVER_UNKNOWN','循环调用的接收者声明不可见；持久化身份 unknown。','JPA_CALL_IN_LOOP',primary);continue;}
      const declared=localType(field.type,unit); const fullType=resolveName(outerType(field.type),unit);
      const repo=declared?isRepository(declared):REPOSITORIES.has(fullType??'');
      const query=QUERY_NAMES.has(methodName)||methodName.startsWith('findBy')||methodName.startsWith('existsBy')||methodName.startsWith('countBy');
      if(deferred) {if(repo&&query) diag(unit,'JAVA_PERSISTENCE_DEFERRED_UNKNOWN','Repository 调用位于延迟 Lambda，未确定每次循环是否执行。','JPA_CALL_IN_LOOP',primary);continue;}
      if(!declared&&!repo) {diag(unit,'JAVA_REPOSITORY_TYPE_UNRESOLVED','接收者类型不在本地声明或显式 Repository 基类中；不猜测其持久化身份。','JPA_CALL_IN_LOOP',primary);continue;}
      if(repo&&query) {
        const evidenceIds=[callEvidence,ev(unit,loop,'loop'),ev(unit,field.node,'declaration'),...(declared?[ev(declared.file,declared.node,'declaration')]:[])];
        finding('JPA_CALL_IN_LOOP','jpa.query-amplification','循环内的持久化调用需要检查查询次数',`${method.signature} 的循环体调用 ${label}；接收者声明连接到支持的 Spring Data Repository 类型。`,method.signature,evidenceIds,
          ['循环实际多次迭代且每次到达该调用。','Repository 方法实际触发数据库访问时，调用次数才会放大。'],
          ['未测量 SQL 数量、缓存命中、批处理或 Repository 自定义实现。','这不是已确认 N+1，循环也可能只执行零次或一次。'],
          '用多条输入记录真实 SQL 次数与响应时间；比较批量查询、缓存或 join/fetch 方案。');
      }
    }
  }
  result.evidence=[...evidenceMap.values()].sort((a,b)=>a.path.localeCompare(b.path,'en')||a.start.offset-b.start.offset||a.id.localeCompare(b.id,'en'));
  result.facts.sort((a,b)=>a.qualifiedName.localeCompare(b.qualifiedName,'en')||a.id.localeCompare(b.id,'en'));
  result.findings.sort((a,b)=>a.ruleId.localeCompare(b.ruleId,'en')||a.id.localeCompare(b.id,'en'));
  result.flows.sort((a,b)=>a.id.localeCompare(b.id,'en'));
  result.diagnostics=[...new Map(result.diagnostics.map(d=>[JSON.stringify(d),d])).values()].sort((a,b)=>a.path.localeCompare(b.path,'en')||a.code.localeCompare(b.code,'en')||JSON.stringify(a).localeCompare(JSON.stringify(b),'en'));
  return result;
}
