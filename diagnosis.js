export const REQUIRED_FIELDS = ['organization_sector','audience','business_goal','observed_problem'];
export const FIELDS = [...REQUIRED_FIELDS,'work_actions','conditions_standards','metrics','constraints','kpi_name','kpi_baseline','kpi_target','kpi_period','kpi_method'];
export const CONCLUSIONS = new Set(['training','mixed','nontraining','insufficient']);
export const CERTAINTIES = new Set(['supported','tentative','insufficient']);
const CLIP = (x, max=1800) => (typeof x === 'string' ? x.trim().slice(0,max) : '');

export function validatePayload(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('INVALID_INPUT');
  const src = raw.questionnaire;
  if (!src || typeof src !== 'object' || Array.isArray(src)) throw new Error('INVALID_INPUT');
  const questionnaire = Object.fromEntries(FIELDS.map(k => [k, CLIP(src[k], 1400)]));
  for(const key of ['kpi_baseline','kpi_target']) {
    if(questionnaire[key] && (!Number.isFinite(Number(questionnaire[key])) || Number(questionnaire[key])<0 || Number(questionnaire[key])>100)) throw new Error('INVALID_KPI');
  }
  if (REQUIRED_FIELDS.some(k => !questionnaire[k])) throw new Error('REQUIRED_FIELDS_MISSING');
  const short_material_text = CLIP(raw.short_material_text, 4200);
  const sources = Array.isArray(raw.sources) ? raw.sources.slice(0,7).map((s,i) => ({
    id: /^S\d{2,3}$/.test(s?.id ?? '') ? s.id : `S${String(i+1).padStart(2,'0')}`,
    origin: ['source_document','customer_confirmed','user_input'].includes(s?.origin) ? s.origin : 'user_input',
    text: CLIP(s?.text,900)
  })).filter(x=>x.text) : [];
  if (short_material_text && !sources.some(s=>s.origin==='source_document') ) {
    sources.push({id:`S${String(sources.length+1).padStart(2,'0')}`,origin:'source_document',text:short_material_text.slice(0,900)});
  }
  const answers = Array.isArray(raw.customer_answers) ? raw.customer_answers.slice(0,8).map((a) => ({
    question: CLIP(a?.question,500), answer: CLIP(a?.answer,800)
  })).filter(a=>a.question && a.answer) : [];
  return {case_id:CLIP(raw.case_id,32)||'CUSTOM', questionnaire,short_material_text,sources, customer_answers:answers};
}

const safeArray=(x)=>Array.isArray(x)?x:[];
const limitedStrings=(x,n=8)=>safeArray(x).slice(0,n).map(v=>CLIP(v,800)).filter(Boolean);
const normFactors=(x,prefix,allowedSources)=>safeArray(x).slice(0,7).map((v,i)=>({
 id:CLIP(v?.id,16)||`${prefix}${i+1}`, statement:CLIP(v?.statement,800),
 source_ids:safeArray(v?.source_ids).filter(id=>allowedSources.has(id)).slice(0,6)
})).filter(v=>v.statement);

export function normalizeDiagnosis(raw,input) {
 if(!raw || typeof raw!=='object' || Array.isArray(raw)) throw new Error('BAD_MODEL_RESPONSE');
 const allowedSources=new Set((input.sources||[]).map(s=>s.id));
 let conclusion=CONCLUSIONS.has(raw.conclusion)?raw.conclusion:'insufficient';
 let certainty=CERTAINTIES.has(raw.certainty)?raw.certainty:'insufficient';
 const trainable_causes=normFactors(raw.trainable_causes,'T',allowedSources);
 const nontraining_factors=normFactors(raw.nontraining_factors,'N',allowedSources);
 const questions=safeArray(raw.questions).slice(0,8).map(q=>({
  audience:['customer','methodologist'].includes(q?.audience)?q.audience:'methodologist',
  question:CLIP(q?.question,500),reason:CLIP(q?.reason,450)
 })).filter(q=>q.question);
 // Не позволяем модели открыть дерево только на основе голословного вывода.
 const hasEvidence=trainable_causes.some(c=>c.source_ids.length>0);
 if (['training','mixed'].includes(conclusion) && (!trainable_causes.length || !hasEvidence || certainty!=='supported')) {
   conclusion='insufficient'; certainty='insufficient';
 }
 const eligible=['training','mixed'].includes(conclusion) && hasEvidence && certainty==='supported';
 return {
  case_id:input.case_id,
  business_goal:CLIP(raw.business_goal,900)||input.questionnaire.business_goal,
  performance_gap:CLIP(raw.performance_gap,1200)||input.questionnaire.observed_problem,
  conclusion,certainty,
  trainable_causes,nontraining_factors,
  hypotheses:limitedStrings(raw.hypotheses), questions,
  training_scope:eligible?limitedStrings(raw.training_scope,7):[],
  tree_eligibility:eligible?'eligible_after_human_approval':'blocked',
  summary:CLIP(raw.summary,1700),
  explanation: {
   facts:safeArray(raw.explanation?.facts).slice(0,5).map(f=>({
    statement:CLIP(f?.statement,600),
    source_ids:safeArray(f?.source_ids).filter(id=>allowedSources.has(id)).slice(0,5)
   })).filter(f=>f.statement && f.source_ids.length),
   reasoning:CLIP(raw.explanation?.reasoning,1500),
   uncertainty:CLIP(raw.explanation?.uncertainty,1000),
   next_step:CLIP(raw.explanation?.next_step,950)
  },
  // Важно: только действие человека в интерфейсе, AI не может устанавливать это значение.
  human_approved:false
 };
}
