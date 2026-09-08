import {describe,it,expect} from 'vitest';
import {assertReport, type AnalysisReport} from '../packages/protocol/index.js';
const sample = ():AnalysisReport => ({schemaVersion:'0.1',analysisId:'r1',createdAt:'2026-09-08',status:'complete',snapshot:{id:'snap',workspaceId:'w',files:[{path:'A.java',digest:'hash'}],gitHead:null,gitBase:null},coverage:{discovered:1,parsed:1,skipped:0,failed:0,unknown:0,reasons:[]},findings:[{id:'f1',ruleId:'r1',ruleVersion:'1',title:'check',severity:'medium',epistemic:'inference',evidenceIds:['e1'],conceptId:'c1',symbol:'A#run',assumptions:['proxy'],uncertainties:['runtime bean binding'],nextCheck:'verify'}],evidence:[{id:'e1',path:'A.java',digest:'hash',start:{line:1,column:1},end:{line:1,column:8},observation:'method',producer:'test'}],flows:[],summary:'test',diff:null,provenance:{engineVersion:'0.1.0',adapterVersion:'0.1',ruleSetVersion:'1',offline:true,llm:'disabled'},limitations:[]});
describe('canonical protocol',()=>{
  it('round-trips a versioned report',()=>expect(()=>assertReport(JSON.parse(JSON.stringify(sample())))).not.toThrow());
  it('rejects an unsupported version',()=>expect(()=>assertReport({...sample(),schemaVersion:'9'})).toThrow('协议'));
  it('rejects a valid-looking nonexistent evidence ref',()=>{const r=sample();r.findings[0].evidenceIds=['fake'];expect(()=>assertReport(r)).toThrow('证据');});
  it('rejects another source snapshot and traversal',()=>{const r=sample();r.evidence[0].digest='changed';expect(()=>assertReport(r)).toThrow();r.evidence[0].digest='hash';r.evidence[0].path='../secret';expect(()=>assertReport(r)).toThrow();});
  it('rejects invalid coordinates and duplicate finding IDs',()=>{const r=sample();r.evidence[0].start.line=0;expect(()=>assertReport(r)).toThrow();const s=sample();s.findings.push(s.findings[0]);expect(()=>assertReport(s)).toThrow();});
});
