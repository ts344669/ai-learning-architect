const FIELDS=['organization_sector','audience','business_goal','observed_problem','work_actions','conditions_standards','metrics','constraints'];
const REQUIRED=FIELDS.slice(0,4);
const KPIFIELDS=['kpi_name','kpi_baseline','kpi_target','kpi_period','kpi_method'];
const labels={training:'Обучение целесообразно',mixed:'Обучение — часть решения',nontraining:'Учебный дефицит не подтверждён',insufficient:'Недостаточно данных для заключения'};
const certaintyLabels={supported:'Есть основания по предоставленным данным',tentative:'Вывод предварительный',insufficient:'Требуется уточнение'};
const $=id=>document.getElementById(id);
const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const storageKey='ai-learning-architect-screen1-v09';
const state={cases:[],demos:[],currentCase:null,mode:null,diagnosis:null,aiReady:false,approved:false,stale:false,answers:{},sources:[]};
function feedback(message,good=false){$('feedback').textContent=message||'';$('feedback').className='feedback'+(good?' success':'');}
function store(){try{localStorage.setItem(storageKey,JSON.stringify({caseId:state.currentCase?.id,questionnaire:readForm(),short_material_text:$('short_material_text').value,answers:state.answers}));}catch{}}
function restore(){try{const d=JSON.parse(localStorage.getItem(storageKey)||'null');if(!d)return;for(const k of [...FIELDS,...KPIFIELDS])$(k).value=d.questionnaire?.[k]??'';$('short_material_text').value=d.short_material_text||'';state.answers=d.answers||{};renderSourceList();feedback('Черновик анкеты восстановлен из этого браузера.',true);}catch{}}
function readForm(){return Object.fromEntries([...FIELDS,...KPIFIELDS].map(k=>[k,$(k).value.trim()]));}
function hasRequired(){return REQUIRED.every(k=>!!$(k).value.trim());}
function setForm(answers,shortText){for(const k of [...FIELDS,...KPIFIELDS])$(k).value=answers[k]??'';$('short_material_text').value=shortText||'';}
function packageStatus(message,good=false){const el=$('packageStatus');if(!el)return;el.textContent=message;el.classList.toggle('success',good);}
function validateTeacherPackage(pkg){
 if(!pkg||pkg.package_type!=='ai_learning_architect_teacher_package'||pkg.schema_version!=='1.0')throw new Error('Это не учебный пакет AI Learning Architect v1.0.');
 if(!pkg.fictitious_data)throw new Error('Для портфолио-версии разрешены только пакеты с вымышленными данными.');
 if(!pkg.questionnaire||typeof pkg.questionnaire!=='object')throw new Error('В пакете отсутствует анкета.');
 for(const key of REQUIRED)if(!String(pkg.questionnaire[key]||'').trim())throw new Error(`В пакете не заполнено обязательное поле: ${key}.`);
 const text=String(pkg.short_material_text||'');if(text.length>4200)throw new Error('Короткий материал в пакете превышает 4200 знаков.');
 const sources=Array.isArray(pkg.sources)?pkg.sources.slice(0,8).map((x,i)=>({id:String(x?.id||`P${i+1}`).slice(0,20),origin:['source_document','customer_confirmed'].includes(x?.origin)?x.origin:'source_document',text:String(x?.text||'').slice(0,700)})).filter(x=>x.text):[];
 return {case_id:String(pkg.case_id||'PACKAGE').slice(0,40),title:String(pkg.title||'Учебный пакет').slice(0,140),questionnaire:pkg.questionnaire,kpi:pkg.kpi&&typeof pkg.kpi==='object'?pkg.kpi:{},short_material_text:text,sources};
}
async function loadTeacherPackage(file){
 if(!file)return;
 if(file.size>25000){packageStatus('Пакет слишком большой. Для демонстрации используйте файл до 25 КБ.');return;}
 try{
  const raw=await file.text();const pkg=validateTeacherPackage(JSON.parse(raw));
  resetLiveVisual();state.currentCase={id:pkg.case_id,title:pkg.title,fromPackage:true};state.sources=pkg.sources;state.diagnosis=null;state.mode=null;state.stale=false;state.approved=false;state.answers={};
  setForm({...pkg.questionnaire,...pkg.kpi},pkg.short_material_text);renderSourceList();fillCases();hideResult();store();
  packageStatus(`Загружен пакет «${pkg.title}». Анкета заполнена; теперь можно запустить живой AI-анализ.`,true);
  feedback('Учебный пакет загружен. Проверьте поля и нажмите «Проанализировать с AI».',true);
 }catch(err){packageStatus(`Не удалось загрузить пакет: ${err.message}`);}
 finally{$('teacherPackageInput').value='';}
}

function renderSourceList(){
 const container=$('sourceList');
 if(!state.sources.length){container.innerHTML='<span>Источник не выбран. Можно добавить свой короткий текст.</span>';return;}
 container.innerHTML='<span>Источники выбранного кейса: </span>'+state.sources.map(s=>`<span class="source-chip" title="${esc(s.text)}">${esc(s.id)} · ${s.origin==='customer_confirmed'?'ответ заказчика':'документ'}</span>`).join('');
}
function fillCases(){
 $('caseGrid').innerHTML=state.cases.map(c=>{
  const title=c.id==='C01'?'Учебный дефицит':c.id==='C02'?'Смешанная причина':'Неучебная проблема';
  const description=c.id==='C01'?'Менеджеры не выявляют потребности':c.id==='C02'?'Навыки + ограничения CRM':'Перепутана маркировка склада';
  return `<button type="button" class="case-card ${state.currentCase?.id===c.id?'selected':''}" data-case="${c.id}"><span>${c.id} · ТЕСТОВЫЙ КЕЙС</span><strong>${title}</strong><small>${description}</small></button>`;
 }).join('');
 for(const button of $('caseGrid').querySelectorAll('[data-case]'))button.addEventListener('click',()=>loadCase(button.dataset.case));
}
function loadCase(id){
 const item=state.cases.find(c=>c.id===id);if(!item)return;
 resetLiveVisual();state.currentCase=item;state.sources=item.sources.map(s=>({...s}));
 state.diagnosis=null;state.mode=null;state.stale=false;state.approved=false;state.answers={};
 setForm({...item.questionnaire,...(id==='C01'?{kpi_name:'Доля оплаченных заказов с дополнительным модулем',kpi_baseline:'12',kpi_target:'20',kpi_period:'1 квартал',kpi_method:'Количество оплаченных заказов с доп. модулем / все оплаченные заказы × 100%'}:{})},item.short_material_text);renderSourceList();fillCases();hideResult();
 feedback(`Загружен кейс ${id}. Для примера нажмите «Показать демо-результат», для настоящего запроса — «Проанализировать с AI».`,true);store();
}
function onChange(){
 if(visual.architecture && $('businessScenarios'))renderBusinessScenarios();
 if(state.currentCase){state.currentCase=null;fillCases();renderSourceList();}
 if(state.diagnosis){state.stale=true;state.approved=false;renderDiagnosis();resetLiveVisual();}
 store();
}
function element(id,html){$(id).innerHTML=html;}
function formatFactors(list){if(!list?.length)return '<p class="empty">Не выявлены по представленным сведениям</p>';return list.map(f=>`<div class="factor">${esc(f.statement)}${f.source_ids?.length?`<span class="source-ref">Основания: ${esc(f.source_ids.join(', '))}</span>`:''}</div>`).join('');}
function formatTexts(list,cls='factor'){return list?.length?list.map(s=>`<div class="${cls}">${esc(s)}</div>`).join(''):'<p class="empty">Нет данных для отображения</p>';}
const externalFactorBank=[{"category": "Мотивация и целевые показатели", "items": [{"title": "Денежная мотивация и премирование"}, {"title": "Нематериальная мотивация и признание"}, {"title": "Реалистичность планов и нормативов"}, {"title": "Противоречия между KPI"}, {"title": "Заинтересованность сотрудников в результате"}]}, {"category": "Нагрузка и организация труда", "items": [{"title": "Рабочая нагрузка и переработки"}, {"title": "Дополнительные обязанности"}, {"title": "Дефицит времени на основные задачи"}, {"title": "Численность и распределение персонала"}, {"title": "График работы и восстановление"}]}, {"category": "Процессы, технологии и ресурсы", "items": [{"title": "Работа CRM и других систем"}, {"title": "Ручной ввод и дублирование информации"}, {"title": "Техническая поддержка"}, {"title": "Доступность инструментов и ресурсов"}, {"title": "Регламенты, согласования и полномочия"}]}, {"category": "Руководство и команда", "items": [{"title": "Качество обратной связи руководителя"}, {"title": "Взаимоотношения с руководством"}, {"title": "Отношения и конфликты в команде"}, {"title": "Рабочая атмосфера и эмоциональное состояние"}, {"title": "Поддержка инициатив и изменений"}]}, {"category": "Продукт и внешние условия", "items": [{"title": "Качество и конкурентоспособность продукта"}, {"title": "Цена и коммерческие условия"}, {"title": "Качество клиентских обращений"}, {"title": "Спрос, сезонность и конкуренция"}]}, {"category": "Готовность сотрудников к обучению", "items": [{"title": "Исходный уровень знаний и навыков"}, {"title": "Предшествующий опыт обучения"}, {"title": "Мотивация и заинтересованность в обучении"}, {"title": "Готовность осваивать новые способы работы"}, {"title": "Цифровые навыки и владение инструментами"}, {"title": "Индивидуальный темп и потребность в поддержке"}]}, {"category": "Условия обучения и применения навыков", "items": [{"title": "Выделенное время на обучение"}, {"title": "Доступ к устройствам и учебным материалам"}, {"title": "Удобство формата и графика занятий"}, {"title": "Возможности для практики и закрепления"}, {"title": "Обратная связь и сопровождение"}, {"title": "Поддержка руководителя после обучения"}, {"title": "Доступность материалов и понятность языка обучения"}]}];
function renderExternalFactorBank(){
 const el=$('externalFactors');if(!el)return;
 el.innerHTML=externalFactorBank.map(group=>`<section class="ext-group"><h4>${esc(group.category)}</h4><div class="ext-items">${group.items.map(item=>`<div class="ext-question"><strong>${esc(item.title)}</strong></div>`).join('')}</div></section>`).join('');
}
function renderDiagnosticExplanation(d){
 const ex=d.explanation||{};
 const docs=(ex.facts||[]).filter(f=>f.statement);
 const factRows=docs.length?docs.map(f=>`<div class="evidence-line"><span class="source-key">${esc((f.source_ids||[]).join(', ')||'Без ссылки')}</span><span>${esc(f.statement)}</span></div>`).join(''):
 '<p class="empty">Дополнительный перечень фактов не представлен. Основания можно посмотреть в карточках учебных и неучебных факторов ниже.</p>';
 const cards=[
 ['01','Подтверждённые наблюдения',factRows,'facts'],
 ['02','Почему сделан такой вывод',`<p>${esc(ex.reasoning||'Отдельное объяснение не передано моделью. Используйте указанное заключение и просмотрите первичные основания.')}</p>`,'logic'],
 ['03','Границы достоверности',`<p>${esc(ex.uncertainty||'По одним входным материалам нельзя гарантировать причину разрыва и будущий бизнес-эффект. Уточните недостающие сведения.')}</p>`,'uncertain'],
 ['04','Что делает методолог дальше',`<p>${esc(ex.next_step||'Проверьте приведённые основания, получите необходимые ответы заказчика и только затем подтвердите диагностическое решение.')}</p>`,'next']
 ];
 element('diagnosticExplanation',cards.map(c=>`<section class="explanation-card ${c[3]}"><h4><span>${c[0]}</span>${c[1]}</h4>${c[2]}</section>`).join(''));
}

function addCustomerAnswerListeners(){for(const el of document.querySelectorAll('[data-answer]')){
 el.addEventListener('input',()=>{state.answers[el.dataset.answer]=el.value;store();});
}}
function renderDiagnosis(){
 const d=state.diagnosis;if(!d){hideResult();return;}
 $('resultPanel').classList.remove('hidden');
 $('resultMode').textContent=state.mode==='live_ai'?'ЖИВОЙ AI-АНАЛИЗ':'ДЕМО · ЗАРАНЕЕ ПОДГОТОВЛЕНО';
 element('resultStatus',`<span class="outcome ${esc(d.conclusion)}">${esc(labels[d.conclusion]||'Нужны уточнения')}</span>`);
 $('resultCertainty').textContent=certaintyLabels[d.certainty]||'Статус не определён';
 $('resultGoal').textContent=d.business_goal||$('business_goal').value;
 $('resultGap').textContent=d.performance_gap||$('observed_problem').value;
 $('resultSummary').textContent=d.summary||'Диагностическое заключение представлено ниже. Статус основан только на данных тестового примера.';
 renderDiagnosticExplanation(d);
 renderExternalFactorBank();
 element('trainingFactors',formatFactors(d.trainable_causes));
 element('nontrainingFactors',formatFactors(d.nontraining_factors));
 const hypotheses=d.hypotheses||[];
 $('hypothesesBlock').classList.toggle('hidden',hypotheses.length===0);
 element('hypotheses',formatTexts(hypotheses));
 const questions=d.questions||[];
 element('questions',questions.length?questions.map((q,i)=>{
  const key=String(i);return `<div class="question"><span class="pill ${q.audience==='methodologist'?'methodologist':''}">${q.audience==='customer'?'Вопрос заказчику':'Вопрос методологу'}</span><strong>${esc(q.question)}</strong><p>${esc(q.reason||'')}</p><textarea rows="2" class="answer-input" data-answer="${key}" placeholder="Ответ можно внести после разговора с заказчиком…">${esc(state.answers[key]||'')}</textarea></div>`;
 }).join(''):'<p class="empty">На этом этапе уточняющих вопросов нет.</p>');
 addCustomerAnswerListeners();
 const scope=d.training_scope||[];$('scopeBlock').classList.toggle('hidden',scope.length===0);
 element('trainingScope',scope.map(s=>`<span class="scope-item">${esc(s)}</span>`).join(''));
 const allowed=d.tree_eligibility==='eligible_after_human_approval' && ['training','mixed'].includes(d.conclusion) && !state.stale;
 $('approveBtn').disabled=!allowed||state.approved;
 $('approveBtn').textContent=state.approved?'✓ Диагностика подтверждена':'Подтвердить диагностику';
 if(state.stale){
  element('approvalInfo','<div class="stale">После последней диагностики анкета была изменена. Старое заключение не может быть подтверждено. Запустите анализ повторно.</div>');
 }else if(!allowed){
  element('approvalInfo','<strong>Дерево обучения недоступно</strong><p>Подтверждённого учебного дефицита нет или необходимо уточнение. AI не должен создавать курс автоматически.</p>');
 }else{
  element('approvalInfo','<strong>Решение методолога</strong><p>Проверьте выводы и основания. Подтверждение — ваше профессиональное решение, а не действие AI.</p>');
 }
 $('afterApproval').classList.toggle('hidden',!state.approved);
 if(state.approved)element('afterApproval',state.mode==='live_ai'?'✓ Диагностика подтверждена. <button type="button" class="btn primary" data-go-screen="2">К созданию дерева с AI →</button>':'✓ Демонстрационная диагностика подтверждена. <button type="button" class="btn secondary" data-go-screen="2">Посмотреть демонстрационное дерево →</button><p>Чтобы построить собственное дерево, запустите живую диагностику с AI.</p>');
}
function hideResult(){$('resultPanel').classList.add('hidden');}
function showExample(){
 if(!state.currentCase){feedback('Сначала выберите один из трёх тестовых кейсов.');return;}
 const d=state.demos.find(x=>x.case_id===state.currentCase.id);
 if(!d){feedback('Для этого кейса нет подготовленного примера.');return;}
 resetLiveVisual();state.diagnosis={...d, business_goal:$('business_goal').value,performance_gap:$('observed_problem').value,
  hypotheses:[], training_scope:d.trainable_causes.map(x=>x.statement), summary:'Учебный контрольный пример: заключение подготовлено заранее на основании вымышленных документов. Ниже можно открыть логику вывода, ограничения и источники. Это не ответ AI.'};
 state.mode='demo';state.stale=false;state.approved=false;state.answers={};renderDiagnosis();
 feedback('Показан контрольный пример. Чтобы проверить реальную работу модели, используйте кнопку «Проанализировать с AI».',true);
 $('resultPanel').scrollIntoView({behavior:'smooth',block:'start'});
}
async function requestAI(e){
 e.preventDefault();
 if(!hasRequired()){feedback('Заполните четыре основных поля анкеты.');for(const k of REQUIRED){if(!$(k).value.trim()){$(k).focus();break;}}return;}
 if(!state.aiReady){feedback('Живой AI ещё не подключён: добавьте OPENROUTER_API_KEY в настройки Render. Пока можно посмотреть демо-результат.');return;}
 const customer_answers=(state.diagnosis?.questions||[]).map((q,i)=>({question:q.question,answer:state.answers[String(i)]||''})).filter(a=>a.answer);
 const body={case_id:state.currentCase?.id||'CUSTOM',questionnaire:readForm(),short_material_text:$('short_material_text').value, sources:state.sources, customer_answers};
 $('analyzeBtn').disabled=true;$('analyzeBtn').textContent='AI анализирует задачу…';feedback('Запрос отправлен. Формируем диагностическое заключение…',true);
 try{
  const response=await fetch('/api/diagnose',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json();
  if(!response.ok)throw new Error(data.message||`Ошибка запроса (${response.status})`);
  resetLiveVisual();state.diagnosis=data.diagnosis;state.mode='live_ai';state.stale=false;state.approved=false;state.answers={};renderDiagnosis();
  feedback('AI-диагностика завершена. Проверьте заключение и вопросы заказчику.',true);
  $('resultPanel').scrollIntoView({behavior:'smooth',block:'start'});
 }catch(err){feedback(`Не удалось выполнить AI-анализ: ${err.message}`);}
 finally{$('analyzeBtn').disabled=false;$('analyzeBtn').textContent='✦ Проанализировать с AI';}
}
function approve(){
 if(!state.diagnosis||state.stale||state.diagnosis.tree_eligibility!=='eligible_after_human_approval')return;
 state.approved=true;renderDiagnosis();
}
function reset(){
 if(!confirm('Очистить анкету и результаты диагностики?'))return;
 resetLiveVisual();state.currentCase=null;state.sources=[];state.diagnosis=null;state.mode=null;state.stale=false;state.approved=false;state.answers={};
 setForm({},'');renderSourceList();fillCases();hideResult();feedback('Анкета очищена.',true);store();
}
async function initialize(){
 const [cases,demo,status]=await Promise.allSettled([
  fetch('/cases.json').then(r=>r.json()),fetch('/demo-results.json').then(r=>r.json()),fetch('/api/status').then(r=>r.json())
 ]);
 if(cases.status==='fulfilled')state.cases=cases.value.cases||[];
 if(demo.status==='fulfilled')state.demos=demo.value.diagnoses||[];
 fillCases();renderSourceList();restore();
 bindPreviewNavigation();
 await loadVisualExamples();
 $('generateTreeBtn')?.addEventListener('click',generateTree);$('runAuditBtn')?.addEventListener('click',runLiveAudit);updateLiveLabels();
 if(status.status==='fulfilled'){
  state.aiReady=Boolean(status.value.ai_enabled);updateLiveLabels();
  $('connection').classList.toggle('online',state.aiReady);
  $('connection').innerHTML=`<i></i> ${state.aiReady?'Живой AI подключён':'Демо-режим · AI не подключён'}`;
 }else{$('connection').innerHTML='<i></i> Нет соединения с сервером';}
 for(const id of [...FIELDS,...KPIFIELDS,'short_material_text'])$(id).addEventListener('input',onChange);
 $('diagnosisForm').addEventListener('submit',requestAI);
 $('showExampleBtn').addEventListener('click',showExample);
 $('teacherPackageInput')?.addEventListener('change',e=>loadTeacherPackage(e.target.files?.[0]));
 $('approveBtn').addEventListener('click',approve);
 $('resetBtn').addEventListener('click',reset);
}
initialize().catch(()=>feedback('Не удалось загрузить приложение. Проверьте соединение с сервером.'));


// Visual-only examples for screens 2–4. Never label fixtures as live AI results.
const visual={architecture:null,audit:null,demoArchitecture:null,demoAudit:null,branch:0,screen:1,live:false,previousAudit:null};
function activateScreen(number){
  if(![1,2,3,4].includes(number))return;
  visual.screen=number;
  document.querySelectorAll('.screen-view').forEach(el=>el.classList.toggle('hidden',el.id!==`screen${number}`));
  document.querySelectorAll('.step[data-screen]').forEach(el=>{
    const selected=Number(el.dataset.screen)===number;
    el.classList.toggle('selected',selected);
    if(selected)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');
  });
  window.scrollTo({top:0,behavior:'smooth'});
}
function bindPreviewNavigation(){
  document.addEventListener('click',event=>{
    const btn=event.target.closest('[data-screen],[data-go-screen]');
    if(!btn)return;
    const screen=Number(btn.dataset.screen||btn.dataset.goScreen);
    activateScreen(screen);
  });
}
async function loadVisualExamples(){
  try{
    const [architecture,audit]=await Promise.all([
      fetch('/architecture-example.json').then(r=>{if(!r.ok)throw Error('architecture unavailable');return r.json()}),
      fetch('/audit-example.json').then(r=>{if(!r.ok)throw Error('audit unavailable');return r.json()})
    ]);
    visual.demoArchitecture=architecture;visual.demoAudit=audit;visual.architecture=architecture;visual.audit=audit;
    renderTreePreview();renderArchitecturePreview();renderAuditPreview();
  }catch(err){
    for(const id of ['treeBranches','architectureDetail','auditCriteria']){
      const el=$(id);if(el)el.textContent='Не удалось загрузить тестовый пример. Проверьте файлы сборки.';
    }
  }
}

function resetLiveVisual(){
 if(!visual?.live)return;
 visual.live=false;visual.architecture=visual.demoArchitecture;visual.audit=visual.demoAudit;visual.previousAudit=null;
 if(visual.architecture)renderTreePreview();if(visual.architecture)renderArchitecturePreview();if(visual.audit)renderAuditPreview();updateLiveLabels();
}
function updateLiveLabels(){
 const live=visual.live;
 for(const n of [2,3,4]){
  const tag=document.querySelector(`#screen${n} .preview-tag`);
  const notice=document.querySelector(`#screen${n} .demo-notice`);
  if(tag)tag.textContent=live?(n===4&&visual.audit?.type!=='live_ai'?'ОЖИДАЕТ AI-АУДИТ':'ЖИВОЙ AI · ВАШ ПРОЕКТ'):'ДЕМО · ЗАРАНЕЕ ПОДГОТОВЛЕНО';
  if(notice)notice.textContent=live?(n===4&&visual.audit?.type!=='live_ai'?'Это дерево и архитектура вашего проекта. Нажмите «Проверить с AI», чтобы получить новый аудит.':'Результат получен по текущей анкете и подтверждённой диагностике. Вы можете изменить текст карточек перед аудитом.'):'Показаны заранее подготовленные данные тестового кейса. Живой AI запускается отдельно после анализа и подтверждения диагностики.';
 }
 const generate=$('generateTreeBtn'),run=$('runAuditBtn');
 if(generate)generate.disabled=!(state.approved&&state.mode==='live_ai'&&!state.stale&&state.aiReady);
 if(run)run.disabled=!(live&&visual.architecture?.type==='live_ai'&&state.aiReady);
}
async function generateTree(){
 if(!(state.approved&&state.mode==='live_ai'&&!state.stale&&state.aiReady)){alert('Сначала выполните живую диагностику и подтвердите учебный дефицит.');return;}
 const btn=$('generateTreeBtn');btn.disabled=true;btn.textContent='AI проектирует дерево…';
 try{
  const resp=await fetch('/api/tree',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({human_approved:true,diagnosis:state.diagnosis,questionnaire:readForm()})});
  const data=await resp.json();if(!resp.ok)throw Error(data.message||data.error);
  visual.architecture=data.result;visual.live=true;visual.branch=0;visual.audit=null;visual.previousAudit=null;
  renderTreePreview();renderArchitecturePreview();resetAuditArea();updateLiveLabels();
  activateScreen(2);$('treeGoal').scrollIntoView({block:'center'});
 }catch(e){alert('Дерево не создано: '+e.message);}
 finally{btn.textContent='✦ Построить дерево и архитектуру с AI';updateLiveLabels();}
}
function resetAuditArea(){
 $('auditPercent').textContent='—';$('auditCompleteness').textContent='0 из 9';
 $('auditCriteria').innerHTML='<p>Аудит ещё не выполнен. Нажмите «Проверить с AI».</p>';
 $('criterionDetail').innerHTML='';$('auditFinding').innerHTML='';$('auditRecommendation').innerHTML='';
}
function updateCurrentDesign(){
 if(!visual.live||!visual.architecture)return;
 const ix=visual.branch,b=visual.architecture.tree.branches[ix],d=visual.architecture.learning_design[ix];
 for(const name of ['learning_outcome','practice_summary','evaluation_summary','transfer_summary','metric']){
  const el=document.querySelector(`[data-edit-branch="${name}"]`);if(el&&b)b[name]=el.value.trim().slice(0,850);
 }
 for(const name of ['practice','content','reinforcement']){
  const el=document.querySelector(`[data-edit-design="${name}"]`);if(el&&d)d[name]=el.value.trim().slice(0,850);
 }
 for(const name of ['method']){
  const el=document.querySelector(`[data-edit-evaluation="${name}"]`);if(el&&d)d.evaluation.method=el.value.trim().slice(0,850);
 }
 if(b&&d){renderTreePreview();renderArchitecturePreview();visual.audit=null;resetAuditArea();updateLiveLabels();}
}
async function runLiveAudit(){
 if(!visual.live||!state.aiReady)return;
 const btn=$('runAuditBtn');btn.disabled=true;btn.textContent='AI проверяет связность…';
 try{
  const resp=await fetch('/api/audit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({architecture:visual.architecture,questionnaire:readForm()})});
  const data=await resp.json();if(!resp.ok)throw Error(data.message||data.error);
  if(visual.audit?.type==='live_ai')visual.previousAudit=structuredClone(visual.audit);
  visual.audit=data.result;visual.criterion='assessment';renderAuditPreview();updateLiveLabels();
  const c=$('auditComparison');if(c&&visual.previousAudit){
   const pct=a=>{const vals=Object.values(a.criterion_statuses_example).filter(v=>v!=='na');return vals.length?Math.round(100*vals.reduce((sum,v)=>sum+(v==='pass'?1:v==='partial'?.5:0),0)/vals.length):null};
   c.textContent=`Было: ${pct(visual.previousAudit)??'н/д'}% · Стало: ${pct(visual.audit)??'н/д'}%. Сравнение методической связности по доступным данным, не KPI.`;
  }
 }catch(e){alert('AI-аудит не выполнен: '+e.message);}
 finally{btn.textContent='✦ Проверить архитектуру с AI';updateLiveLabels();}
}
function businessInput(){
 const n=Number($('kpi_baseline')?.value),t=Number($('kpi_target')?.value);
 const has=(v)=>String(v??'').trim()!=='';
 const demo=visual.live?{}:(visual.architecture?.business_metric||{});
 const name=$('kpi_name')?.value.trim()||demo.label||'Бизнес-показатель (уточнить у заказчика)';
 const b=has($('kpi_baseline')?.value)&&Number.isFinite(n)&&n>=0&&n<=100?n:null;
 const target=has($('kpi_target')?.value)&&Number.isFinite(t)&&t>=0&&t<=100?t:null;
 return {name,baseline:b,target,period:$('kpi_period')?.value.trim()||'Не задан',method:$('kpi_method')?.value.trim()||'Не согласована'};
}
function formatted(v){return v===null?'Не задано':`${Number(v.toFixed(1))}%`}
function renderTreePreview(){
 const t=visual.architecture?.tree;if(!t)return;
 $('treeGoal').textContent=t.business_goal;
 $('treeWorkResult').textContent=t.work_result;
 $('treeNumericOverview').innerHTML=t.branches.map((b,i)=>`<article class="glance-card"><div class="glance-card-heading"><span class="glance-branch">ВЕТКА ${i+1}</span><strong>${esc(b.work_action)}</strong></div><div class="glance-figures"><div><small>ЧТО МЕНЯЕМ В РАБОТЕ</small><strong class="glance-text">${esc(b.numeric_work_metric?.label||b.metric)}</strong><span>Измеряем поведение на рабочем месте</span></div><div><small>ИСХОДНОЕ НАБЛЮДЕНИЕ</small><strong>${b.numeric_work_metric?.baseline_percent===null?'Нет данных':`${esc(b.numeric_work_metric.baseline_percent)}%`}</strong><span>Условная учебная выборка, не вклад в KPI</span></div></div></article>`).join('');
 $('treeBranches').innerHTML=t.branches.map((b,i)=>`<article class="branch-card detailed-branch"><div class="branch-head"><span class="branch-bubble">${i+1}</span><h3>${esc(b.work_action)}</h3></div>
 <div class="gap-evidence"><small>НАБЛЮДАЕМЫЙ ДЕФИЦИТ · ${esc(b.source_ids?.join(', ')||'источник не указан')}</small><p>${esc(b.detected_gap||'Требует уточнения')}</p></div>
 <div class="branch-reason"><small>ЗАЧЕМ НУЖНА ИМЕННО ЭТА ВЕТКА</small><p>${esc(b.methodological_reason||'Связь с диагностикой требуется подтвердить.')}</p></div>
 <div class="branch-step"><small>ПРОВЕРЯЕМЫЙ РЕЗУЛЬТАТ ОБУЧЕНИЯ</small><b>${esc(b.learning_outcome)}</b><p><strong>Условие:</strong> ${esc(b.performance_condition||'Не определено')}</p></div>
 <div class="branch-row"><div class="branch-step lilac"><small>ТРЕНИРОВКА</small><b>${esc(b.practice_summary)}</b></div><div class="branch-step cyan"><small>СПОСОБ ОЦЕНКИ</small><b>${esc(b.evaluation_summary)}</b></div></div>
 <section class="mastery-panel"><div class="mastery-panel-head"><div><small>ПРОВЕРЯЕМЫЕ ПРИЗНАКИ ОСВОЕНИЯ · БЕЗ УСЛОВНЫХ БАЛЛОВ</small><h4>Сотрудник демонстрирует действие в новой ситуации</h4></div></div>
 <div class="rubric-criteria">${(b.numeric_evaluation?.criteria||b.observable_indicators||[]).map((c,j)=>`<div class="rubric-item"><span class="rubric-ordinal">${j+1}</span><div><strong>${esc(c)}</strong></div></div>`).join('')}</div><p class="numeric-hint">Критерии наблюдаемы. Порог достаточного выполнения, выборку и условия оценки необходимо согласовать с заказчиком.</p></section>
 <div class="branch-transfer"><div><small>ПЕРЕНОС В РАБОТУ</small><p>${esc(b.transfer_summary)}</p></div><div><small>РАБОЧАЯ МЕТРИКА</small><p><strong>${esc(b.numeric_work_metric?.label||b.metric)}</strong></p><div class="metric-mini"><div><span>ИСХОДНО</span><b>${b.numeric_work_metric?.baseline_percent===null?'Нет данных':`${esc(b.numeric_work_metric.baseline_percent)}%`}</b></div><div><span>ЦЕЛЬ</span><b>Согласовать</b></div></div><p class="metric-note">${esc(b.numeric_work_metric?.note||'Методику оценки определяет заказчик.')}</p></div></div>
 <div class="branch-meta">Ветка ${esc(b.branch_id)} · Основания: ${esc(b.source_ids?.join(', ')||'не указаны')} · Результаты не гарантируют достижение бизнес-KPI</div></article>`).join('');
 renderBusinessScenarios();
}
function renderBusinessScenarios(){
 const el=$('businessScenarios');if(!el)return; const b=businessInput();
 const delta=b.baseline!==null&&b.target!==null?Number((b.target-b.baseline).toFixed(1)):null;
 el.innerHTML=`<div class="scenario-head"><div><small>БИЗНЕС-KPI · ЗАДАЁТ ЗАКАЗЧИК</small><h3>${esc(b.name)}</h3></div><span>Срок: ${esc(b.period)}</span></div>
 <div class="kpi-display-grid"><div><small>СЕЙЧАС</small><strong>${formatted(b.baseline)}</strong></div><div><small>ЦЕЛЬ ЗАКАЗЧИКА</small><strong>${formatted(b.target)}</strong></div><div><small>РАЗРЫВ</small><strong>${delta===null?'—':`${delta>0?'+':''}${delta} п.п.`}</strong></div></div>
 <p class="scenario-warning"><strong>Метод измерения:</strong> ${esc(b.method)}. Приложение не назначает целевые KPI и не рассчитывает эффект обучения без подтверждённых допущений. Ключевое изменение — рабочее поведение; влияние на бизнес-KPI возможно, но не гарантируется.</p>
 <details class="scenario-assumptions"><summary>Построить условный сценарий по допущению заказчика (не AI-прогноз)</summary><p>Введите предполагаемый прирост в процентных пунктах. Значение используется только для арифметического сценария и не является доказанным эффектом обучения.</p><div class="assumption-inputs"><label>Нижняя граница, п.п.<input id="assumptionLow" type="number" min="-100" max="100" step="0.5" placeholder="например, 2"></label><label>Верхняя граница, п.п.<input id="assumptionHigh" type="number" min="-100" max="100" step="0.5" placeholder="например, 5"></label><button type="button" class="btn secondary" id="calculateScenario">Посчитать</button></div><div id="scenarioResult" class="scenario-result" aria-live="polite">Без исходных допущений прогноз не строится.</div></details>`;
 $('calculateScenario').addEventListener('click',()=>{
  const low=$('assumptionLow').value,high=$('assumptionHigh').value;
  const l=Number(low),u=Number(high);
  if(b.baseline===null||b.target===null){$('scenarioResult').textContent='Заказчик должен сначала указать исходный и целевой KPI.';return;}
  if(low===''||high===''||!Number.isFinite(l)||!Number.isFinite(u)||l>u||Math.abs(l)>100||Math.abs(u)>100){$('scenarioResult').textContent='Введите корректные границы диапазона в процентных пунктах.';return;}
  const s1=b.baseline+l,s2=b.baseline+u;
  if(s1<0||s2>100){$('scenarioResult').textContent='Диапазон приводит к показателю вне 0–100%. Измените допущения.';return;}
  $('scenarioResult').textContent=`Условный сценарий: ${Number(s1.toFixed(1))}–${Number(s2.toFixed(1))}% при заданном допущении ${l>0?'+':''}${l}…${u>0?'+':''}${u} п.п. Остаточный разрыв до цели заказчика: ${Number((b.target-s2).toFixed(1))}…${Number((b.target-s1).toFixed(1))} п.п. Это не прогноз AI, не эффект, доказанно вызванный обучением, и не гарантия достижения цели.`;
 });
}
function renderArchitecturePreview(){
 const t=visual.architecture;if(!t)return; const branches=t.tree.branches;
 $('architectureTabs').innerHTML=branches.map((b,i)=>`<button class="arch-tab ${visual.branch===i?'selected':''}" type="button" data-arch-index="${i}"><span>РЕЗУЛЬТАТ ${i+1}</span><strong>${esc(b.work_action)}</strong></button>`).join('');
 for(const button of $('architectureTabs').querySelectorAll('[data-arch-index]'))button.addEventListener('click',()=>{visual.branch=Number(button.dataset.archIndex);renderArchitecturePreview()});
 const b=branches[visual.branch],d=t.learning_design.find(x=>x.branch_id===b.branch_id);if(!d)return;
 const groups=[['▣','Контент',d.content],['⚙','Практика',d.practice],['⇄','Закрепление',d.reinforcement],['☑','Оценка',`${d.evaluation.method}. Критерии: ${d.evaluation.observable_criteria.join('; ')}`],['↗','Перенос в работу',d.transfer.method]];
 $('architectureDetail').innerHTML=`<div class="arch-detail-heading"><div class="arch-heading-icon">◎</div><div><p>УЧЕБНОЕ РЕШЕНИЕ · ${esc(b.branch_id)}</p><h3>${esc(b.learning_outcome)}</h3></div></div>
 <div class="learning-chain">${groups.map(g=>`<div class="learning-unit"><span class="unit-icon">${g[0]}</span><h4>${g[1]}</h4><p>${esc(g[2])}</p></div>`).join('')}</div>
 <section class="architecture-criteria"><div class="arch-criteria-title"><div><small>КРИТЕРИИ ОЦЕНКИ УЧЕБНОГО РЕЗУЛЬТАТА</small><h4>Проверка выполнения действия, без произвольных баллов</h4></div></div><div class="arch-rubric-items">${(b.numeric_evaluation?.criteria||[]).map((c,i)=>`<div><strong>${i+1}. ${esc(c)}</strong><span>Наблюдаемое действие</span></div>`).join('')}</div><p>Числовые пороги результата обучения и выборку определяет заказчик. Само приложение не придумывает норму.</p></section>
 <div class="arch-numeric"><div><small>ОЦЕНКА ОБУЧЕНИЯ</small><strong>На практике</strong><span>Демонстрация действия в новых ситуациях</span></div><div><small>РАБОЧАЯ МЕТРИКА</small><strong>${b.numeric_work_metric?.baseline_percent===null?'База не измерена':`${esc(b.numeric_work_metric.baseline_percent)}%`}</strong><span>${esc(b.numeric_work_metric?.label)}</span></div></div>
 <p class="arch-caution">Освоение навыков не гарантирует целевой KPI. На результат влияют нагрузка, мотивация, CRM, руководство, условия обучения и рынок.</p>
 <div class="arch-context"><strong>Требует согласования:</strong> ${esc(d.missing_info.join('; ')||'дополнительных вопросов нет')}. Ответственный за перенос не назначается приложением.</div>${visual.live?`<section class="live-edit"><h4>✎ Редактировать учебное решение</h4><p>Измените формулировки и сохраните. После правок требуется повторный AI-аудит.</p>${[['learning_outcome','Результат обучения'],['practice_summary','Практика в дереве'],['evaluation_summary','Оценка в дереве'],['transfer_summary','Перенос'],['metric','Рабочая метрика']].map(([k,l])=>`<label>${l}<textarea data-edit-branch="${k}" rows="2">${esc(b[k])}</textarea></label>`).join('')}${[['practice','Практика в архитектуре'],['content','Контент'],['reinforcement','Закрепление']].map(([k,l])=>`<label>${l}<textarea data-edit-design="${k}" rows="2">${esc(d[k])}</textarea></label>`).join('')}<label>Способ оценки<textarea data-edit-evaluation="method" rows="2">${esc(d.evaluation.method)}</textarea></label><button id="saveDesignBtn" class="btn primary" type="button">Сохранить изменения</button></section>`:''}`;
 if(visual.live)$('saveDesignBtn')?.addEventListener('click',updateCurrentDesign);
}
const criterionNames={
 business_alignment:'Бизнес-связь',actions:'Рабочие действия',outcomes:'Результаты обучения',practice:'Практика',
 content:'Необходимый контент',reinforcement:'Закрепление',assessment:'Оценка',transfer_and_metric:'Перенос и метрика',company_context:'Контекст компании'
};
function renderAuditDetail(criterionId){
 const audit=visual.audit;if(!audit)return;
 const detail=audit.criterion_details?.[criterionId];
 if(!detail)return;
 const status=audit.criterion_statuses_example[criterionId];
 const names={pass:'Соответствует',partial:'Частично',gap:'Методический разрыв',na:'Недостаточно данных'};
 $('criterionDetail').innerHTML=`<div class="criterion-detail-heading"><span class="detail-status ${esc(status)}">${esc(names[status]||'—')}</span><h3>${esc(criterionNames[criterionId]||criterionId)}</h3></div>
 <p class="audit-numeric-caption">Оценка методической связности: <b>${status==='pass'?'1 из 1':status==='partial'?'0,5 из 1':status==='gap'?'0 из 1':'не оценивается'}</b>. Это оценка связности решения, а не балл сотрудника.</p>
 <div class="detail-sections">
 <div><small>ЧТО ПРОВЕРЯЕМ</small><p>${esc(detail.check)}</p></div>
 <div><small>ОСНОВАНИЕ ИЗ ПРИМЕРА</small><p>${esc(detail.basis)}</p></div>
 <div><small>ПОЧЕМУ ТАКОЙ СТАТУС</small><p>${esc(detail.interpretation)}</p></div>
 <div class="detail-next"><small>ЧТО ИСПРАВИТЬ ИЛИ УТОЧНИТЬ</small><p>${esc(detail.next)}</p></div>
 </div>`;
 $('auditCriteria').querySelectorAll('[data-audit-id]').forEach(btn=>{
  const selected=btn.dataset.auditId===criterionId;
  btn.classList.toggle('active',selected);
  btn.setAttribute('aria-expanded',selected?'true':'false');
 });
 visual.criterion=criterionId;
}
function renderAuditPreview(){
 const audit=visual.audit;if(!audit)return;
 const entries=Object.entries(audit.criterion_statuses_example);
 const graded=entries.filter(([,s])=>s!=='na');
 const earned=graded.reduce((sum,[,s])=>sum+(s==='pass'?1:s==='partial'?.5:0),0);
 const score=graded.length?Math.round(100*earned/graded.length):null;
 $('auditPercent').textContent=score===null?'—':score+'%';
 $('auditCompleteness').textContent=`${graded.length} из ${entries.length}`;
 const donut=document.querySelector('.score-donut');if(donut&&score!==null)donut.style.background=`conic-gradient(#159f41 0 ${score}%,#d7e6f7 ${score}% 100%)`;
 const labels={pass:['✓','Соответствует'],partial:['!','Частично'],gap:['×','Разрыв'],na:['?','Недостаточно данных']};
 $('auditCriteria').innerHTML=entries.map(([id,status])=>`<button type="button" class="criterion ${esc(status)}" data-audit-id="${esc(id)}" aria-controls="criterionDetail" aria-expanded="false"><span class="criterion-symbol">${labels[status]?.[0]||'?'}</span><span>${esc(criterionNames[id]||id)}</span><span class="criterion-number">${status==='pass'?'1 / 1':status==='partial'?'0,5 / 1':status==='gap'?'0 / 1':'Н/Д'}</span><span class="criterion-note">${labels[status]?.[1]||''}</span><span class="criterion-chevron" aria-hidden="true">›</span></button>`).join('');
 for(const btn of $('auditCriteria').querySelectorAll('[data-audit-id]'))btn.addEventListener('click',()=>renderAuditDetail(btn.dataset.auditId));
 renderAuditDetail(visual.criterion||'assessment');
 $('auditFinding').innerHTML=`<h3>✕ Методический разрыв</h3><p>${esc(audit.expected_finding.issue)}</p>`;
 $('auditRecommendation').innerHTML=`<h3>✦ Рекомендация для методолога</h3><p>${esc(audit.expected_finding.suggested_methodical_fix)}</p>`;
}
