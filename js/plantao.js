import { addDoc, arrayUnion, collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { carregarSrvCacheLocal } from "./administrativo.js";
import { carregarMunicoesCache, carregarViaturasCache, registrarMovMunicao } from "./armaria.js";
import { CHAVE_BH, COL_ARMAS_HIST, COL_ARMAS_IND, COL_BH, COL_COLETES, COL_COLETES_HIST, COL_EQUIPES, COL_ESCALA_MENSAL, COL_MUNICOES_HIST, COL_OC, COL_PAD, COL_PERMUTAS, COL_PLANTAO, COL_PLANTAO_FECHAMENTO, COL_SERV, COL_VIATURAS, JORNADA_PADRAO_HORAS_SAIDA, LIMITE_HORAS_EXTRAS_ALERTA, LIMITE_HORAS_SEM_AUTORIZACAO_SUPERIOR, LIMITE_SALDO_NEGATIVO_ALERTA, MARCACOES_LICENCA, MESES_PT, PRAZO_MINIMO_PERMUTA_DIAS, STATUS_EQUIPE_LABEL, STATUS_INFO, TURNO_HORARIOS, TURNO_LABEL, _atrasoModalAtual, _buscaHETimeout, _buscaPermutaTimeout, _destinatarioPermuta, _dheAprovadasMes, _diasMesAtual, _escalaHojeSrvIds, _escalaMesSrvIds, _heServidoresSelecionados, _justificativaForaEscala, _meuServidorPermuta, _meusPlantoesPermuta, _mpBhCacheCompleto, _mpBhDetalheOffset, _mpBhResumoAtualTexto, _mpPlantoesMesOffset, _plantoesDestinoPermuta, _secEquipesCache, _srvForaEscalaSelecionado, _viaturasCache, agora, alerta, ausenciaServidorSelecionado, auth, db, diaEditando, enviarNotificacao, equipamentosEntreguesCount, esc, escalaAnoAtual, escalaMesAtual, ir, normalizarMatricula, obterLocalizacao, plantaoNumeroAtual, plantaoStatusAtual, registrarAuditoria, registrosPlantaoLocal, saidaRegistroAberto, saidaServidorSelecionado, salvarAuditoria, servidorSelecionado, servidoresCache, tsStr, usuarioLogado, v } from "./core.js";
import { atualizarContadorOcPlantao, carregarOC, criarOcorrenciaAutomatica } from "./ocorrencias.js";

export async function carregarPlantaoAdmin(){
  const lista=document.getElementById("plantao-admin-lista");
  const cont=document.getElementById("plantao-admin-contador");
  lista.innerHTML='<p class="hist-vazio">Carregando...</p>';
  try{
    const filtNome=v("filtro-plantao-nome").toLowerCase(),filtData=v("filtro-plantao-data");
    const snap=await getDocs(query(collection(db,COL_PLANTAO),orderBy("criadoEm","desc")));
    let regs=snap.docs.map(d=>({id:d.id,...d.data()}));
    if(filtNome)regs=regs.filter(r=>r.servidorNome?.toLowerCase().includes(filtNome));
    if(filtData)regs=regs.filter(r=>r.data===filtData);
    cont.textContent=regs.length?`${regs.length} registro(s)`:"";
    lista.innerHTML=regs.length
      ?regs.map(r=>{const ic=r.status==="presente"?"✅":r.status==="ausente"?"❌":"⏰";
        return`<div class="hist-item">
          <div class="hist-tipo">${ic} ${r.status?.toUpperCase()}</div>
          <div class="hist-data">📅 ${r.data} · ${r.jornada||r.turno||""}</div>
          <div class="hist-data">🕐 Entrada: ${r.entrada||"—"} · Saída: ${r.saida||"—"}</div>
          <div class="hist-usuario">👮 ${esc(r.servidorNome)} · Mat: ${esc(r.servidorMat)}</div>
          <div class="hist-corpo">${r.obs?"Obs: "+esc(r.obs)+"\n":""}${r.marcacao?"Marcação: "+esc(r.marcacao)+"\n":""}Supervisor: ${esc(r.supervisorNome)}\n🕐 Registrado: ${tsStr(r.criadoEm)}</div>
        </div>`;}).join("")
      :'<p class="hist-vazio">Nenhum registro.</p>';
  }catch(err){lista.innerHTML=`<p class="hist-vazio">Erro: ${err.message}</p>`;}
}

window.carregarPlantaoAdmin=carregarPlantaoAdmin;

export function gerarNumeroPlantao(dataStr){
  const ano=(dataStr||new Date().toISOString().slice(0,10)).slice(0,4);
  const seq=String(Math.floor(Math.random()*900000)+100000);
  return `${ano}-${seq}`;
}

export function atualizarNumeroPlantao(){
  const dataP=v("plantao-data")||new Date().toISOString().slice(0,10);
  plantaoNumeroAtual=gerarNumeroPlantao(dataP);
  const el=document.getElementById("plantao-numero-txt");
  if(el)el.textContent=plantaoNumeroAtual;
  const elOc=document.getElementById("ocp-numero-txt");
  if(elOc)elOc.textContent=plantaoNumeroAtual;
}
window.atualizarNumeroPlantao=atualizarNumeroPlantao;

export async function carregarRegistrosPlantaoHoje(){
  const dataP=v("plantao-data");
  if(!dataP)return;
  try{
    const snap=await getDocs(query(collection(db,COL_PLANTAO),where("data","==",dataP)));
    snap.docs.forEach(d=>{
      const p=d.data();
      const jornadaChave=p.jornada||"";
      registrosPlantaoLocal[`${p.servidorId}_${dataP}_${jornadaChave}`]={
        status:p.status,marcacao:p.marcacao,docId:d.id,
        autorizadoAssuncao:!!p.autorizadoAssuncao,
        confirmadoPeloServidor:!!p.confirmadoPeloServidor
      };
    });
  }catch(err){console.warn("Erro ao carregar registros do dia:",err.message);}
}

export async function iniciarPlantao(){
  const hoje=new Date().toISOString().slice(0,10);
  document.getElementById("plantao-data").value=hoje;
  document.getElementById("plantao-busca-nome").value="";
  document.getElementById("plantao-busca-mat").value="";
  document.getElementById("plantao-unidade").value="";
  document.getElementById("plantao-equipe").value="";
  document.getElementById("plantao-turno-periodo").value="12 horas";
  document.getElementById("plantao-inspetor").value=usuarioLogado?.nome||"";
  document.getElementById("plantao-previsto").value="07:00";
  document.getElementById("plantao-tolerancia").value="10";
  document.getElementById("marcacao-tipo").value="";
  document.getElementById("mark-obs").style.display="none";
  document.getElementById("mark-obs").value="";
  document.getElementById("plantao-fechamento-resumo").innerHTML="";
  equipamentosEntreguesCount=0;
  atualizarNumeroPlantao();
  atualizarContadorPlantao();
  atualizarContadorOcPlantao();
  obterLocalizacao();
  // carrega quem está escalado no mês (Administrativo) para filtrar/destacar a lista
  await carregarEscalaDoMes();
  // busca no Firestore o estado real dos registros de hoje antes de renderizar
  await carregarRegistrosPlantaoHoje();
  renderListaPlantao();
}

export async function carregarEscalaDoMes(){
  const hoje=new Date();
  const chave=chaveEscala(hoje.getFullYear(),hoje.getMonth());
  const diaHoje=String(hoje.getDate());
  _escalaMesSrvIds=new Set();_escalaHojeSrvIds=new Set();
  try{
    const snap=await getDoc(doc(db,COL_ESCALA_MENSAL,chave));
    if(snap.exists()){
      const dias=snap.data().dias||{};
      Object.entries(dias).forEach(([dia,entradas])=>{
        (entradas||[]).forEach(e=>{
          if(!e.srvId)return;
          _escalaMesSrvIds.add(e.srvId);
          if(dia===diaHoje)_escalaHojeSrvIds.add(e.srvId);
        });
      });
    }
  }catch(e){}
}

export function iniciarForaEscala(){
  document.getElementById("fe-busca-nome").value="";
  document.getElementById("fe-busca-mat").value="";
  document.getElementById("fe-servidores").innerHTML='<p class="hist-vazio">Digite nome ou matrícula para buscar.</p>';
  document.getElementById("fe-justificativa-wrap").style.display="none";
  document.getElementById("fe-justificativa").value="";
  _srvForaEscalaSelecionado=null;
}

export async function buscarServidorForaEscala(){
  const nome=v("fe-busca-nome").toLowerCase(),mat=v("fe-busca-mat").toLowerCase();
  const lista=document.getElementById("fe-servidores");
  document.getElementById("fe-justificativa-wrap").style.display="none";
  if(!nome&&!mat){lista.innerHTML='<p class="hist-vazio">Digite nome ou matrícula para buscar.</p>';return;}
  if(!servidoresCache.length){
    try{
      const snap=await getDocs(query(collection(db,COL_SERV),where("ativo","==",true)));
      servidoresCache=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.nome.localeCompare(b.nome));
    }catch(e){}
  }
  const achados=servidoresCache.filter(s=>
    (!nome||s.nome?.toLowerCase().includes(nome))&&(!mat||s.matricula?.toLowerCase().includes(mat)));
  lista.innerHTML=achados.length?achados.map(s=>`<div class="servidor-card" data-sid="${s.id}">
      <div class="sc-nome">${esc(s.nome)}${_escalaMesSrvIds.has(s.id)?' <span class="badge">já está na escala</span>':""}</div>
      <div class="sc-mat">Mat: ${esc(s.matricula)}${s.cargo?" · "+s.cargo:""}</div>
    </div>`).join(""):'<p class="hist-vazio">Nenhum servidor encontrado.</p>';
  lista.querySelectorAll(".servidor-card").forEach(card=>{
    card.addEventListener("click",()=>{
      const srv=servidoresCache.find(s=>s.id===card.dataset.sid);
      if(srv)selecionarServidorForaEscala(srv);
    });
  });
}
window.buscarServidorForaEscala=buscarServidorForaEscala;

export function selecionarServidorForaEscala(srv){
  _srvForaEscalaSelecionado=srv;
  document.getElementById("fe-servidor-selecionado").innerHTML=
    `<div class="hist-tipo">👤 ${esc(srv.nome)}</div><div class="hist-corpo">Matrícula: ${esc(srv.matricula)}${srv.cargo?" · "+srv.cargo:""}</div>`;
  document.getElementById("fe-justificativa-wrap").style.display="block";
}

export function continuarForaEscala(){
  if(!_srvForaEscalaSelecionado)return alerta("Selecione um servidor.","erro");
  const justificativa=v("fe-justificativa");
  if(!justificativa)return alerta("A justificativa é obrigatória para incluir alguém fora da escala.","erro");
  _justificativaForaEscala=justificativa;
  const srv=_srvForaEscalaSelecionado;
  ir("plantao");
  abrirModalPlantao(srv);
}
window.continuarForaEscala=continuarForaEscala;

export function toggleMarcacao(){
  const tipo=v("marcacao-tipo");
  document.getElementById("mark-obs").style.display=tipo?"block":"none";
}
window.toggleMarcacao=toggleMarcacao;

export async function buscarServidorPlantao(){
  const nome=v("plantao-busca-nome").toLowerCase(),mat=v("plantao-busca-mat").toLowerCase();
  const lista=document.getElementById("plantao-servidores");
  if(!nome&&!mat){renderListaPlantao();return;}
  if(!servidoresCache.length){
    try{
      // sem orderBy para evitar erro de índice
      const snap=await getDocs(query(collection(db,COL_SERV),where("ativo","==",true)));
      servidoresCache=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.nome.localeCompare(b.nome));
    }catch(err){lista.innerHTML=`<p class="hist-vazio">Erro: ${err.message}</p>`;return;}
  }
  const filtrados=servidoresCache.filter(s=>
    (!nome||s.nome?.toLowerCase().includes(nome))&&(!mat||s.matricula?.toLowerCase().includes(mat)))
    .filter(s=>!_escalaMesSrvIds.size||_escalaMesSrvIds.has(s.id));
  if(!filtrados.length){lista.innerHTML='<p class="hist-vazio">Nenhum servidor escalado encontrado com esse filtro. Use "Incluir servidor fora da escala" abaixo, se necessário.</p>';return;}
  renderCardsServidores(filtrados,lista);
}

export async function renderListaPlantao(){
  const lista=document.getElementById("plantao-servidores");
  if(!servidoresCache.length){
    try{
      const snap=await getDocs(query(collection(db,COL_SERV),where("ativo","==",true)));
      servidoresCache=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.nome.localeCompare(b.nome));
    }catch(err){lista.innerHTML=`<p class="hist-vazio">Erro ao carregar servidores.</p>`;return;}
  }
  if(!servidoresCache.length){lista.innerHTML='<p class="hist-vazio">Nenhum servidor cadastrado ainda.</p>';return;}
  const avisoEscala=document.getElementById("plantao-aviso-escala");
  let base=servidoresCache;
  if(_escalaMesSrvIds.size){
    base=servidoresCache.filter(s=>_escalaMesSrvIds.has(s.id));
    if(avisoEscala)avisoEscala.style.display="none";
  }else if(avisoEscala){
    avisoEscala.style.display="block";
  }
  renderCardsServidores(base,lista);
}

export function renderCardsServidores(servidores,lista){
  const dataP=v("plantao-data"),jornadaP=v("plantao-turno");
  // separa por status para mostrar registrados no topo
  const presentes=[],ausentes=[],atrasados=[],outros=[],pendentes=[];
  servidores.forEach(s=>{
    const reg=registrosPlantaoLocal[`${s.id}_${dataP}_${jornadaP}`];
    if(!reg)pendentes.push({...s,reg:null});
    else if(reg.status==="presente")presentes.push({...s,reg});
    else if(reg.status==="ausente")ausentes.push({...s,reg});
    else if(reg.status==="atrasado")atrasados.push({...s,reg});
    else outros.push({...s,reg});
  });
  const todos=[...presentes,...atrasados,...outros,...ausentes,...pendentes];
  const rotulos={presente:["✅ Assumiu","sc-presente"],ausente:["❌ Faltou","sc-ausente"],
    atrasado:["⏰ Atrasou","sc-atrasado"],dispensa:["🏳 Dispensa","sc-pendente"],
    substituicao:["🔁 Substituição","sc-atrasado"]};
  lista.innerHTML=todos.map(s=>{
    const reg=s.reg;
    let borderColor="rgba(201,168,76,.15)",bgColor="rgba(255,255,255,.05)",statusHtml;
    if(reg?.status==="presente"){borderColor="rgba(30,132,73,.5)";bgColor="rgba(30,132,73,.12)";}
    else if(reg?.status==="ausente"){borderColor="rgba(192,57,43,.5)";bgColor="rgba(192,57,43,.12)";}
    else if(reg?.status==="atrasado"||reg?.status==="substituicao"){borderColor="rgba(230,126,34,.5)";bgColor="rgba(230,126,34,.12)";}
    else if(reg?.status==="dispensa"){borderColor="rgba(96,165,250,.5)";bgColor="rgba(96,165,250,.12)";}
    const rot=reg?rotulos[reg.status]:null;
    statusHtml=rot?`<span class="sc-status ${rot[1]}">${rot[0]}</span>`:`<span class="sc-status sc-pendente">— pendente</span>`;
    // ação de autorização de assunção — aparece para qualquer status em que o servidor
    // compareceu ao plantão (Presente, Atrasado, Substituição, Dispensa); só não aparece
    // para quem está marcado como Ausente/Faltou
    let autorizacaoHtml="";
    if(reg?.status&&reg.status!=="ausente"&&reg?.docId){
      if(reg.confirmadoPeloServidor){
        autorizacaoHtml=`<div class="sc-autorizacao sc-assumido">🎖 Plantão assumido pelo servidor</div>`;
      }else if(reg.autorizadoAssuncao){
        autorizacaoHtml=`<div class="sc-autorizacao sc-aguardando">🔓 Autorizado — aguardando confirmação do servidor</div>`;
      }else{
        autorizacaoHtml=`<button class="btn btn-sm btn-dourado sc-autorizar-btn" data-docid="${reg.docId}" data-sid="${s.id}">🔓 Autorizar Assunção do Plantão</button>`;
      }
    }
    return`<div class="servidor-card" data-sid="${s.id}"
        style="border-color:${borderColor};background:${bgColor}${_escalaHojeSrvIds.has(s.id)?";box-shadow:0 0 0 1px rgba(201,168,76,.6) inset":""}">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><div class="sc-nome">${esc(s.nome)}${_escalaHojeSrvIds.has(s.id)?' <span class="badge" style="background:var(--dourado);color:#1a1a2e">📅 Escalado hoje</span>':""}</div><div class="sc-mat">Mat: ${esc(s.matricula)}${s.cargo?" · "+s.cargo:""}${s.equipe?" · Eq. "+s.equipe:""}</div></div>
        ${statusHtml}
      </div>
      ${autorizacaoHtml}
    </div>`;
  }).join("");
  lista.querySelectorAll(".sc-autorizar-btn").forEach(btn=>{
    btn.addEventListener("click",(ev)=>{
      ev.stopPropagation();
      autorizarAssuncaoPlantao(btn.dataset.docid,btn.dataset.sid);
    });
  });
  lista.querySelectorAll(".servidor-card").forEach(card=>{
    card.addEventListener("click",()=>{
      const srv=servidoresCache.find(s=>s.id===card.dataset.sid);
      if(srv)abrirModalPlantao(srv);
    });
  });
}

window.buscarServidorPlantao=buscarServidorPlantao;

export function calcularAtraso(previsto,entrada,toleranciaMin){
  if(!previsto||!entrada)return{atrasado:false,minutos:0};
  const [ph,pm]=previsto.split(":").map(Number),[eh,em]=entrada.split(":").map(Number);
  const diff=(eh*60+em)-(ph*60+pm);
  const tol=Number(toleranciaMin)||0;
  return diff>tol?{atrasado:true,minutos:diff}:{atrasado:false,minutos:Math.max(diff,0)};
}

export async function abrirModalPlantao(servidor){
  if(!v("plantao-data"))return alerta("Selecione a data.","erro");
  if(!v("plantao-turno"))return alerta("Selecione a jornada.","erro");
  servidorSelecionado=servidor;plantaoStatusAtual=null;

  // Cartão-resumo do servidor
  document.getElementById("modal-srv-nome-r").textContent=servidor.nome;
  document.getElementById("modal-srv-mat-r").textContent=servidor.matricula||"—";
  document.getElementById("modal-srv-equipe-r").textContent=servidor.equipe||servidor.unidade||"—";
  document.getElementById("modal-srv-situacao-r").textContent=servidor.situacao||"Ativo";
  document.getElementById("modal-srv-tel-r").textContent=servidor.telefone||"—";
  const fotoEl=document.getElementById("modal-srv-foto");
  if(servidor.foto){fotoEl.src=servidor.foto;fotoEl.style.display="block";}else fotoEl.style.display="none";
  document.getElementById("modal-srv-ultimo-r").textContent="Carregando...";
  try{
    const snap=await getDocs(query(collection(db,COL_PLANTAO),where("servidorMat","==",servidor.matricula)));
    const regs=snap.docs.map(d=>d.data()).sort((a,b)=>(b.data||"").localeCompare(a.data||""));
    document.getElementById("modal-srv-ultimo-r").textContent=regs.length?
      `${regs[0].data} · ${regs[0].status?.toUpperCase()||""}`:"Sem registros anteriores";
  }catch(e){document.getElementById("modal-srv-ultimo-r").textContent="—";}

  // Cálculo automático de atraso
  const previsto=v("plantao-previsto"),entradaP=v("plantao-entrada"),tol=v("plantao-tolerancia");
  _atrasoModalAtual=calcularAtraso(previsto,entradaP,tol);
  const badge=document.getElementById("modal-atraso-badge");
  if(_atrasoModalAtual.atrasado){
    badge.style.display="inline-block";
    badge.textContent=`🔶 Atrasado — ${_atrasoModalAtual.minutos} min`;
  }else{badge.style.display="none";}

  document.getElementById("modal-plantao-obs").value="";
  document.getElementById("modal-status-label").textContent="Selecione o status acima";
  document.getElementById("modal-status-label").style.color="var(--cinza)";
  ["presente","ausente","atrasado","dispensa","substituicao"].forEach(s=>
    document.getElementById("btn-conf-"+s)?.classList.remove("selecionado"));
  document.querySelectorAll("#equip-check-grid input[type=checkbox]").forEach(c=>c.checked=false);
  document.getElementById("modal-plantao").style.display="flex";

  // sugere automaticamente "Atrasou" se detectado atraso, sem travar a escolha do inspetor
  if(_atrasoModalAtual.atrasado)selecionarStatus("atrasado");
}

export function selecionarStatus(status){
  plantaoStatusAtual=status;
  ["presente","ausente","atrasado","dispensa","substituicao"].forEach(s=>
    document.getElementById("btn-conf-"+s)?.classList.remove("selecionado"));
  document.getElementById("btn-conf-"+status)?.classList.add("selecionado");
  const info=STATUS_INFO[status];
  const lbl=document.getElementById("modal-status-label");
  lbl.textContent=`${info.ic} ${info.label} selecionado`;lbl.style.color=info.cor;
}
window.selecionarStatus=selecionarStatus;

export async function confirmarPlantao(){
  if(!plantaoStatusAtual)return alerta("Selecione um status primeiro.","erro");
  const obs=v("modal-plantao-obs");
  const dataP=v("plantao-data"),jornadaP=v("plantao-turno");
  const entradaP=v("plantao-entrada"),saidaP=""; // "Hora Saída" foi removida daqui — o encerramento agora é feito só em "Registrar Saída"
  const previstoP=v("plantao-previsto"),tolP=v("plantao-tolerancia");
  const srv=servidorSelecionado;
  const marcacao=v("marcacao-tipo");
  const markObs=v("mark-obs");
  const unidade=v("plantao-unidade"),equipe=v("plantao-equipe"),
        turnoPeriodo=v("plantao-turno-periodo"),
        inspetor=v("plantao-inspetor");
  const equipamentos=Array.from(document.querySelectorAll("#equip-check-grid input:checked")).map(c=>c.value);
  const atrasoInfo=calcularAtraso(previstoP,entradaP,tolP);
  const agora_str=agora();
  try{
    const docRef=await addDoc(collection(db,COL_PLANTAO),{
      numeroPlantao:plantaoNumeroAtual,unidade,equipe,inspetor,turnoPeriodo,
      foraDaEscala:_escalaMesSrvIds.size>0&&!_escalaMesSrvIds.has(srv.id),
      justificativaForaEscala:_justificativaForaEscala||"",
      servidorId:srv.id,servidorNome:srv.nome,servidorMat:srv.matricula,
      servidorEmail:srv.email||"",cargo:srv.cargo||"",
      data:dataP,jornada:jornadaP,entrada:entradaP,saida:saidaP,horarioPrevisto:previstoP,
      status:plantaoStatusAtual,obs,marcacao,markObs,
      atrasoMinutos:atrasoInfo.minutos,atrasado:atrasoInfo.atrasado,
      equipamentos,
      geo:_geoPlantao,dispositivo:navigator.userAgent.substring(0,80),
      supervisorNome:usuarioLogado?.nome||"",supervisorMat:usuarioLogado?.matricula||"",
      supervisorEmail:usuarioLogado?.email||"",
      // dupla confirmação — assunção de plantão pelo próprio servidor
      autorizadoAssuncao:false,autorizadoPor:"",autorizadoPorUid:"",autorizadoEm:null,
      confirmadoPeloServidor:false,confirmadoUid:"",confirmadoNome:"",confirmadoEm:null,
      statusAssuncao:"aguardando_autorizacao",
      registradoEm:agora_str,criadoEm:serverTimestamp()
    });
    // auditoria
    await salvarAuditoria("Plantão — "+plantaoStatusAtual.toUpperCase(),
      `Plantão Nº ${plantaoNumeroAtual} · Unidade: ${unidade||"—"} · Equipe: ${equipe||"—"}\nServidor: ${esc(srv.nome)} · Mat: ${esc(srv.matricula)}\nData: ${dataP} · Jornada: ${jornadaP}\nEntrada: ${entradaP||"—"}${atrasoInfo.atrasado?`\nAtraso: ${atrasoInfo.minutos} min`:""}\n${marcacao?"Marcação: "+marcacao+"\n":""}${obs?"Obs: "+obs+"\n":""}${equipamentos.length?"Equipamentos: "+equipamentos.join(", ")+"\n":""}Supervisor: ${usuarioLogado?.nome||""} · ${usuarioLogado?.matricula||""}`);
    // notificação in-app para o servidor (se tiver e-mail cadastrado)
    if(srv.email){
      const info=STATUS_INFO[plantaoStatusAtual];
      await enviarNotificacao(
        srv.email,
        `${info.ic} Plantão — ${info.label}`,
        `Plantão Nº ${plantaoNumeroAtual}\nData: ${dataP}\nJornada: ${jornadaP}\nEntrada: ${entradaP||"—"}\n${marcacao?"Marcação: "+marcacao+"\n":""}${obs?"Obs: "+obs+"\n":""}Registrado por: ${usuarioLogado?.nome||""} · Mat: ${usuarioLogado?.matricula||""}`,
        "meupainel"
      );
    }
    // integração automática com a Armaria — evita registro duplicado de acautelamento
    if(equipamentos.length&&(plantaoStatusAtual==="presente"||plantaoStatusAtual==="atrasado")){
      await integrarEquipamentosArmaria(srv,equipamentos,plantaoNumeroAtual);
      equipamentosEntreguesCount+=equipamentos.length;
    }
    registrosPlantaoLocal[`${srv.id}_${dataP}_${jornadaP}`]={status:plantaoStatusAtual,marcacao,docId:docRef.id};
    // Formação automática de equipe — o servidor passa a integrar a equipe informada
    if(equipe&&["presente","atrasado","substituicao"].includes(plantaoStatusAtual)){
      upsertEquipe(equipe,dataP,srv);
    }
    atualizarContadorPlantao();
    const statusConfirmado=plantaoStatusAtual; // guarda antes de fechar o modal, que zera plantaoStatusAtual
    fecharModalPlantao();
    alerta(`${STATUS_INFO[statusConfirmado].label} registrado — ${esc(srv.nome)}`,"ok");
    // atualiza lista colorida
    const busNome=v("plantao-busca-nome"),busMat=v("plantao-busca-mat");
    if(busNome||busMat)buscarServidorPlantao();else renderListaPlantao();
    // notificação por e-mail
    enviarNotificacaoPlantao(srv,statusConfirmado,dataP,jornadaP,entradaP,saidaP,marcacao,obs,agora_str);
    // Falta, atraso significativo ou suspensão: pergunta se deseja encaminhar à Corregedoria
    await perguntarEncaminharCorregedoriaPlantao(srv,statusConfirmado,marcacao,dataP,jornadaP,atrasoInfo,obs);
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.confirmarPlantao=confirmarPlantao;

export async function perguntarEncaminharCorregedoriaPlantao(srv,status,marcacao,dataP,jornadaP,atrasoInfo,obs){
  const gatilhos=[];
  if(status==="ausente")gatilhos.push("Falta ao plantão");
  if(status==="atrasado"&&atrasoInfo?.minutos>=60)gatilhos.push(`Atraso de ${atrasoInfo.minutos} minutos`);
  if(marcacao==="Suspensão")gatilhos.push("Suspensão registrada");
  if(!gatilhos.length)return;
  if(!confirm(`${gatilhos.join(" · ")} — servidor ${esc(srv.nome)}.\n\nDeseja encaminhar esta situação para a Corregedoria?`))return;
  try{
    const num=await criarOcorrenciaAutomatica({
      tipo:`Plantão: ${gatilhos.join(", ")}`,local:v("plantao-unidade")||"—",
      envolvidos:srv.nome,servidor:srv.nome,
      desc:`Plantão Nº ${plantaoNumeroAtual} · Data: ${dataP} · Jornada: ${jornadaP}\n${gatilhos.join(", ")}\n${obs?"Obs: "+obs:""}`,
      prioridade:"Alta",origemModulo:"Escala/Plantão"
    });
    alerta(`Ocorrência ${num} encaminhada ao Comando/Corregedoria.`,"ok");
  }catch(e){alerta("Erro ao encaminhar: "+e.message,"erro");}
}

export async function autorizarAssuncaoPlantao(docId,srvId){
  const srv=servidoresCache.find(s=>s.id===srvId);
  if(!confirm(`Autorizar ${srv?.nome||"o servidor"} a assumir o plantão?\n\nA partir de agora, o botão "Assumir Plantão" será liberado no aplicativo dele.`))return;
  try{
    await updateDoc(doc(db,COL_PLANTAO,docId),{
      autorizadoAssuncao:true,
      autorizadoPor:usuarioLogado?.nome||"",
      autorizadoPorUid:auth.currentUser?.uid||"",
      autorizadoEm:serverTimestamp(),
      statusAssuncao:"autorizado"
    });
    await registrarAuditoria("Autorizou assunção de plantão",
      `Servidor: ${srv?.nome||srvId} · Plantão doc: ${docId} · Autorizado por: ${usuarioLogado?.nome||""}`);
    // atualiza cache local para refletir na lista imediatamente
    Object.keys(registrosPlantaoLocal).forEach(k=>{
      if(registrosPlantaoLocal[k].docId===docId)registrosPlantaoLocal[k].autorizadoAssuncao=true;
    });
    if(srv?.email){
      await enviarNotificacao(srv.email,"🔓 Assunção de Plantão Autorizada",
        `Sua assunção de plantão foi autorizada por ${usuarioLogado?.nome||""}.\nAcesse "Policial Municipal → Assunção de Plantão" para confirmar.`,"meupainel");
    }
    alerta("Assunção autorizada! O servidor já pode confirmar.","ok");
    const busNome=v("plantao-busca-nome"),busMat=v("plantao-busca-mat");
    if(busNome||busMat)buscarServidorPlantao();else renderListaPlantao();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.autorizarAssuncaoPlantao=autorizarAssuncaoPlantao;

export function iniciarSaidaPlantao(){
  document.getElementById("saida-busca-nome").value="";
  document.getElementById("saida-busca-mat").value="";
  document.getElementById("saida-servidores").innerHTML='<p class="hist-vazio">Digite nome ou matrícula para buscar.</p>';
  document.getElementById("saida-detalhe").style.display="none";
  saidaServidorSelecionado=null;saidaRegistroAberto=null;
}

export async function buscarServidorSaida(){
  const nome=v("saida-busca-nome").toLowerCase(),mat=v("saida-busca-mat").toLowerCase();
  const lista=document.getElementById("saida-servidores");
  document.getElementById("saida-detalhe").style.display="none";
  if(!nome&&!mat){lista.innerHTML='<p class="hist-vazio">Digite nome ou matrícula para buscar.</p>';return;}
  if(!servidoresCache.length){
    try{
      const snap=await getDocs(query(collection(db,COL_SERV),where("ativo","==",true)));
      servidoresCache=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.nome.localeCompare(b.nome));
    }catch(err){lista.innerHTML=`<p class="hist-vazio">Erro: ${err.message}</p>`;return;}
  }
  const filtrados=servidoresCache.filter(s=>
    (!nome||s.nome?.toLowerCase().includes(nome))&&(!mat||s.matricula?.toLowerCase().includes(mat)));
  if(!filtrados.length){lista.innerHTML='<p class="hist-vazio">Servidor não cadastrado. Contate o administrador.</p>';return;}
  lista.innerHTML=filtrados.map(s=>`<div class="servidor-card" data-sid="${s.id}">
      <div class="sc-nome">${esc(s.nome)}</div>
      <div class="sc-mat">Mat: ${esc(s.matricula)}${s.cargo?" · "+s.cargo:""}${s.equipe?" · Eq. "+s.equipe:""}</div>
    </div>`).join("");
  lista.querySelectorAll(".servidor-card").forEach(card=>{
    card.addEventListener("click",()=>{
      const srv=servidoresCache.find(s=>s.id===card.dataset.sid);
      if(srv)selecionarServidorSaida(srv);
    });
  });
}

window.buscarServidorSaida=buscarServidorSaida;

export async function selecionarServidorSaida(srv){
  saidaServidorSelecionado=srv;
  const bloco=document.getElementById("saida-detalhe");
  bloco.style.display="none";
  try{
    // localiza o Registro de Presença mais recente ainda aberto (assumiu/atrasou e não encerrado)
    const snap=await getDocs(query(collection(db,COL_PLANTAO),where("servidorMat","==",srv.matricula)));
    const abertos=snap.docs
      .map(d=>({id:d.id,...d.data()}))
      .filter(r=>["presente","atrasado"].includes(r.status)&&!r.encerrado)
      .sort((a,b)=>(b.data||"").localeCompare(a.data||"")||(b.entrada||"").localeCompare(a.entrada||""));
    if(!abertos.length){
      document.getElementById("saida-servidores").innerHTML=
        `<p class="hist-vazio">Este servidor não possui registro de entrada em aberto para encerramento do plantão.</p>`;
      return;
    }
    saidaRegistroAberto=abertos[0];
    preencherDetalheSaida(srv,saidaRegistroAberto);
    bloco.style.display="block";
  }catch(err){alerta("Erro ao buscar registro: "+err.message,"erro");}
}

export function preencherDetalheSaida(srv,reg){
  const agoraD=new Date();
  document.getElementById("sd-nome").value=srv.nome;
  document.getElementById("sd-matricula").value=srv.matricula;
  document.getElementById("sd-cargo").value=srv.cargo||reg.cargo||"—";
  document.getElementById("sd-equipe").value=reg.equipe||srv.equipe||"—";
  document.getElementById("sd-unidade").value=reg.unidade||srv.unidade||"—";
  document.getElementById("sd-data-saida").value=agoraD.toISOString().slice(0,10);
  document.getElementById("sd-hora-saida").value=agoraD.toTimeString().slice(0,5);
  document.getElementById("sd-insp-nome").value=usuarioLogado?.nome||"—";
  document.getElementById("sd-insp-mat").value=usuarioLogado?.matricula||"—";
  document.getElementById("sd-auth-data").value=agoraD.toISOString().slice(0,10);
  document.getElementById("sd-auth-hora").value=agoraD.toTimeString().slice(0,5);
  document.getElementById("sd-entrada").value=reg.entrada||"—";
  // usa o Turno escolhido em "Registrar Presença" (6h/12h/18h/24h) como carga prevista padrão
  const horasTurno=parseInt(reg.turnoPeriodo)||JORNADA_PADRAO_HORAS_SAIDA;
  document.getElementById("sd-carga-prevista").value=horasTurno;
  document.getElementById("sd-motivo").value="";
  document.getElementById("sd-motivo-desc").style.display="none";
  document.getElementById("sd-motivo-desc").value="";
  recalcularHorasSaida();
}

export function calcularHorasSaida(entrada,cargaPrevista){
  const agoraD=new Date();
  if(!entrada)return{totalHoras:0,horasExtras:0,horasNegativas:0,horaSaida:agoraD.toTimeString().slice(0,5)};
  const [eh,em]=entrada.split(":").map(Number);
  const entradaD=new Date(agoraD);
  entradaD.setHours(eh,em,0,0);
  if(entradaD>agoraD)entradaD.setDate(entradaD.getDate()-1); // plantão que atravessou a meia-noite
  let totalHoras=Math.round(((agoraD-entradaD)/3600000)*100)/100;
  const carga=Number(cargaPrevista)||JORNADA_PADRAO_HORAS_SAIDA;
  const diff=Math.round((totalHoras-carga)*100)/100;
  return{
    totalHoras,
    horasExtras:diff>0?diff:0,
    horasNegativas:diff<0?Math.abs(diff):0,
    horaSaida:agoraD.toTimeString().slice(0,5)
  };
}

export function recalcularHorasSaida(){
  if(!saidaRegistroAberto)return;
  const r=calcularHorasSaida(saidaRegistroAberto.entrada,v("sd-carga-prevista"));
  document.getElementById("sd-resumo-horas").innerHTML=`
    <div class="hist-tipo">⏱ Total trabalhado: ${r.totalHoras}h</div>
    <div class="hist-corpo">
      ${r.horasExtras>0?`➕ Horas extras: <strong style="color:#7dcea0">${r.horasExtras}h</strong><br>`:""}
      ${r.horasNegativas>0?`➖ Horas negativas: <strong style="color:#f1948a">${r.horasNegativas}h</strong><br>`:""}
      ${r.horasExtras===0&&r.horasNegativas===0?"Jornada cumprida dentro da carga prevista.":""}
    </div>`;
  atualizarResumoFinalSaida(r);
}
window.recalcularHorasSaida=recalcularHorasSaida;

export function atualizarResumoFinalSaida(r){
  const srv=saidaServidorSelecionado,reg=saidaRegistroAberto;
  if(!srv||!reg)return;
  document.getElementById("sd-resumo-final").innerHTML=`
    <div class="hist-tipo">👤 ${esc(srv.nome)}</div>
    <div class="hist-corpo">
      Matrícula: ${esc(srv.matricula)}<br>
      🕐 Entrada: ${reg.entrada||"—"} · Saída: ${r.horaSaida}<br>
      ⏱ Total trabalhado: ${r.totalHoras}h<br>
      ${r.horasExtras>0?`➕ Horas extras: ${r.horasExtras}h<br>`:""}
      ${r.horasNegativas>0?`➖ Saldo negativo: ${r.horasNegativas}h<br>`:""}
      🎖 Inspetor responsável: ${usuarioLogado?.nome||"—"}
    </div>`;
}

export function toggleMotivoOutro(){
  document.getElementById("sd-motivo-desc").style.display=v("sd-motivo")==="Outro"?"block":"none";
}
window.toggleMotivoOutro=toggleMotivoOutro;

export async function confirmarSaidaPlantao(){
  const srv=saidaServidorSelecionado,reg=saidaRegistroAberto;
  if(!srv||!reg)return alerta("Selecione um servidor com plantão em aberto.","erro");
  const motivo=v("sd-motivo");
  if(!motivo)return alerta("Selecione o motivo da saída.","erro");
  const motivoDesc=motivo==="Outro"?v("sd-motivo-desc"):"";
  if(motivo==="Outro"&&!motivoDesc)return alerta("Descreva o motivo da saída.","erro");

  const carga=v("sd-carga-prevista");
  const r=calcularHorasSaida(reg.entrada,carga);
  const dataSaida=new Date().toISOString().slice(0,10);

  try{
    await updateDoc(doc(db,COL_PLANTAO,reg.id),{
      saida:r.horaSaida,dataSaida,encerrado:true,
      cargaPrevistaHoras:Number(carga)||JORNADA_PADRAO_HORAS_SAIDA,
      totalHorasTrabalhadas:r.totalHoras,horasExtras:r.horasExtras,horasNegativas:r.horasNegativas,
      motivoSaida:motivo,motivoSaidaDesc:motivoDesc,
      encerradoPor:usuarioLogado?.nome||"",encerradoPorMat:usuarioLogado?.matricula||"",
      encerradoPorEmail:usuarioLogado?.email||"",encerradoEm:serverTimestamp()
    });

    await registrarAuditoria("Saída de plantão registrada",
      `Servidor: ${esc(srv.nome)} · Mat: ${esc(srv.matricula)}\nEntrada: ${reg.entrada||"—"} · Saída: ${r.horaSaida}\nTotal: ${r.totalHoras}h${r.horasExtras>0?" · Extras: "+r.horasExtras+"h":""}${r.horasNegativas>0?" · Negativas: "+r.horasNegativas+"h":""}\nMotivo: ${motivo}${motivoDesc?" — "+motivoDesc:""}\nInspetor: ${usuarioLogado?.nome||""}`);

    // Banco de Horas — lança automaticamente o saldo apurado no fechamento
    if(r.horasExtras>0){
      await addDoc(collection(db,COL_BH),{
        srvId:srv.id,srvNome:srv.nome,srvMat:srv.matricula,srvEmail:srv.email||"",
        data:dataSaida,tipo:"extra",qtd:r.horasExtras,tipoHora:"extraordinaria",status:"aprovada",
        obs:`Gerado automaticamente ao encerrar o plantão Nº ${reg.numeroPlantao||"—"}`,
        lancadoPor:usuarioLogado?.nome||"",lancadoPorMat:usuarioLogado?.matricula||"",criadoEm:serverTimestamp()
      });
    }
    if(r.horasNegativas>0){
      await addDoc(collection(db,COL_BH),{
        srvId:srv.id,srvNome:srv.nome,srvMat:srv.matricula,srvEmail:srv.email||"",
        data:dataSaida,tipo:"compensar",qtd:r.horasNegativas,tipoHora:"",status:"aprovada",
        obs:`Saída antecipada — gerado automaticamente ao encerrar o plantão Nº ${reg.numeroPlantao||"—"}`,
        lancadoPor:usuarioLogado?.nome||"",lancadoPorMat:usuarioLogado?.matricula||"",criadoEm:serverTimestamp()
      });
      await verificarAlertaBancoHorasNegativo(srv.matricula,srv.nome,srv.email);
    }

    // notifica o servidor — aparece no Meu Painel dele
    if(srv.email){
      await enviarNotificacao(srv.email,"🚪 Saída de Plantão Registrada",
        `Plantão Nº ${reg.numeroPlantao||"—"}\nEntrada: ${reg.entrada||"—"} · Saída: ${r.horaSaida}\nTotal trabalhado: ${r.totalHoras}h${r.horasExtras>0?"\nHoras extras: "+r.horasExtras+"h":""}${r.horasNegativas>0?"\nSaldo negativo: "+r.horasNegativas+"h":""}\nMotivo: ${motivo}${motivoDesc?" — "+motivoDesc:""}\nEncerrado por: ${usuarioLogado?.nome||""}`,
        "meupainel");
    }

    // Divergência (saída antecipada ou horas extras acima do limite) — alerta automático ao Comando/Corregedoria
    if(r.horasNegativas>0||r.horasExtras>LIMITE_HORAS_EXTRAS_ALERTA){
      const gatilho=r.horasNegativas>0
        ?`Saída antecipada — ${r.horasNegativas}h abaixo da carga prevista`
        :`Horas extras acima do limite — ${r.horasExtras}h`;
      await criarOcorrenciaAutomatica({
        tipo:`Encerramento de plantão: ${gatilho}`,local:reg.unidade||"—",
        envolvidos:srv.nome,servidor:srv.nome,
        desc:`Plantão Nº ${reg.numeroPlantao||"—"} · Entrada: ${reg.entrada||"—"} · Saída: ${r.horaSaida}\n${gatilho}\nMotivo informado: ${motivo}${motivoDesc?" — "+motivoDesc:""}\nInspetor responsável: ${usuarioLogado?.nome||""}`,
        prioridade:"Alta",origemModulo:"Inspetoria/Saída de Plantão"
      });
    }

    alerta(`Saída registrada — ${esc(srv.nome)}`,"ok");
    iniciarSaidaPlantao();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.confirmarSaidaPlantao=confirmarSaidaPlantao;

export function iniciarAusenciaPlantao(){
  document.getElementById("aus-busca-nome").value="";
  document.getElementById("aus-busca-mat").value="";
  document.getElementById("aus-servidores").innerHTML='<p class="hist-vazio">Digite nome ou matrícula para buscar.</p>';
  document.getElementById("aus-detalhe").style.display="none";
  ausenciaServidorSelecionado=null;
}

export async function buscarServidorAusencia(){
  const nome=v("aus-busca-nome").toLowerCase(),mat=v("aus-busca-mat").toLowerCase();
  const lista=document.getElementById("aus-servidores");
  document.getElementById("aus-detalhe").style.display="none";
  if(!nome&&!mat){lista.innerHTML='<p class="hist-vazio">Digite nome ou matrícula para buscar.</p>';return;}
  if(!servidoresCache.length){
    try{
      const snap=await getDocs(query(collection(db,COL_SERV),where("ativo","==",true)));
      servidoresCache=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.nome.localeCompare(b.nome));
    }catch(err){lista.innerHTML=`<p class="hist-vazio">Erro: ${err.message}</p>`;return;}
  }
  const filtrados=servidoresCache.filter(s=>
    (!nome||s.nome?.toLowerCase().includes(nome))&&(!mat||s.matricula?.toLowerCase().includes(mat)));
  if(!filtrados.length){lista.innerHTML='<p class="hist-vazio">Servidor não cadastrado. Contate o administrador.</p>';return;}
  lista.innerHTML=filtrados.map(s=>`<div class="servidor-card" data-sid="${s.id}">
      <div class="sc-nome">${esc(s.nome)}</div>
      <div class="sc-mat">Mat: ${esc(s.matricula)}${s.cargo?" · "+s.cargo:""}${s.equipe?" · Eq. "+s.equipe:""}</div>
    </div>`).join("");
  lista.querySelectorAll(".servidor-card").forEach(card=>{
    card.addEventListener("click",()=>{
      const srv=servidoresCache.find(s=>s.id===card.dataset.sid);
      if(srv)selecionarServidorAusencia(srv);
    });
  });
}

window.buscarServidorAusencia=buscarServidorAusencia;

export async function selecionarServidorAusencia(srv){
  ausenciaServidorSelecionado=srv;
  const bloco=document.getElementById("aus-detalhe");
  bloco.style.display="none";
  const hoje=new Date().toISOString().slice(0,10);
  try{
    // evita duplicidade: já existe algum registro de plantão hoje para este servidor?
    const snap=await getDocs(query(collection(db,COL_PLANTAO),
      where("servidorMat","==",srv.matricula),where("data","==",hoje)));
    if(!snap.empty){
      const existente=snap.docs[0].data();
      document.getElementById("aus-servidores").innerHTML=
        `<p class="hist-vazio">Este servidor já possui registro de plantão hoje (Status: ${existente.status?.toUpperCase()||"—"}). Não é possível registrar ausência duplicada.</p>`;
      return;
    }
    preencherDetalheAusencia(srv);
    bloco.style.display="block";
  }catch(err){alerta("Erro ao verificar registro: "+err.message,"erro");}
}

export function preencherDetalheAusencia(srv){
  const agoraD=new Date();
  document.getElementById("aus-nome").value=srv.nome;
  document.getElementById("aus-matricula").value=srv.matricula;
  document.getElementById("aus-cargo").value=srv.cargo||"—";
  document.getElementById("aus-equipe").value=srv.equipe||"—";
  document.getElementById("aus-unidade").value=srv.unidade||"—";
  document.getElementById("aus-data").value=agoraD.toISOString().slice(0,10);
  document.getElementById("aus-hora").value=agoraD.toTimeString().slice(0,5);
  document.getElementById("aus-insp-nome").value=usuarioLogado?.nome||"—";
  document.getElementById("aus-insp-mat").value=usuarioLogado?.matricula||"—";
  document.getElementById("aus-motivo").value="";
  document.getElementById("aus-motivo-desc").style.display="none";
  document.getElementById("aus-motivo-desc").value="";
  document.getElementById("aus-resumo-final").innerHTML=
    `<div class="hist-tipo">👤 ${esc(srv.nome)}</div><div class="hist-corpo">Selecione o motivo da ausência acima.</div>`;
}

export function toggleMotivoAusenciaOutro(){
  document.getElementById("aus-motivo-desc").style.display=v("aus-motivo")==="Outro"?"block":"none";
  atualizarResumoAusencia();
}
window.toggleMotivoAusenciaOutro=toggleMotivoAusenciaOutro;

export function atualizarResumoAusencia(){
  const srv=ausenciaServidorSelecionado;
  if(!srv)return;
  const motivo=v("aus-motivo")||"—";
  document.getElementById("aus-resumo-final").innerHTML=`
    <div class="hist-tipo">❌ ${esc(srv.nome)}</div>
    <div class="hist-corpo">
      Matrícula: ${esc(srv.matricula)}<br>
      📅 Data: ${v("aus-data")} · 🕐 Registrado às ${v("aus-hora")}<br>
      Motivo: ${motivo}<br>
      🎖 Inspetor responsável: ${usuarioLogado?.nome||"—"}
    </div>`;
}

export async function confirmarAusenciaPlantao(){
  const srv=ausenciaServidorSelecionado;
  if(!srv)return alerta("Selecione um servidor primeiro.","erro");
  const motivo=v("aus-motivo");
  if(!motivo)return alerta("Selecione o motivo da ausência.","erro");
  const motivoDesc=motivo==="Outro"?v("aus-motivo-desc"):"";
  if(motivo==="Outro"&&!motivoDesc)return alerta("Descreva o motivo da ausência.","erro");

  const agoraD=new Date(),hoje=agoraD.toISOString().slice(0,10),horaReg=agoraD.toTimeString().slice(0,5);
  try{
    await addDoc(collection(db,COL_PLANTAO),{
      servidorId:srv.id,servidorNome:srv.nome,servidorMat:srv.matricula,
      servidorEmail:srv.email||"",cargo:srv.cargo||"",unidade:srv.unidade||"",equipe:srv.equipe||"",
      data:hoje,jornada:"",entrada:"",saida:"",status:"ausente",
      marcacao:motivo,obs:motivoDesc,encerrado:true,
      supervisorNome:usuarioLogado?.nome||"",supervisorMat:usuarioLogado?.matricula||"",
      supervisorEmail:usuarioLogado?.email||"",
      registradoEm:agora(),criadoEm:serverTimestamp()
    });

    await registrarAuditoria("Ausência de plantão registrada",
      `Servidor: ${esc(srv.nome)} · Mat: ${esc(srv.matricula)}\nData: ${hoje} · Hora: ${horaReg}\nMotivo: ${motivo}${motivoDesc?" — "+motivoDesc:""}\nInspetor: ${usuarioLogado?.nome||""}`);

    if(srv.email){
      await enviarNotificacao(srv.email,"❌ Ausência de Plantão Registrada",
        `Data: ${hoje}\nMotivo: ${motivo}${motivoDesc?" — "+motivoDesc:""}\nRegistrado por: ${usuarioLogado?.nome||""}`,
        "meupainel");
    }

    // falta não justificada é encaminhada automaticamente para análise do Comando/Corregedoria
    if(motivo==="Falta não justificada"){
      await criarOcorrenciaAutomatica({
        tipo:"Falta ao plantão",local:srv.unidade||"—",
        envolvidos:srv.nome,servidor:srv.nome,
        desc:`Ausência registrada em ${hoje} às ${horaReg}\nMotivo informado: Falta não justificada\nInspetor responsável: ${usuarioLogado?.nome||""}`,
        prioridade:"Alta",origemModulo:"Inspetoria/Registrar Ausência"
      });
    }

    alerta(`Ausência registrada — ${esc(srv.nome)}`,"ok");
    iniciarAusenciaPlantao();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.confirmarAusenciaPlantao=confirmarAusenciaPlantao;

export async function integrarEquipamentosArmaria(srv,equipamentos,numeroPlantao){
  const pendentes=[];
  try{
    if(equipamentos.includes("Pistola")||equipamentos.includes("Revólver")){
      const snap=await getDocs(query(collection(db,COL_ARMAS_IND),where("acautelamento.matricula","==",srv.matricula)));
      if(!snap.empty){
        for(const d of snap.docs){
          await addDoc(collection(db,COL_ARMAS_HIST),{armaId:d.id,tipo:"confirmacao_plantao",
            detalhes:`Confirmada porte durante o Plantão Nº ${numeroPlantao} — ${esc(srv.nome)}`,
            usuarioNome:usuarioLogado?.nome||"",usuarioEmail:usuarioLogado?.email||"",hora:agora(),criadoEm:serverTimestamp()});
        }
      }else pendentes.push("Arma");
    }
    if(equipamentos.includes("Colete")){
      const snapC=await getDocs(query(collection(db,COL_COLETES),where("distribuicaoAtual.servidorMatricula","==",srv.matricula)));
      if(!snapC.empty){
        for(const d of snapC.docs){
          await addDoc(collection(db,COL_COLETES_HIST),{coleteId:d.id,tipo:"confirmacao_plantao",
            detalhes:`Confirmado uso durante o Plantão Nº ${numeroPlantao} — ${esc(srv.nome)}`,
            usuarioNome:usuarioLogado?.nome||"",usuarioEmail:usuarioLogado?.email||"",hora:agora(),criadoEm:serverTimestamp()});
        }
      }else pendentes.push("Colete");
    }
    if(equipamentos.includes("Munições")){
      const snapM=await getDocs(query(collection(db,COL_MUNICOES_HIST),where("servidorNome","==",srv.nome)));
      const acautelamentos=snapM.docs.map(d=>d.data()).filter(h=>h.tipo==="acautelamento")
        .sort((a,b)=>(b.hora||"").localeCompare(a.hora||""));
      if(acautelamentos.length){
        await registrarMovMunicao(null,"confirmacao_plantao",
          `Confirmado porte de munição durante o Plantão Nº ${numeroPlantao} — ${esc(srv.nome)} (último acautelamento: ${acautelamentos[0].detalhes||""})`,
          {servidorNome:srv.nome});
      }else pendentes.push("Munição");
    }
  }catch(e){console.warn("Integração Armaria:",e.message);}
  if(pendentes.length){
    alerta(`⚠️ ${pendentes.join(" e ")} informado(s) no plantão, mas sem acautelamento formal na Armaria. Regularize quando possível.`,"aviso");
  }
}

export function enviarNotificacaoPlantao(srv,status,data,jornada,entrada,saida,marcacao,obs,agora_str){
  if(!srv.email)return;
  const info=STATUS_INFO[status];
  const corpo=
    `${info.ic} REGISTRO DE PLANTÃO — ${info.label}\n\n`+
    `Plantão Nº ${plantaoNumeroAtual}\nData: ${data}\nHorário do registro: ${agora_str}\nJornada: ${jornada}\n`+
    `Entrada: ${entrada||"—"}\n\n`+
    `SERVIDOR FISCALIZADO:\nNome: ${esc(srv.nome)}\nMatrícula: ${esc(srv.matricula)}\n\n`+
    `FISCAL RESPONSÁVEL:\nNome: ${usuarioLogado?.nome||""}\nMatrícula: ${usuarioLogado?.matricula||""}\n\n`+
    (marcacao?`Marcação: ${marcacao}\n`:"")+(obs?`Observação: ${obs}\n`:"")+
    `\nPolícia Municipal de Caruaru — Sistema Operacional`;
  setTimeout(()=>{
    window.location.href=`mailto:${srv.email}?subject=${encodeURIComponent("Registro de Plantão — "+info.label)}&body=${encodeURIComponent(corpo)}`;
  },800);
}

export function fecharModalPlantao(){
  document.getElementById("modal-plantao").style.display="none";
  servidorSelecionado=null;plantaoStatusAtual=null;_justificativaForaEscala="";
}
window.fecharModalPlantao=fecharModalPlantao;

export function atualizarContadorPlantao(){
  const vals=Object.values(registrosPlantaoLocal);
  document.getElementById("cnt-presentes").textContent=vals.filter(r=>r.status==="presente").length;
  document.getElementById("cnt-ausentes").textContent=vals.filter(r=>r.status==="ausente").length;
  document.getElementById("cnt-atrasados").textContent=vals.filter(r=>r.status==="atrasado"||r.status==="substituicao").length;
  document.getElementById("cnt-atestados").textContent=vals.filter(r=>r.marcacao==="Atestado Médico").length;
  document.getElementById("cnt-ferias").textContent=vals.filter(r=>r.marcacao==="Férias").length;
  document.getElementById("cnt-licencas").textContent=vals.filter(r=>MARCACOES_LICENCA.includes(r.marcacao)).length;
  document.getElementById("cnt-compensando").textContent=vals.filter(r=>r.marcacao==="Plantão Trocado").length;
  const elEq=document.getElementById("cnt-equip-entregues");
  if(elEq)elEq.textContent=equipamentosEntreguesCount;
}

export async function abrirFechamentoPlantao(){
  if(!confirm(`Finalizar o Plantão Nº ${plantaoNumeroAtual}? Esta ação registra o encerramento e a assinatura eletrônica do inspetor.`))return;
  const vals=Object.values(registrosPlantaoLocal);
  const totais={
    presentes:vals.filter(r=>r.status==="presente").length,
    ausentes:vals.filter(r=>r.status==="ausente").length,
    atrasados:vals.filter(r=>r.status==="atrasado").length,
    dispensas:vals.filter(r=>r.status==="dispensa").length,
    substituicoes:vals.filter(r=>r.status==="substituicao").length,
    ocorrencias:carregarOC().filter(o=>o.origemPlantao===plantaoNumeroAtual).length,
    equipamentosEntregues:equipamentosEntreguesCount
  };
  const agora_str=agora();
  const fechamento={
    numeroPlantao:plantaoNumeroAtual,unidade:v("plantao-unidade"),equipe:v("plantao-equipe"),
    inspetor:usuarioLogado?.nome||"",inspetorMat:usuarioLogado?.matricula||"",
    turnoPeriodo:v("plantao-turno-periodo"),
    data:v("plantao-data"),jornada:v("plantao-turno"),totais,
    assinaturaEletronica:`${usuarioLogado?.nome||""} — Mat: ${usuarioLogado?.matricula||""}`,
    dataHoraFechamento:agora_str
  };
  try{
    await addDoc(collection(db,COL_PLANTAO_FECHAMENTO),{...fechamento,criadoEm:serverTimestamp()});
    await registrarAuditoria(`Plantão Nº ${plantaoNumeroAtual} finalizado`,
      `Presentes: ${totais.presentes} · Ausentes: ${totais.ausentes} · Atrasados: ${totais.atrasados}\nOcorrências: ${totais.ocorrencias} · Equipamentos entregues: ${totais.equipamentosEntregues}\nAssinatura: ${fechamento.assinaturaEletronica}`);
    document.getElementById("plantao-fechamento-resumo").innerHTML=`
      <div class="hist-item" style="border-left:3px solid var(--dourado)">
        <div class="hist-corpo">
          🔒 PLANTÃO Nº ${plantaoNumeroAtual} ENCERRADO\n
          🟢 Presentes: ${totais.presentes} · 🔴 Ausentes: ${totais.ausentes} · 🟠 Atrasados: ${totais.atrasados}\n
          🏳 Dispensas: ${totais.dispensas} · 🔁 Substituições: ${totais.substituicoes}\n
          🚨 Ocorrências: ${totais.ocorrencias} · 🎒 Equipamentos entregues: ${totais.equipamentosEntregues}\n
          ✍️ Assinado eletronicamente por: ${fechamento.assinaturaEletronica}\n
          🕐 ${agora_str}
        </div>
      </div>`;
    alerta("Plantão finalizado e assinado eletronicamente.","ok");
  }catch(err){alerta("Erro ao finalizar: "+err.message,"erro");}
}
window.abrirFechamentoPlantao=abrirFechamentoPlantao;

export async function renderHistStatus(status){
  const idL=`lista-hist-${status==="presente"?"presentes":status==="ausente"?"ausentes":"atrasados"}`;
  const idC=`cnt-hist-${status==="presente"?"presentes":status==="ausente"?"ausentes":"atrasados"}`;
  const lista=document.getElementById(idL);
  lista.innerHTML='<p class="hist-vazio">Carregando...</p>';
  try{
    const snap=await getDocs(query(collection(db,COL_PLANTAO),where("status","==",status),orderBy("criadoEm","desc")));
    document.getElementById(idC).textContent=snap.size?`${snap.size} registro(s)`:"";
    lista.innerHTML=snap.empty?'<p class="hist-vazio">Nenhum registro.</p>'
      :snap.docs.map(d=>{const r=d.data();const ic=status==="presente"?"✅":status==="ausente"?"❌":"⏰";
        return`<div class="hist-item">
          <div class="hist-tipo">${ic} ${esc(r.servidorNome)}</div>
          <div class="hist-data">📅 ${r.data} · ${esc(r.jornada||r.turno)}</div>
          <div class="hist-data">🕐 Entrada: ${r.entrada||"—"} · Saída: ${r.saida||"—"}</div>
          <div class="hist-usuario">Mat: ${esc(r.servidorMat)}${r.cargo?" · "+esc(r.cargo):""}</div>
          <div class="hist-corpo">${r.marcacao?"Marcação: "+esc(r.marcacao)+"\n":""}${r.obs?"Obs: "+esc(r.obs)+"\n":""}Supervisor: ${esc(r.supervisorNome)} · ${esc(r.supervisorMat)}\n🕐 ${r.registradoEm||tsStr(r.criadoEm)}</div>
        </div>`;}).join("");
  }catch(err){lista.innerHTML=`<p class="hist-vazio">Erro: ${err.message}</p>`;}
}

export function chaveEscala(ano,mes){return `${ano}-${String(mes+1).padStart(2,"0")}`;}

export async function carregarDiasMesAtual(){
  try{
    const snap=await getDoc(doc(db,COL_ESCALA_MENSAL,chaveEscala(escalaAnoAtual,escalaMesAtual)));
    _diasMesAtual=snap.exists()?(snap.data().dias||{}):{};
  }catch(e){_diasMesAtual={};}
  return _diasMesAtual;
}

export async function salvarDiasMesAtual(){
  await setDoc(doc(db,COL_ESCALA_MENSAL,chaveEscala(escalaAnoAtual,escalaMesAtual)),{
    dias:_diasMesAtual,atualizadoPor:usuarioLogado?.nome||"",atualizadoEm:serverTimestamp()
  });
}

export async function iniciarEscala(){
  escalaMesAtual=new Date().getMonth();
  escalaAnoAtual=new Date().getFullYear();
  await renderCalendario();
  atualizarResumo();
  // carrega servidores no select do modal
  carregarSrvSelect();
}

export async function carregarSrvSelect(){
  const sel=document.getElementById("escala-srv-sel");
  sel.innerHTML='<option value="">Selecione servidor...</option>';
  if(!servidoresCache.length){
    try{
      const snap=await getDocs(query(collection(db,COL_SERV),where("ativo","==",true)));
      servidoresCache=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.nome.localeCompare(b.nome));
    }catch(e){}
  }
  servidoresCache.forEach(s=>{
    sel.innerHTML+=`<option value="${s.id}" data-nome="${esc(s.nome)}">${esc(s.nome)} — Mat: ${esc(s.matricula)}</option>`;
  });
}

export async function mudarMes(dir){
  escalaMesAtual+=dir;
  if(escalaMesAtual>11){escalaMesAtual=0;escalaAnoAtual++;}
  if(escalaMesAtual<0){escalaMesAtual=11;escalaAnoAtual--;}
  await renderCalendario(); atualizarResumo();
}
window.mudarMes=mudarMes;

export async function renderCalendario(){
  const meses=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  document.getElementById("escala-mes-label").textContent=`${meses[escalaMesAtual]} ${escalaAnoAtual}`;
  const cal=document.getElementById("escala-cal");
  cal.innerHTML='<p class="hist-vazio" style="grid-column:1/-1">Carregando...</p>';
  const dados=await carregarDiasMesAtual();
  const hoje=new Date(); const hj=hoje.getDate(),hm=hoje.getMonth(),ha=hoje.getFullYear();

  // dias da semana header
  const dows=["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
  let html=dows.map(d=>`<div class="escala-dow">${d}</div>`).join("");

  const primeiroDia=new Date(escalaAnoAtual,escalaMesAtual,1).getDay();
  const totalDias=new Date(escalaAnoAtual,escalaMesAtual+1,0).getDate();

  for(let i=0;i<primeiroDia;i++) html+=`<div class="escala-dia vazio"></div>`;

  for(let d=1;d<=totalDias;d++){
    const isHoje=(d===hj&&escalaMesAtual===hm&&escalaAnoAtual===ha);
    const entradas=dados[d]||[];
    const turnos=entradas.map(e=>{
      const cls=`turno-${e.turno.toLowerCase()}`;
      const nome=e.nomeServidor?.split(" ")[0]||"";
      return`<span class="escala-turno ${cls}">${e.turno} ${nome}</span>`;
    }).join("");
    html+=`<div class="escala-dia${isHoje?" hoje":""}" data-dia="${d}" onclick="abrirModalEscalaDia(${d})">
      <div class="dia-num">${d}</div>
      ${turnos}
    </div>`;
  }
  cal.innerHTML=html;
}

export async function copiarMesAnterior(){
  let mesAnt=escalaMesAtual-1,anoAnt=escalaAnoAtual;
  if(mesAnt<0){mesAnt=11;anoAnt--;}
  let dadosAnt={};
  try{
    const snap=await getDoc(doc(db,COL_ESCALA_MENSAL,chaveEscala(anoAnt,mesAnt)));
    dadosAnt=snap.exists()?(snap.data().dias||{}):{};
  }catch(e){}
  if(!Object.keys(dadosAnt).length)return alerta("O mês anterior não possui escala lançada.","erro");
  if(Object.keys(_diasMesAtual).length){
    if(!confirm("O mês atual já possui entradas. Copiar do mês anterior vai SOBRESCREVER a escala atual. Continuar?"))return;
  }
  _diasMesAtual=JSON.parse(JSON.stringify(dadosAnt));
  await salvarDiasMesAtual();
  await renderCalendario();atualizarResumo();
  alerta("Escala do mês anterior copiada com sucesso. Revise antes de publicar.","ok");
}
window.copiarMesAnterior=copiarMesAnterior;

export function atualizarResumo(){
  const dados=_diasMesAtual;
  const total=Object.values(dados).reduce((acc,arr)=>acc+arr.length,0);
  const turnos={M:0,T:0,N:0,F:0,E:0};
  Object.values(dados).forEach(arr=>arr.forEach(e=>{ if(turnos[e.turno]!==undefined)turnos[e.turno]++; }));
  document.getElementById("escala-resumo").innerHTML=total
    ?`Total de entradas: <strong>${total}</strong><br>
      ☀️ Manhã: ${turnos.M} · 🌤 Tarde: ${turnos.T} · 🌙 Noite: ${turnos.N}<br>
      🏖 Folga: ${turnos.F} · ⚡ Extra: ${turnos.E}`
    :"Nenhuma entrada este mês.";
}

export function abrirModalEscalaDia(dia){
  diaEditando=dia;
  const entradas=_diasMesAtual[dia]||[];
  document.getElementById("escala-modal-titulo").textContent=`📅 Dia ${String(dia).padStart(2,"0")}`;
  document.getElementById("escala-obs-sel").value="";

  // lista entradas existentes
  const lista=document.getElementById("escala-modal-lista");
  lista.innerHTML=entradas.length
    ?`<div style="font-family:'Oswald',sans-serif;font-size:.7rem;letter-spacing:1px;color:var(--cinza);margin-bottom:6px">ENTRADAS SALVAS</div>`+
      entradas.map((e,i)=>{
        const cls=`turno-${e.turno.toLowerCase()}`;
        return`<div style="display:flex;justify-content:space-between;align-items:center;
          background:rgba(255,255,255,.05);border-radius:6px;padding:6px 8px;margin-bottom:4px">
          <div>
            <span class="escala-turno ${cls}" style="font-size:.65rem">${e.turno}</span>
            <span style="font-size:.78rem;margin-left:6px">${e.nomeServidor}</span>
            <div style="font-size:.65rem;color:var(--cinza)">${e.jornada||""}${e.obs?" · "+e.obs:""}</div>
          </div>
          <button class="btn-remover-linha" onclick="removerEntradaEscala(${i})">✕</button>
        </div>`;
      }).join("")
    :"";
  document.getElementById("escala-modal").classList.add("aberto");
}
window.abrirModalEscalaDia=abrirModalEscalaDia;

export function fecharModalEscala(){
  document.getElementById("escala-modal").classList.remove("aberto");
  diaEditando=null;
}
window.fecharModalEscala=fecharModalEscala;

export async function salvarDiaEscala(){
  if(diaEditando===null)return;
  const srvSel=document.getElementById("escala-srv-sel");
  const srvId=srvSel.value;
  const srvNome=srvSel.options[srvSel.selectedIndex]?.text?.split(" — ")[0]||"";
  const turno=v("escala-turno-sel")||"M";
  const jornada=v("escala-jornada-sel")||"Ordinário";
  const obs=v("escala-obs-sel");
  if(!srvId)return alerta("Selecione um servidor.","erro");

  if(!_diasMesAtual[diaEditando])_diasMesAtual[diaEditando]=[];
  _diasMesAtual[diaEditando].push({srvId,nomeServidor:srvNome,turno,jornada,obs,criadoEm:agora()});
  try{
    await salvarDiasMesAtual();
    alerta("Entrada salva!","ok");
    await renderCalendario(); atualizarResumo();
    abrirModalEscalaDia(diaEditando); // recarrega modal com nova entrada
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.salvarDiaEscala=salvarDiaEscala;

export async function removerEntradaEscala(idx){
  if(!confirm("Remover esta entrada?"))return;
  _diasMesAtual[diaEditando].splice(idx,1);
  try{
    await salvarDiasMesAtual();
    await renderCalendario(); atualizarResumo();
    abrirModalEscalaDia(diaEditando);
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.removerEntradaEscala=removerEntradaEscala;

export async function publicarEscala(){
  if(!confirm("Publicar escala? Todos os servidores receberão notificação."))return;
  const meses=["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
    "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const dados=_diasMesAtual;
  // envia notificação para cada servidor que tem e-mail
  const srvEmails=new Map();
  Object.entries(dados).forEach(([dia,entradas])=>{
    entradas.forEach(e=>{
      const srv=servidoresCache.find(s=>s.id===e.srvId);
      if(srv?.email){
        if(!srvEmails.has(srv.email))srvEmails.set(srv.email,[]);
        srvEmails.get(srv.email).push(`Dia ${dia}: ${e.turno} — ${e.jornada}${e.obs?" ("+e.obs+")":""}`);
      }
    });
  });
  for(const [email,dias] of srvEmails){
    await enviarNotificacao(email,`📅 Escala ${meses[escalaMesAtual]}/${escalaAnoAtual} publicada`,
      `Seus dias na escala:\n${dias.join("\n")}\n\nAcesse o app para ver detalhes.`,"administrativo");
  }
  try{
    await setDoc(doc(db,COL_ESCALA_MENSAL,chaveEscala(escalaAnoAtual,escalaMesAtual)),
      {publicada:true,publicadaPor:usuarioLogado?.nome||"",publicadaEm:serverTimestamp()},{merge:true});
  }catch(e){}
  alerta(`Escala publicada! ${srvEmails.size} servidor(es) notificado(s).`,"ok");
}
window.publicarEscala=publicarEscala;

export async function obterMeuServidorRoster(){
  if(!servidoresCache.length){
    try{
      const snap=await getDocs(query(collection(db,COL_SERV),where("ativo","==",true)));
      servidoresCache=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.nome.localeCompare(b.nome));
    }catch(e){}
  }
  const minhaMat=normalizarMatricula(usuarioLogado?.matricula);
  return servidoresCache.find(s=>normalizarMatricula(s.matricula)===minhaMat)||null;
}

export async function obterProximosPlantoesEscala(srvId,mesesAFrente=3){
  const hojeStr=new Date().toISOString().slice(0,10);
  const base=new Date();
  const resultado=[];
  for(let i=0;i<mesesAFrente;i++){
    const d=new Date(base.getFullYear(),base.getMonth()+i,1);
    const chave=chaveEscala(d.getFullYear(),d.getMonth());
    try{
      const snap=await getDoc(doc(db,COL_ESCALA_MENSAL,chave));
      if(!snap.exists())continue;
      const dias=snap.data().dias||{};
      Object.entries(dias).forEach(([dia,entradas])=>{
        (entradas||[]).forEach((e,idx)=>{
          if(e.srvId!==srvId)return;
          const dataISO=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(dia).padStart(2,"0")}`;
          if(dataISO>=hojeStr)resultado.push({data:dataISO,turno:e.turno,jornada:e.jornada||"",obs:e.obs||"",mesChave:chave,dia:Number(dia),idx});
        });
      });
    }catch(e){}
  }
  resultado.sort((a,b)=>a.data.localeCompare(b.data));
  return resultado;
}

export function fmtPlantaoEscala(p){
  const [y,m,d]=p.data.split("-");
  return `${d}/${m}/${y} · ${TURNO_LABEL[p.turno]||p.turno} · ${p.jornada||"—"}`;
}

export async function iniciarPermutaServidor(){
  document.getElementById("perm-busca-servidor").value="";
  document.getElementById("perm-obs").value="";
  document.getElementById("perm-servidor-resultado").innerHTML="";
  document.getElementById("perm-plantao-destino-wrap").style.display="none";
  document.getElementById("perm-alertas-preview").innerHTML="";
  _destinatarioPermuta=null;_plantoesDestinoPermuta=[];

  const sel=document.getElementById("perm-meu-plantao");
  sel.innerHTML='<option value="">Carregando seus próximos plantões...</option>';
  _meuServidorPermuta=await obterMeuServidorRoster();
  if(!_meuServidorPermuta){
    sel.innerHTML='<option value="">Não encontramos seu registro no efetivo</option>';
  }else{
    _meusPlantoesPermuta=await obterProximosPlantoesEscala(_meuServidorPermuta.id);
    sel.innerHTML=_meusPlantoesPermuta.length
      ?'<option value="">Selecione...</option>'+_meusPlantoesPermuta.map((p,i)=>`<option value="${i}">${fmtPlantaoEscala(p)}</option>`).join("")
      :'<option value="">Nenhum plantão futuro encontrado na escala</option>';
  }
  renderMinhasPermutas();
}

export function buscarServidorPermuta(){
  clearTimeout(_buscaPermutaTimeout);
  _buscaPermutaTimeout=setTimeout(async()=>{
    const q=v("perm-busca-servidor").toLowerCase();
    const el=document.getElementById("perm-servidor-resultado");
    document.getElementById("perm-plantao-destino-wrap").style.display="none";
    _destinatarioPermuta=null;
    if(!q){el.innerHTML="";return;}
    if(!servidoresCache.length){
      try{
        const snap=await getDocs(query(collection(db,COL_SERV),where("ativo","==",true)));
        servidoresCache=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.nome.localeCompare(b.nome));
      }catch(e){}
    }
    const minhaMat=normalizarMatricula(usuarioLogado?.matricula);
    const achados=servidoresCache.filter(s=>normalizarMatricula(s.matricula)!==minhaMat&&
      (s.nome?.toLowerCase().includes(q)||s.matricula?.toLowerCase().includes(q))).slice(0,8);
    el.innerHTML=achados.length?achados.map(s=>`<div class="servidor-card" data-sid="${s.id}">
        <div class="sc-nome">${esc(s.nome)}</div><div class="sc-mat">Mat: ${esc(s.matricula)}${s.cargo?" · "+s.cargo:""}</div>
      </div>`).join(""):'<p class="hist-vazio">Nenhum servidor encontrado.</p>';
    el.querySelectorAll(".servidor-card").forEach(card=>{
      card.addEventListener("click",()=>selecionarDestinatarioPermuta(card.dataset.sid));
    });
  },300);
}
window.buscarServidorPermuta=buscarServidorPermuta;

export async function selecionarDestinatarioPermuta(srvId){
  _destinatarioPermuta=servidoresCache.find(s=>s.id===srvId);
  if(!_destinatarioPermuta)return;
  document.getElementById("perm-servidor-resultado").innerHTML=
    `<div class="servidor-card" style="border-color:var(--dourado)"><div class="sc-nome">✔ ${_destinatarioPermuta.nome}</div><div class="sc-mat">Mat: ${_destinatarioPermuta.matricula}</div></div>`;
  const wrap=document.getElementById("perm-plantao-destino-wrap");
  const sel=document.getElementById("perm-plantao-destino");
  wrap.style.display="block";
  sel.innerHTML='<option value="">Carregando plantões deste servidor...</option>';
  _plantoesDestinoPermuta=await obterProximosPlantoesEscala(_destinatarioPermuta.id);
  sel.innerHTML=_plantoesDestinoPermuta.length
    ?'<option value="">Selecione...</option>'+_plantoesDestinoPermuta.map((p,i)=>`<option value="${i}">${fmtPlantaoEscala(p)}</option>`).join("")
    :'<option value="">Nenhum plantão futuro encontrado na escala</option>';
}

export function calcularAlertasPermuta(srvA,srvB,plantaoA,plantaoB){
  const alertas=[];let bloqueado=false;
  if((srvA.cargo||"")!==(srvB.cargo||"")){
    alertas.push({nivel:"critico",texto:`Função incompatível: ${srvA.cargo||"—"} ↔ ${srvB.cargo||"—"}`});
    bloqueado=true;
  }
  [["solicitante",srvA],["destinatário",srvB]].forEach(([label,s])=>{
    if(s.situacao&&s.situacao!=="Ativo"){
      alertas.push({nivel:"critico",texto:`O(a) ${label} está com situação "${s.situacao}" — não pode permutar.`});
      bloqueado=true;
    }
  });
  const hoje=new Date();hoje.setHours(0,0,0,0);
  [["cedido",plantaoA],["recebido",plantaoB]].forEach(([label,p])=>{
    const dias=Math.round((new Date(p.data+"T00:00:00")-hoje)/86400000);
    if(dias<PRAZO_MINIMO_PERMUTA_DIAS){
      alertas.push({nivel:"importante",texto:`Prazo curto: o plantão ${label} (${p.data}) é em ${dias} dia(s) — menor que o mínimo de ${PRAZO_MINIMO_PERMUTA_DIAS} dia(s).`});
    }
  });
  // conflito de escala: o servidor que vai ASSUMIR o dia já tem outro compromisso nesse mesmo dia?
  const jaTemA=_meusPlantoesPermuta.some(p=>p.data===plantaoB.data&&!(p.data===plantaoA.data&&p.turno===plantaoA.turno));
  const jaTemB=_plantoesDestinoPermuta.some(p=>p.data===plantaoA.data&&!(p.data===plantaoB.data&&p.turno===plantaoB.turno));
  if(jaTemA)alertas.push({nivel:"critico",texto:`Conflito de escala: o solicitante já tem outro plantão em ${plantaoB.data}.`});
  if(jaTemB)alertas.push({nivel:"critico",texto:`Conflito de escala: o destinatário já tem outro plantão em ${plantaoA.data}.`});
  if(jaTemA||jaTemB)bloqueado=true;
  return{alertas,bloqueado};
}

export function renderAlertasPermutaPreview(){
  const el=document.getElementById("perm-alertas-preview");
  const idxMeu=v("perm-meu-plantao"),idxDest=v("perm-plantao-destino");
  if(!_meuServidorPermuta||!_destinatarioPermuta||idxMeu===""||idxDest===""){el.innerHTML="";return;}
  const pA=_meusPlantoesPermuta[idxMeu],pB=_plantoesDestinoPermuta[idxDest];
  if(!pA||!pB){el.innerHTML="";return;}
  const{alertas}=calcularAlertasPermuta(_meuServidorPermuta,_destinatarioPermuta,pA,pB);
  el.innerHTML=alertas.length?alertas.map(a=>
    `<div class="sit-alerta ${a.nivel}">${a.nivel==="critico"?"🔴":"🟡"} ${esc(a.texto)}</div>`).join(""):"";
}

export async function solicitarPermuta(){
  if(!_meuServidorPermuta)return alerta("Não conseguimos identificar seu registro no efetivo.","erro");
  if(!_destinatarioPermuta)return alerta("Selecione o servidor para permutar.","erro");
  const idxMeu=v("perm-meu-plantao"),idxDest=v("perm-plantao-destino");
  if(idxMeu==="")return alerta("Selecione o plantão que você quer ceder.","erro");
  if(idxDest==="")return alerta("Selecione o plantão que você quer receber.","erro");
  const pA=_meusPlantoesPermuta[idxMeu],pB=_plantoesDestinoPermuta[idxDest];
  const{alertas,bloqueado}=calcularAlertasPermuta(_meuServidorPermuta,_destinatarioPermuta,pA,pB);
  if(bloqueado){
    alerta("Esta permuta não pode ser solicitada:\n"+alertas.filter(a=>a.nivel==="critico").map(a=>"• "+a.texto).join("\n"),"erro");
    return;
  }
  if(alertas.length&&!confirm("Há alertas nesta permuta:\n"+alertas.map(a=>"• "+a.texto).join("\n")+"\n\nDeseja solicitar mesmo assim?"))return;

  try{
    const docRef=await addDoc(collection(db,COL_PERMUTAS),{
      status:"aguardando_servidor",
      solicitanteSrvId:_meuServidorPermuta.id,solicitanteNome:_meuServidorPermuta.nome,
      solicitanteMat:_meuServidorPermuta.matricula,solicitanteEmail:_meuServidorPermuta.email||"",
      solicitanteCargo:_meuServidorPermuta.cargo||"",
      destinatarioSrvId:_destinatarioPermuta.id,destinatarioNome:_destinatarioPermuta.nome,
      destinatarioMat:_destinatarioPermuta.matricula,destinatarioEmail:_destinatarioPermuta.email||"",
      destinatarioCargo:_destinatarioPermuta.cargo||"",
      cedeData:pA.data,cedeTurno:pA.turno,cedeJornada:pA.jornada,cedeMesChave:pA.mesChave,cedeDia:pA.dia,cedeIdx:pA.idx,
      recebeData:pB.data,recebeTurno:pB.turno,recebeJornada:pB.jornada,recebeMesChave:pB.mesChave,recebeDia:pB.dia,recebeIdx:pB.idx,
      motivo:v("perm-obs"),
      alertas:alertas.map(a=>a.texto),
      criadoPor:usuarioLogado?.nome||"",criadoEm:serverTimestamp()
    });
    await registrarAuditoria("Solicitou permuta de serviço",
      `${_meuServidorPermuta.nome} (${pA.data} ${TURNO_LABEL[pA.turno]}) ↔ ${_destinatarioPermuta.nome} (${pB.data} ${TURNO_LABEL[pB.turno]})`);
    if(_destinatarioPermuta.email){
      await enviarNotificacao(_destinatarioPermuta.email,"🔄 Nova solicitação de permuta",
        `${_meuServidorPermuta.nome} deseja trocar o plantão do dia ${pA.data} (${TURNO_LABEL[pA.turno]}) pelo seu plantão do dia ${pB.data} (${TURNO_LABEL[pB.turno]}).\n${v("perm-obs")?"Obs: "+v("perm-obs"):""}\n\nAcesse "Policial Municipal → Permuta de Serviço" para aceitar ou recusar.`,
        "meupainel");
    }
    alerta("Solicitação de permuta enviada!","ok");
    await iniciarPermutaServidor();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.solicitarPermuta=solicitarPermuta;

export async function renderMinhasPermutas(){
  const el=document.getElementById("perm-minhas-lista");
  if(!el)return;
  el.innerHTML='<p class="hist-vazio">Carregando...</p>';
  const minhaMat=normalizarMatricula(usuarioLogado?.matricula);
  try{
    const snap=await getDocs(collection(db,COL_PERMUTAS));
    const minhas=snap.docs.map(d=>({id:d.id,...d.data()}))
      .filter(p=>normalizarMatricula(p.solicitanteMat)===minhaMat||normalizarMatricula(p.destinatarioMat)===minhaMat)
      .sort((a,b)=>(b.criadoEm?.seconds||0)-(a.criadoEm?.seconds||0));
    const badge=document.getElementById("badge-mp-permuta");
    const pendentesMinhas=minhas.filter(p=>p.status==="aguardando_servidor"&&normalizarMatricula(p.destinatarioMat)===minhaMat).length;
    if(badge)badge.textContent=pendentesMinhas;
    el.innerHTML=minhas.length?minhas.map(p=>{
      const souDestinatario=normalizarMatricula(p.destinatarioMat)===minhaMat;
      const statusInfo={
        aguardando_servidor:["🟡","Aguardando resposta do outro servidor"],
        aguardando_administrativo:["🟠","Aguardando aprovação do Administrativo"],
        aprovada:["✅","Permuta aprovada"],
        rejeitada_servidor:["❌","Recusada pelo servidor"],
        rejeitada_administrativo:["❌","Rejeitada pelo Administrativo"]
      }[p.status]||["—",p.status];
      let acoesHtml="";
      if(souDestinatario&&p.status==="aguardando_servidor"){
        acoesHtml=`<div style="display:flex;gap:6px;margin-top:8px">
          <button class="btn btn-sm" style="flex:1;background:rgba(125,206,160,.2);border-color:#7dcea0;color:#7dcea0" onclick="responderPermuta('${p.id}',true)">✅ Aceitar</button>
          <button class="btn btn-sm btn-perigo" style="flex:1" onclick="responderPermuta('${p.id}',false)">❌ Recusar</button>
        </div>`;
      }
      return`<div class="hist-item">
        <div class="hist-tipo">${statusInfo[0]} ${statusInfo[1]}${p.protocolo?" · "+p.protocolo:""}</div>
        <div class="hist-data">${esc(p.solicitanteNome)} (${p.cedeData} ${TURNO_LABEL[p.cedeTurno]||""}) ↔ ${esc(p.destinatarioNome)} (${p.recebeData} ${TURNO_LABEL[p.recebeTurno]||""})</div>
        ${p.motivo?`<div class="hist-corpo">Motivo: ${esc(p.motivo)}</div>`:""}
        ${p.motivoRejeicao?`<div class="hist-corpo">Justificativa: ${esc(p.motivoRejeicao)}</div>`:""}
        ${acoesHtml}
      </div>`;
    }).join(""):'<p class="hist-vazio">Nenhuma permuta solicitada ou recebida ainda.</p>';
  }catch(err){el.innerHTML=`<p class="hist-vazio">Erro: ${err.message}</p>`;}
}

export async function responderPermuta(id,aceitou){
  if(!confirm(aceitou?"Aceitar esta permuta? Ela seguirá para aprovação do Administrativo.":"Recusar esta permuta?"))return;
  try{
    await updateDoc(doc(db,COL_PERMUTAS,id),{
      status:aceitou?"aguardando_administrativo":"rejeitada_servidor",
      respostaServidorEm:serverTimestamp()
    });
    const snap=await getDoc(doc(db,COL_PERMUTAS,id));
    const p=snap.data();
    await registrarAuditoria(aceitou?"Aceitou permuta de serviço":"Recusou permuta de serviço",
      `${p.destinatarioNome} — permuta com ${p.solicitanteNome}`);
    if(p.solicitanteEmail){
      await enviarNotificacao(p.solicitanteEmail,aceitou?"🟡 Permuta aceita — aguardando Administrativo":"❌ Permuta recusada",
        aceitou?`${p.destinatarioNome} aceitou sua solicitação de permuta. Agora aguarda aprovação do Administrativo.`
               :`${p.destinatarioNome} recusou sua solicitação de permuta.`,"meupainel");
    }
    alerta(aceitou?"Permuta aceita! Aguardando o Administrativo.":"Permuta recusada.","ok");
    await renderMinhasPermutas();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.responderPermuta=responderPermuta;

export async function atualizarBadgePermutasAdmin(){
  try{
    const snap=await getDocs(query(collection(db,COL_PERMUTAS),where("status","==","aguardando_administrativo")));
    const badge=document.getElementById("badge-adm-permutas");
    if(badge)badge.textContent=snap.size;
  }catch(e){}
}

export async function renderPermutasAdmin(){
  const el=document.getElementById("permutas-admin-lista");
  if(!el)return;
  el.innerHTML='<p class="hist-vazio">Carregando...</p>';
  const filtro=v("permutas-filtro-status");
  try{
    const snap=await getDocs(collection(db,COL_PERMUTAS));
    let lista=snap.docs.map(d=>({id:d.id,...d.data()}));
    const pendentesCount=lista.filter(p=>p.status==="aguardando_administrativo").length;
    const badge=document.getElementById("badge-adm-permutas");
    if(badge)badge.textContent=pendentesCount;
    if(filtro)lista=lista.filter(p=>p.status===filtro);
    lista.sort((a,b)=>(b.criadoEm?.seconds||0)-(a.criadoEm?.seconds||0));
    const cnt=document.getElementById("permutas-admin-contador");
    if(cnt)cnt.textContent=lista.length?`${lista.length} permuta(s)`:"";
    el.innerHTML=lista.length?lista.map(p=>{
      const acoes=p.status==="aguardando_administrativo"?`<div style="display:flex;gap:6px;margin-top:8px">
        <button class="btn btn-sm" style="flex:1;background:rgba(125,206,160,.2);border-color:#7dcea0;color:#7dcea0" onclick="aprovarPermuta('${p.id}')">✅ Aprovar</button>
        <button class="btn btn-sm btn-perigo" style="flex:1" onclick="rejeitarPermutaAdmin('${p.id}')">❌ Rejeitar</button>
      </div>`:"";
      const alertasHtml=(p.alertas||[]).length?`<div class="hist-corpo">${(p.alertas||[]).map(a=>"⚠️ "+a).join("<br>")}</div>`:"";
      return`<div class="hist-item">
        <div class="hist-tipo">👤 ${esc(p.solicitanteNome)} (Mat: ${esc(p.solicitanteMat)}) ↔ ${esc(p.destinatarioNome)} (Mat: ${esc(p.destinatarioMat)})</div>
        <div class="hist-data">Cede: ${p.cedeData} · ${TURNO_LABEL[p.cedeTurno]||esc(p.cedeTurno)} · ${esc(p.cedeJornada)}</div>
        <div class="hist-data">Recebe: ${p.recebeData} · ${TURNO_LABEL[p.recebeTurno]||esc(p.recebeTurno)} · ${esc(p.recebeJornada)}</div>
        ${p.motivo?`<div class="hist-corpo">Motivo: ${esc(p.motivo)}</div>`:""}
        ${alertasHtml}
        ${p.protocolo?`<div class="hist-corpo">Protocolo: <strong>${esc(p.protocolo)}</strong> — aprovado por ${esc(p.aprovadoPor)}</div>`:""}
        ${p.motivoRejeicao?`<div class="hist-corpo">Justificativa da rejeição: ${esc(p.motivoRejeicao)}</div>`:""}
        ${acoes}
      </div>`;
    }).join(""):'<p class="hist-vazio">Nenhuma permuta encontrada.</p>';
  }catch(err){el.innerHTML=`<p class="hist-vazio">Erro: ${err.message}</p>`;}
}

export async function trocarEntradaEscala(mesChave,dia,idx,novoSrvId,novoNome){
  const ref=doc(db,COL_ESCALA_MENSAL,mesChave);
  const snap=await getDoc(ref);
  const dados=snap.exists()?(snap.data().dias||{}):{};
  const arr=dados[dia]||[];
  if(!arr[idx])throw new Error(`Entrada da escala não encontrada (dia ${dia}).`);
  arr[idx]={...arr[idx],srvId:novoSrvId,nomeServidor:novoNome};
  dados[dia]=arr;
  await setDoc(ref,{dias:dados,atualizadoPor:usuarioLogado?.nome||"",atualizadoEm:serverTimestamp()},{merge:true});
}

export function gerarProtocoloPermuta(){
  return `PERM-${new Date().getFullYear()}-${Math.floor(100000+Math.random()*900000)}`;
}

export async function aprovarPermuta(id){
  if(!confirm("Aprovar esta permuta? As escalas dos dois servidores serão atualizadas automaticamente."))return;
  try{
    const snap=await getDoc(doc(db,COL_PERMUTAS,id));
    if(!snap.exists())return alerta("Permuta não encontrada.","erro");
    const p=snap.data();
    // servidor B assume o dia que era do servidor A, e vice-versa
    await trocarEntradaEscala(p.cedeMesChave,p.cedeDia,p.cedeIdx,p.destinatarioSrvId,p.destinatarioNome);
    await trocarEntradaEscala(p.recebeMesChave,p.recebeDia,p.recebeIdx,p.solicitanteSrvId,p.solicitanteNome);

    const protocolo=gerarProtocoloPermuta();
    await updateDoc(doc(db,COL_PERMUTAS,id),{
      status:"aprovada",protocolo,
      aprovadoPor:usuarioLogado?.nome||"",aprovadoPorMat:usuarioLogado?.matricula||"",aprovadoEm:serverTimestamp()
    });
    await registrarAuditoria("Aprovou permuta de serviço",
      `Protocolo ${protocolo} — ${p.solicitanteNome} ↔ ${p.destinatarioNome} — por ${usuarioLogado?.nome||""}`);

    const msg=(nome)=>`Sua permuta com ${nome} foi aprovada!\nProtocolo: ${protocolo}\nAprovado por: ${usuarioLogado?.nome||""}`;
    if(p.solicitanteEmail)await enviarNotificacao(p.solicitanteEmail,"✅ Permuta Aprovada",msg(p.destinatarioNome),"administrativo");
    if(p.destinatarioEmail)await enviarNotificacao(p.destinatarioEmail,"✅ Permuta Aprovada",msg(p.solicitanteNome),"administrativo");

    alerta(`Permuta aprovada! Protocolo ${protocolo}`,"ok");
    await renderPermutasAdmin();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.aprovarPermuta=aprovarPermuta;

export async function rejeitarPermutaAdmin(id){
  const motivo=prompt("Motivo da rejeição:");
  if(motivo===null)return;
  try{
    const snap=await getDoc(doc(db,COL_PERMUTAS,id));
    const p=snap.data();
    await updateDoc(doc(db,COL_PERMUTAS,id),{
      status:"rejeitada_administrativo",motivoRejeicao:motivo,
      rejeitadoPor:usuarioLogado?.nome||"",rejeitadoPorMat:usuarioLogado?.matricula||"",rejeitadoEm:serverTimestamp()
    });
    await registrarAuditoria("Rejeitou permuta de serviço",
      `${p.solicitanteNome} ↔ ${p.destinatarioNome} — Motivo: ${motivo} — por ${usuarioLogado?.nome||""}`);
    const msg=`Sua solicitação de permuta foi rejeitada pelo Administrativo.\nMotivo: ${motivo}`;
    if(p.solicitanteEmail)await enviarNotificacao(p.solicitanteEmail,"❌ Permuta Rejeitada",msg,"administrativo");
    if(p.destinatarioEmail)await enviarNotificacao(p.destinatarioEmail,"❌ Permuta Rejeitada",msg,"administrativo");
    alerta("Permuta rejeitada.","ok");
    await renderPermutasAdmin();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.rejeitarPermutaAdmin=rejeitarPermutaAdmin;

export async function verificarAlertaBancoHorasNegativo(srvMat,srvNome,srvEmail){
  if(!srvEmail)return;
  try{
    const snap=await getDocs(query(collection(db,COL_BH),where("srvMat","==",srvMat)));
    const lista=snap.docs.map(d=>d.data());
    const saldo=calcularSaldoBH(lista);
    if(saldo<=LIMITE_SALDO_NEGATIVO_ALERTA){
      await enviarNotificacao(srvEmail,"⚠️ Saldo do Banco de Horas Negativo",
        `${srvNome}, seu saldo no banco de horas está em ${saldo}h. Procure o Administrativo para regularizar.`,"administrativo");
    }
  }catch(e){}
}

export function iniciarLancarHoraExtraordinaria(){
  document.getElementById("he-busca-servidor").value="";
  document.getElementById("he-servidor-resultado").innerHTML="";
  document.getElementById("he-data").value=new Date().toISOString().slice(0,10);
  document.getElementById("he-inicio").value="";
  document.getElementById("he-fim").value="";
  document.getElementById("he-motivo-tipo").value="";
  document.getElementById("he-motivo-desc").style.display="none";
  document.getElementById("he-motivo-desc").value="";
  document.getElementById("he-num-ocorrencia").value="";
  document.getElementById("he-anexo-ref").value="";
  document.getElementById("he-autorizacao-wrap").style.display="none";
  document.getElementById("he-autorizacao").value="";
  document.getElementById("he-qtd-preview").innerHTML="";
  document.getElementById("he-alertas-preview").innerHTML="";
  _heServidoresSelecionados=[];
  renderServidoresSelecionadosHE();
  renderMinhasHorasExtras();
}

export function buscarServidorHoraExtra(){
  clearTimeout(_buscaHETimeout);
  _buscaHETimeout=setTimeout(async()=>{
    const q=v("he-busca-servidor").toLowerCase();
    const el=document.getElementById("he-servidor-resultado");
    if(!q){el.innerHTML="";return;}
    if(!servidoresCache.length){
      try{
        const snap=await getDocs(query(collection(db,COL_SERV),where("ativo","==",true)));
        servidoresCache=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.nome.localeCompare(b.nome));
      }catch(e){}
    }
    const jaSelecionados=_heServidoresSelecionados.map(s=>s.id);
    const achados=servidoresCache.filter(s=>!jaSelecionados.includes(s.id)&&
      (s.nome?.toLowerCase().includes(q)||s.matricula?.toLowerCase().includes(q))).slice(0,8);
    el.innerHTML=achados.length?achados.map(s=>`<div class="servidor-card" data-sid="${s.id}">
        <div class="sc-nome">${esc(s.nome)}</div><div class="sc-mat">Mat: ${esc(s.matricula)}${s.cargo?" · "+s.cargo:""}</div>
      </div>`).join(""):'<p class="hist-vazio">Nenhum servidor encontrado.</p>';
    el.querySelectorAll(".servidor-card").forEach(card=>{
      card.addEventListener("click",()=>{
        const srv=servidoresCache.find(s=>s.id===card.dataset.sid);
        if(srv){_heServidoresSelecionados.push(srv);renderServidoresSelecionadosHE();
          document.getElementById("he-busca-servidor").value="";el.innerHTML="";recalcularHoraExtraordinaria();}
      });
    });
  },300);
}
window.buscarServidorHoraExtra=buscarServidorHoraExtra;

export function renderServidoresSelecionadosHE(){
  const el=document.getElementById("he-servidores-selecionados");
  el.innerHTML=_heServidoresSelecionados.length?_heServidoresSelecionados.map(s=>
    `<span class="badge" style="margin:3px 4px 3px 0;cursor:pointer" onclick="removerServidorHE('${s.id}')">${esc(s.nome)} ✕</span>`).join(""):
    '<p class="hist-vazio" style="margin:0">Nenhum servidor adicionado ainda.</p>';
}

export function removerServidorHE(id){
  _heServidoresSelecionados=_heServidoresSelecionados.filter(s=>s.id!==id);
  renderServidoresSelecionadosHE();recalcularHoraExtraordinaria();
}
window.removerServidorHE=removerServidorHE;

export function toggleMotivoHoraExtraOutro(){
  document.getElementById("he-motivo-desc").style.display=v("he-motivo-tipo")==="Outro"?"block":"none";
}
window.toggleMotivoHoraExtraOutro=toggleMotivoHoraExtraOutro;

export function calcularDuracaoHoras(inicio,fim){
  if(!inicio||!fim)return 0;
  const [ih,im]=inicio.split(":").map(Number),[fh,fm]=fim.split(":").map(Number);
  let minutos=(fh*60+fm)-(ih*60+im);
  if(minutos<=0)minutos+=24*60; // atravessou a meia-noite
  return Math.round((minutos/60)*100)/100;
}

export function horariosSeSobrepoem(iniA,fimA,iniB,fimB){
  const toMin=(h)=>{const[a,b]=h.split(":").map(Number);return a*60+b;};
  let a1=toMin(iniA),a2=toMin(fimA);if(a2<=a1)a2+=1440;
  let b1=toMin(iniB),b2=toMin(fimB);if(b2<=b1)b2+=1440;
  return a1<b2&&b1<a2;
}

export async function obterEntradaEscalaPorData(srvId,dataISO){
  const[ano,mes,dia]=dataISO.split("-").map(Number);
  try{
    const snap=await getDoc(doc(db,COL_ESCALA_MENSAL,chaveEscala(ano,mes-1)));
    if(!snap.exists())return null;
    const arr=(snap.data().dias||{})[String(Number(dia))]||[];
    return arr.find(e=>e.srvId===srvId)||null;
  }catch(e){return null;}
}

export async function recalcularHoraExtraordinaria(){
  const inicio=v("he-inicio"),fim=v("he-fim");
  const qtd=calcularDuracaoHoras(inicio,fim);
  const preview=document.getElementById("he-qtd-preview");
  preview.innerHTML=inicio&&fim?`<div class="hist-tipo">⏱ Duração calculada: <strong>${qtd}h</strong></div>`:"";
  document.getElementById("he-autorizacao-wrap").style.display=qtd>LIMITE_HORAS_SEM_AUTORIZACAO_SUPERIOR?"block":"none";
  await renderAlertasHoraExtraPreview();
}
window.recalcularHoraExtraordinaria=recalcularHoraExtraordinaria;

export async function renderAlertasHoraExtraPreview(){
  const el=document.getElementById("he-alertas-preview");
  const data=v("he-data"),inicio=v("he-inicio"),fim=v("he-fim");
  if(!data||!inicio||!fim||!_heServidoresSelecionados.length){el.innerHTML="";return;}
  const qtd=calcularDuracaoHoras(inicio,fim);
  const todosAlertas=[];
  for(const srv of _heServidoresSelecionados){
    const{alertas}=await validarLancamentoHoraExtra(srv,data,inicio,fim,qtd);
    todosAlertas.push(...alertas.map(a=>({...a,texto:`${esc(srv.nome)}: ${a.texto}`})));
  }
  el.innerHTML=todosAlertas.map(a=>`<div class="sit-alerta ${a.nivel}">${a.nivel==="critico"?"🔴":"🟡"} ${esc(a.texto)}</div>`).join("");
}

export async function validarLancamentoHoraExtra(srv,data,inicio,fim,qtd){
  const alertas=[];let bloqueado=false;
  if(srv.situacao&&srv.situacao!=="Ativo"){
    alertas.push({nivel:"critico",texto:`situação "${srv.situacao}" — não é possível lançar hora extra.`});
    bloqueado=true;
  }
  const entradaEscala=await obterEntradaEscalaPorData(srv.id,data);
  if(entradaEscala&&TURNO_HORARIOS[entradaEscala.turno]){
    const[schedIni,schedFim]=TURNO_HORARIOS[entradaEscala.turno];
    if(horariosSeSobrepoem(inicio,fim,schedIni,schedFim)){
      alertas.push({nivel:"critico",texto:`o horário informado (${inicio}–${fim}) invade o horário normal da escala (${entradaEscala.turno}: ${schedIni}–${schedFim}).`});
      bloqueado=true;
    }
  }
  try{
    const snapDup=await getDocs(query(collection(db,COL_BH),where("srvMat","==",srv.matricula),where("data","==",data)));
    const conflito=snapDup.docs.map(d=>d.data()).some(l=>l.horaInicio&&l.horaFim&&l.status!=="rejeitada"&&horariosSeSobrepoem(inicio,fim,l.horaInicio,l.horaFim));
    if(conflito){
      alertas.push({nivel:"critico",texto:"já existe um lançamento de horas para este servidor nesse mesmo período."});
      bloqueado=true;
    }
  }catch(e){}
  if(qtd>LIMITE_HORAS_SEM_AUTORIZACAO_SUPERIOR&&!v("he-autorizacao")){
    alertas.push({nivel:"importante",texto:`acima de ${LIMITE_HORAS_SEM_AUTORIZACAO_SUPERIOR}h exige autorização de superior hierárquico (preencha o campo abaixo).`});
  }
  return{alertas,bloqueado};
}

export function gerarProtocoloHE(){
  return `HE-${new Date().getFullYear()}-${Math.floor(100000+Math.random()*900000)}`;
}

export async function registrarHoraExtraordinaria(){
  if(!_heServidoresSelecionados.length)return alerta("Adicione ao menos um servidor.","erro");
  const data=v("he-data"),inicio=v("he-inicio"),fim=v("he-fim");
  if(!data||!inicio||!fim)return alerta("Preencha data, início e término.","erro");
  const motivoTipo=v("he-motivo-tipo");
  if(!motivoTipo)return alerta("Selecione o motivo.","erro");
  const motivoDesc=v("he-motivo-desc");
  if(motivoTipo==="Outro"&&!motivoDesc)return alerta("Descreva o motivo.","erro");
  const qtd=calcularDuracaoHoras(inicio,fim);
  if(qtd<=0)return alerta("Horário inválido.","erro");
  const autorizacao=v("he-autorizacao");
  if(qtd>LIMITE_HORAS_SEM_AUTORIZACAO_SUPERIOR&&!autorizacao)
    return alerta(`Lançamentos acima de ${LIMITE_HORAS_SEM_AUTORIZACAO_SUPERIOR}h exigem autorização de superior hierárquico.`,"erro");

  // roda as validações de bloqueio para cada servidor antes de salvar qualquer coisa
  const bloqueios=[];
  for(const srv of _heServidoresSelecionados){
    const{alertas,bloqueado}=await validarLancamentoHoraExtra(srv,data,inicio,fim,qtd);
    if(bloqueado)bloqueios.push(`${esc(srv.nome)}: `+alertas.filter(a=>a.nivel==="critico").map(a=>a.texto).join("; "));
  }
  if(bloqueios.length)return alerta("Não é possível registrar:\n"+bloqueios.join("\n"),"erro");

  const numOcorrencia=v("he-num-ocorrencia"),anexoRef=v("he-anexo-ref");
  const protocolo=gerarProtocoloHE();
  const motivoFinal=motivoTipo==="Outro"?motivoDesc:motivoTipo+(motivoDesc?" — "+motivoDesc:"");

  try{
    for(const srv of _heServidoresSelecionados){
      await addDoc(collection(db,COL_BH),{
        srvId:srv.id,srvNome:srv.nome,srvMat:srv.matricula,srvEmail:srv.email||"",
        data,tipo:"extra",qtd,tipoHora:"extraordinaria",status:"pendente_analise",
        horaInicio:inicio,horaFim:fim,motivo:motivoFinal,numeroOcorrencia:numOcorrencia,anexoRef,
        autorizacaoSuperior:autorizacao,protocolo,
        obs:motivoFinal,
        lancadoPor:usuarioLogado?.nome||"",lancadoPorMat:usuarioLogado?.matricula||"",criadoEm:serverTimestamp()
      });
      if(srv.email){
        await enviarNotificacao(srv.email,"⏱ Hora Extraordinária Lançada",
          `Data: ${data}\nHorário: ${inicio}–${fim} (${qtd}h)\nMotivo: ${motivoFinal}\nProtocolo: ${protocolo}\nStatus: aguardando análise do Administrativo.`,"administrativo");
      }
    }
    await registrarAuditoria("Lançou hora extraordinária",
      `Protocolo ${protocolo} — Servidor(es): ${_heServidoresSelecionados.map(s=>s.nome).join(", ")}\nData: ${data} · ${inicio}–${fim} (${qtd}h)\nMotivo: ${motivoFinal}`);
    alerta(`Hora extraordinária registrada! Protocolo ${protocolo}. Aguarda análise do Administrativo.`,"ok");
    iniciarLancarHoraExtraordinaria();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.registrarHoraExtraordinaria=registrarHoraExtraordinaria;

export async function renderMinhasHorasExtras(){
  const el=document.getElementById("he-minhas-lista");
  if(!el)return;
  el.innerHTML='<p class="hist-vazio">Carregando...</p>';
  try{
    const snap=await getDocs(query(collection(db,COL_BH),where("lancadoPorMat","==",usuarioLogado?.matricula||""),where("tipoHora","==","extraordinaria")));
    const lista=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.criadoEm?.seconds||0)-(a.criadoEm?.seconds||0)).slice(0,20);
    const statusInfo={
      pendente_analise:["🟡","Pendente de Análise"],aprovada:["✅","Aprovada"],
      correcao_solicitada:["🔧","Correção Solicitada"],rejeitada:["❌","Rejeitada"]
    };
    el.innerHTML=lista.length?lista.map(l=>{
      const si=statusInfo[l.status]||["—",l.status];
      const acoes=l.status==="correcao_solicitada"?
        `<button class="btn btn-sm btn-dourado" style="margin-top:6px" onclick="reenviarHoraExtra('${l.id}')">✏️ Corrigir e Reenviar</button>`:"";
      return`<div class="hist-item">
        <div class="hist-tipo">${si[0]} ${si[1]} · ${esc(l.protocolo)}</div>
        <div class="hist-data">${esc(l.srvNome)} · ${l.data} · ${esc(l.horaInicio)}–${esc(l.horaFim)} (${l.qtd}h)</div>
        <div class="hist-corpo">${esc(l.motivo)}</div>
        ${l.motivoRejeicao?`<div class="hist-corpo">Retorno do Administrativo: ${esc(l.motivoRejeicao)}</div>`:""}
        ${acoes}
      </div>`;
    }).join(""):'<p class="hist-vazio">Nenhum lançamento ainda.</p>';
  }catch(err){el.innerHTML=`<p class="hist-vazio">Erro: ${err.message}</p>`;}
}

export async function reenviarHoraExtra(id){
  const correcao=prompt("Descreva a correção feita antes de reenviar:");
  if(correcao===null)return;
  try{
    await updateDoc(doc(db,COL_BH,id),{
      status:"pendente_analise",correcaoDoInspetor:correcao,motivoRejeicao:"",reenviadoEm:serverTimestamp()
    });
    await registrarAuditoria("Reenviou hora extraordinária após correção",`Doc ${id}: ${correcao}`);
    alerta("Reenviado para nova análise.","ok");
    renderMinhasHorasExtras();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.reenviarHoraExtra=reenviarHoraExtra;

export async function atualizarBadgeHorasExtrasAdmin(){
  try{
    const snap=await getDocs(query(collection(db,COL_BH),where("tipoHora","==","extraordinaria"),where("status","==","pendente_analise")));
    const badge=document.getElementById("badge-adm-he");
    if(badge)badge.textContent=snap.size;
  }catch(e){}
}

export async function renderAnaliseHorasExtras(){
  const el=document.getElementById("he-admin-lista");
  if(!el)return;
  el.innerHTML='<p class="hist-vazio">Carregando...</p>';
  const filtro=v("he-filtro-status");
  try{
    const snap=await getDocs(query(collection(db,COL_BH),where("tipoHora","==","extraordinaria")));
    let lista=snap.docs.map(d=>({id:d.id,...d.data()}));
    atualizarBadgeHorasExtrasAdmin();
    if(filtro)lista=lista.filter(l=>l.status===filtro);
    lista.sort((a,b)=>(b.criadoEm?.seconds||0)-(a.criadoEm?.seconds||0));
    const cnt=document.getElementById("he-admin-contador");
    if(cnt)cnt.textContent=lista.length?`${lista.length} lançamento(s)`:"";
    el.innerHTML=lista.length?lista.map(l=>{
      const acoes=l.status==="pendente_analise"?`<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
        <button class="btn btn-sm" style="flex:1;background:rgba(125,206,160,.2);border-color:#7dcea0;color:#7dcea0" onclick="aprovarHoraExtra('${l.id}')">✅ Aprovar</button>
        <button class="btn btn-sm" style="flex:1;background:rgba(251,191,36,.2);border-color:#fbbf24;color:#fbbf24" onclick="solicitarCorrecaoHoraExtra('${l.id}')">🔧 Corrigir</button>
        <button class="btn btn-sm btn-perigo" style="flex:1" onclick="rejeitarHoraExtra('${l.id}')">❌ Rejeitar</button>
      </div>`:"";
      return`<div class="hist-item">
        <div class="hist-tipo">👤 ${esc(l.srvNome)} (Mat: ${esc(l.srvMat)}) · ${esc(l.protocolo)}</div>
        <div class="hist-data">${l.data} · ${esc(l.horaInicio)}–${esc(l.horaFim)} · ${l.qtd}h</div>
        <div class="hist-corpo">Motivo: ${esc(l.motivo)}${l.numeroOcorrencia?"<br>Ocorrência: "+esc(l.numeroOcorrencia):""}${l.anexoRef?"<br>Anexo: "+esc(l.anexoRef):""}</div>
        <div class="hist-corpo">Lançado por: ${esc(l.lancadoPor)}${l.autorizacaoSuperior?"<br>Autorização superior: "+esc(l.autorizacaoSuperior):""}</div>
        ${l.correcaoDoInspetor?`<div class="hist-corpo">Correção do inspetor: ${esc(l.correcaoDoInspetor)}</div>`:""}
        ${l.motivoRejeicao?`<div class="hist-corpo">Retorno: ${esc(l.motivoRejeicao)}</div>`:""}
        ${l.analisadoPor?`<div class="hist-corpo">Analisado por: ${esc(l.analisadoPor)}</div>`:""}
        ${acoes}
      </div>`;
    }).join(""):'<p class="hist-vazio">Nenhum lançamento encontrado.</p>';
  }catch(err){el.innerHTML=`<p class="hist-vazio">Erro: ${err.message}</p>`;}
}

export async function aprovarHoraExtra(id){
  if(!confirm("Aprovar esta hora extraordinária? Ela passará a contar no saldo do servidor."))return;
  try{
    const snap=await getDoc(doc(db,COL_BH,id));
    const l=snap.data();
    await updateDoc(doc(db,COL_BH,id),{
      status:"aprovada",analisadoPor:usuarioLogado?.nome||"",analisadoPorMat:usuarioLogado?.matricula||"",analisadoEm:serverTimestamp()
    });
    await registrarAuditoria("Aprovou hora extraordinária",`${l.srvNome} — ${l.protocolo} — ${l.qtd}h — por ${usuarioLogado?.nome||""}`);
    if(l.srvEmail)await enviarNotificacao(l.srvEmail,"✅ Hora Extraordinária Aprovada",
      `Protocolo: ${l.protocolo}\n${l.qtd}h em ${l.data}\nAprovado por: ${usuarioLogado?.nome||""}`,"administrativo");
    alerta("Aprovado!","ok");
    renderAnaliseHorasExtras();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.aprovarHoraExtra=aprovarHoraExtra;

export async function solicitarCorrecaoHoraExtra(id){
  const motivo=prompt("O que precisa ser corrigido?");
  if(motivo===null)return;
  try{
    const snap=await getDoc(doc(db,COL_BH,id));
    const l=snap.data();
    await updateDoc(doc(db,COL_BH,id),{
      status:"correcao_solicitada",motivoRejeicao:motivo,
      analisadoPor:usuarioLogado?.nome||"",analisadoPorMat:usuarioLogado?.matricula||"",analisadoEm:serverTimestamp()
    });
    await registrarAuditoria("Solicitou correção de hora extraordinária",`${l.srvNome} — ${l.protocolo} — Motivo: ${motivo}`);
    alerta("Correção solicitada ao inspetor responsável.","ok");
    renderAnaliseHorasExtras();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.solicitarCorrecaoHoraExtra=solicitarCorrecaoHoraExtra;

export async function rejeitarHoraExtra(id){
  const motivo=prompt("Motivo da rejeição:");
  if(motivo===null)return;
  try{
    const snap=await getDoc(doc(db,COL_BH,id));
    const l=snap.data();
    await updateDoc(doc(db,COL_BH,id),{
      status:"rejeitada",motivoRejeicao:motivo,
      analisadoPor:usuarioLogado?.nome||"",analisadoPorMat:usuarioLogado?.matricula||"",analisadoEm:serverTimestamp()
    });
    await registrarAuditoria("Rejeitou hora extraordinária",`${l.srvNome} — ${l.protocolo} — Motivo: ${motivo}`);
    if(l.srvEmail)await enviarNotificacao(l.srvEmail,"❌ Hora Extraordinária Rejeitada",
      `Protocolo: ${l.protocolo}\nMotivo: ${motivo}`,"administrativo");
    alerta("Rejeitado.","ok");
    renderAnaliseHorasExtras();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.rejeitarHoraExtra=rejeitarHoraExtra;

export async function carregarDashboardHorasExtras(){
  const mesAtual=new Date().toISOString().slice(0,7);
  try{
    const snap=await getDocs(collection(db,COL_BH));
    const todos=snap.docs.map(d=>d.data());
    const doMes=todos.filter(l=>l.data?.startsWith(mesAtual));

    const planejadas=doMes.filter(l=>l.tipo==="extra"&&l.tipoHora==="programada"&&(!l.status||l.status==="aprovada"))
      .reduce((s,l)=>s+Number(l.qtd||0),0);
    const pendentes=doMes.filter(l=>l.tipoHora==="extraordinaria"&&l.status==="pendente_analise")
      .reduce((s,l)=>s+Number(l.qtd||0),0);
    const aprovadas=doMes.filter(l=>l.tipo==="extra"&&(l.tipoHora==="extraordinaria"||l.tipoHora==="emergencial")&&l.status==="aprovada");
    const rejeitadas=doMes.filter(l=>l.status==="rejeitada").reduce((s,l)=>s+Number(l.qtd||0),0);

    document.getElementById("dhe-planejadas").textContent=planejadas+"h";
    document.getElementById("dhe-pendentes").textContent=pendentes+"h";
    document.getElementById("dhe-aprovadas").textContent=aprovadas.reduce((s,l)=>s+Number(l.qtd||0),0)+"h";
    document.getElementById("dhe-rejeitadas").textContent=rejeitadas+"h";
    _dheAprovadasMes=aprovadas;
    recalcularCustoHorasExtras();

    // ranking por servidor
    const porServidor={};
    doMes.filter(l=>l.tipo==="extra"&&(!l.status||l.status==="aprovada")).forEach(l=>{
      porServidor[l.srvNome]=(porServidor[l.srvNome]||0)+Number(l.qtd||0);
    });
    const ranking=Object.entries(porServidor).sort((a,b)=>b[1]-a[1]).slice(0,10);
    document.getElementById("dhe-ranking").innerHTML=ranking.length?ranking.map(([nome,h],i)=>
      `<div class="hist-item"><div class="hist-tipo">${i+1}º ${nome}</div><div class="hist-corpo">${h}h no mês</div></div>`).join("")
      :'<p class="hist-vazio">Nenhum lançamento no mês.</p>';

    // por equipe/unidade (cruza com servidoresCache)
    if(!servidoresCache.length){
      try{
        const snapS=await getDocs(query(collection(db,COL_SERV),where("ativo","==",true)));
        servidoresCache=snapS.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.nome.localeCompare(b.nome));
      }catch(e){}
    }
    const porEquipe={};
    doMes.filter(l=>l.tipo==="extra"&&(!l.status||l.status==="aprovada")).forEach(l=>{
      const srv=servidoresCache.find(s=>s.matricula===l.srvMat);
      const chave=srv?.equipe||srv?.unidade||"Não identificado";
      porEquipe[chave]=(porEquipe[chave]||0)+Number(l.qtd||0);
    });
    const listaEquipe=Object.entries(porEquipe).sort((a,b)=>b[1]-a[1]);
    document.getElementById("dhe-por-equipe").innerHTML=listaEquipe.length?listaEquipe.map(([nome,h])=>
      `<div class="hist-item"><div class="hist-tipo">🏢 ${nome}</div><div class="hist-corpo">${h}h no mês</div></div>`).join("")
      :'<p class="hist-vazio">Sem dados no mês.</p>';
  }catch(err){alerta("Erro ao carregar dashboard: "+err.message,"erro");}
}

export function recalcularCustoHorasExtras(){
  const valorHora=Number(v("dhe-valor-hora"))||0;
  const totalHoras=_dheAprovadasMes.reduce((s,l)=>s+Number(l.qtd||0),0);
  const custo=(valorHora*totalHoras).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
  document.getElementById("dhe-custo").textContent=valorHora>0
    ?`${totalHoras}h aprovadas × R$ ${valorHora}/h = ${custo}`
    :"Informe o valor da hora acima.";
}
window.recalcularCustoHorasExtras=recalcularCustoHorasExtras;

export function chaveEquipe(nome,data){return `${nome.trim().toLowerCase().replace(/\s+/g,"_")}_${data}`;}

export async function upsertEquipe(nomeEquipe,data,srv){
  if(!nomeEquipe||!nomeEquipe.trim())return;
  const chave=chaveEquipe(nomeEquipe,data);
  try{
    const ref=doc(db,COL_EQUIPES,chave);
    const snap=await getDoc(ref);
    if(!snap.exists()){
      await setDoc(ref,{
        nome:nomeEquipe.trim(),data,status:"aguardando_lancamento",
        membrosMat:[srv.matricula],htConferido:false,
        inspetorNome:usuarioLogado?.nome||"",inspetorMat:usuarioLogado?.matricula||"",inspetorEmail:usuarioLogado?.email||"",
        criadoEm:serverTimestamp()
      });
    }else{
      await updateDoc(ref,{membrosMat:arrayUnion(srv.matricula)});
    }
  }catch(e){/* não bloqueia o registro de presença por causa disso */}
}

export async function renderEquipesLancadas(){
  const el=document.getElementById("equipes-lista");
  el.innerHTML='<p class="hist-vazio">Carregando...</p>';
  const hoje=new Date().toISOString().slice(0,10);
  try{
    const snap=await getDocs(query(collection(db,COL_EQUIPES),where("data","==",hoje)));
    const equipes=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.nome.localeCompare(b.nome));
    const badge=document.getElementById("badge-equipes");
    if(badge)badge.textContent=equipes.filter(e=>e.status==="aguardando_lancamento").length;
    if(!equipes.length){el.innerHTML='<p class="hist-vazio">Nenhuma equipe formada hoje ainda. Registre a presença de um servidor com "Equipe/Guarnição" preenchida.</p>';return;}

    if(!servidoresCache.length){
      try{
        const snapS=await getDocs(query(collection(db,COL_SERV),where("ativo","==",true)));
        servidoresCache=snapS.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.nome.localeCompare(b.nome));
      }catch(e){}
    }
    if(!_viaturasCache?.length)await carregarViaturasCache();

    const blocos=await Promise.all(equipes.map(eq=>renderCardEquipe(eq)));
    el.innerHTML=blocos.join("");
  }catch(err){el.innerHTML=`<p class="hist-vazio">Erro: ${err.message}</p>`;}
}

export async function renderCardEquipe(eq){
  const membros=eq.membrosMat.map(mat=>servidoresCache.find(s=>s.matricula===mat)).filter(Boolean);
  const si=STATUS_EQUIPE_LABEL[eq.status]||["—",eq.status];
  const membrosHtml=membros.map(m=>`<div style="font-size:.75rem">👤 ${m.nome} <span style="color:var(--cinza)">(Mat: ${m.matricula})</span></div>`).join("");

  let corpoAcao="";
  if(eq.status==="aguardando_lancamento"){
    const{ok,pendencias}=await conferirEquipe(eq,membros);
    corpoAcao=`
      <div class="secao-titulo" style="font-size:.78rem;margin-top:10px">🔍 Conferência do Inspetor</div>
      ${pendencias.length?pendencias.map(p=>`<div class="sit-alerta critico">⚠ ${p}</div>`).join(""):
        '<div class="sit-alerta info">🟢 Tudo certo — pode lançar a equipe.</div>'}
      <div style="margin:8px 0">
        <label style="font-size:.75rem;display:flex;align-items:center;gap:6px">
          <input type="checkbox" ${eq.viaturaId?"":""} id="ht-${eq.id}" ${eq.htConferido?"checked":""} onchange="toggleHtEquipe('${eq.id}',this.checked)">
          🎙 HT conferido (confirmação manual do inspetor)
        </label>
      </div>
      ${eq.viaturaId?`<div style="font-size:.78rem;margin-bottom:6px">🚓 Viatura: <strong>${eq.viaturaIdentificacao}</strong> (${eq.viaturaPlaca||"—"})</div>`
                    :`<button class="btn btn-sm btn-cinza" onclick="vincularViaturaEquipe('${eq.id}')">🚓 Vincular Viatura</button>`}
      ${ok?`<button class="btn btn-full btn-dourado" style="margin-top:10px" onclick="lancarEquipe('${eq.id}')">🚓 Lançar Equipe</button>`:""}
    `;
  }else if(["lancada","em_patrulhamento","em_atendimento","apoio","na_base"].includes(eq.status)){
    corpoAcao=`
      <div class="secao-titulo" style="font-size:.78rem;margin-top:10px">📡 Atualizar status</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
        <button class="btn btn-sm" style="background:rgba(125,206,160,.2);border-color:#7dcea0;color:#7dcea0" onclick="atualizarStatusEquipe('${eq.id}','em_patrulhamento')">🟢 Patrulhamento</button>
        <button class="btn btn-sm" style="background:rgba(192,57,43,.2);border-color:#f1948a;color:#f1948a" onclick="atualizarStatusEquipe('${eq.id}','em_atendimento')">🔴 Atendimento</button>
        <button class="btn btn-sm" style="background:rgba(251,191,36,.2);border-color:#fbbf24;color:#fbbf24" onclick="atualizarStatusEquipe('${eq.id}','apoio')">🟡 Apoio</button>
        <button class="btn btn-sm" style="background:rgba(96,165,250,.2);border-color:#60a5fa;color:#60a5fa" onclick="atualizarStatusEquipe('${eq.id}','na_base')">🔵 Na Base</button>
      </div>
      <button class="btn btn-full btn-perigo" onclick="encerrarEquipe('${eq.id}')">🔚 Encerrar Equipe</button>
    `;
  }

  return `<div class="hist-item">
    <div class="hist-tipo">${si[0]} ${eq.nome} <span style="font-size:.7rem;color:var(--cinza)">— ${si[1]}</span></div>
    ${membrosHtml}
    ${corpoAcao}
  </div>`;
}

export async function conferirEquipe(eq,membros){
  const pendencias=[];
  for(const m of membros){
    try{
      const snap=await getDocs(query(collection(db,COL_PLANTAO),
        where("servidorMat","==",m.matricula),where("data","==",eq.data),where("equipe","==",eq.nome)));
      const reg=snap.docs.map(d=>d.data())[0];
      if(!reg||!reg.autorizadoAssuncao||!reg.confirmadoPeloServidor)
        pendencias.push(`${m.nome} ainda não confirmou a assunção.`);
    }catch(e){}
    try{
      const snapA=await getDocs(query(collection(db,COL_ARMAS_IND),where("acautelamento.matricula","==",m.matricula)));
      if(!snapA.docs.some(d=>d.data().situacao==="Acautelada"))
        pendencias.push(`${m.nome} está sem arma acautelada.`);
    }catch(e){}
    try{
      const snapC=await getDocs(query(collection(db,COL_COLETES),where("distribuicaoAtual.servidorMatricula","==",m.matricula)));
      if(!snapC.docs.some(d=>d.data().situacao==="Em uso"))
        pendencias.push(`${m.nome} está sem colete acautelado.`);
    }catch(e){}
  }
  if(!eq.viaturaId)pendencias.push("Viatura não vinculada.");
  if(!eq.htConferido)pendencias.push("HT ainda não conferido pelo inspetor.");
  if(membros.length<2)pendencias.push("Equipe incompleta (mínimo 2 integrantes).");
  return{ok:pendencias.length===0,pendencias};
}

export async function toggleHtEquipe(id,checked){
  try{
    await updateDoc(doc(db,COL_EQUIPES,id),{htConferido:checked});
    renderEquipesLancadas();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.toggleHtEquipe=toggleHtEquipe;

export async function vincularViaturaEquipe(id){
  const disponiveis=(_viaturasCache||[]).filter(v=>v.situacao==="disponivel");
  if(!disponiveis.length)return alerta("Nenhuma viatura disponível no momento.","erro");
  const opcoes=disponiveis.map((v,i)=>`${i+1} — ${v.identificacao} (${v.placa||"—"})`).join("\n");
  const escolha=prompt(`Escolha a viatura (digite o número):\n${opcoes}`);
  const idx=Number(escolha)-1;
  if(!disponiveis[idx])return;
  const vtr=disponiveis[idx];
  try{
    await updateDoc(doc(db,COL_EQUIPES,id),{viaturaId:vtr.id,viaturaIdentificacao:vtr.identificacao,viaturaPlaca:vtr.placa||""});
    await updateDoc(doc(db,COL_VIATURAS,vtr.id),{situacao:"servico",atualizadoEm:agora()});
    await registrarAuditoria("Viatura vinculada à equipe",`${vtr.identificacao} — equipe ${id}`);
    alerta("Viatura vinculada!","ok");
    await carregarViaturasCache();
    renderEquipesLancadas();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.vincularViaturaEquipe=vincularViaturaEquipe;

export async function lancarEquipe(id){
  try{
    const snap=await getDoc(doc(db,COL_EQUIPES,id));
    const eq=snap.data();
    const membros=eq.membrosMat.map(mat=>servidoresCache.find(s=>s.matricula===mat)).filter(Boolean);
    const{ok,pendencias}=await conferirEquipe(eq,membros);
    if(!ok)return alerta("Ainda há pendências:\n"+pendencias.join("\n"),"erro");
    if(!confirm(`Lançar a equipe "${eq.nome}" agora?`))return;

    await updateDoc(doc(db,COL_EQUIPES,id),{
      status:"lancada",lancadaEm:serverTimestamp(),
      lancadaPor:usuarioLogado?.nome||"",lancadaPorMat:usuarioLogado?.matricula||""
    });
    await registrarAuditoria("Equipe lançada",
      `Equipe: ${eq.nome}\nData: ${eq.data} · Hora: ${agora()}\nInspetor: ${usuarioLogado?.nome||""}\n`+
      `Integrantes: ${membros.map(m=>m.nome+" (Mat: "+m.matricula+")").join(", ")}\n`+
      `Viatura: ${eq.viaturaIdentificacao||"—"} (${eq.viaturaPlaca||"—"})\nHT conferido: ${eq.htConferido?"Sim":"Não"}`);
    alerta(`Equipe "${eq.nome}" lançada!`,"ok");
    renderEquipesLancadas();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.lancarEquipe=lancarEquipe;

export async function atualizarStatusEquipe(id,novoStatus){
  try{
    await updateDoc(doc(db,COL_EQUIPES,id),{status:novoStatus,atualizadoEm:serverTimestamp()});
    await registrarAuditoria("Status da equipe atualizado",`Equipe ${id} → ${STATUS_EQUIPE_LABEL[novoStatus]?.[1]||novoStatus}`);
    renderEquipesLancadas();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.atualizarStatusEquipe=atualizarStatusEquipe;

export async function encerrarEquipe(id){
  try{
    const snap=await getDoc(doc(db,COL_EQUIPES,id));
    const eq=snap.data();
    const membros=eq.membrosMat.map(mat=>servidoresCache.find(s=>s.matricula===mat)).filter(Boolean);
    const pendencias=[];
    for(const m of membros){
      const snapP=await getDocs(query(collection(db,COL_PLANTAO),
        where("servidorMat","==",m.matricula),where("data","==",eq.data),where("equipe","==",eq.nome)));
      const reg=snapP.docs.map(d=>d.data())[0];
      if(!reg?.encerrado)pendencias.push(`${m.nome} ainda não encerrou o plantão (Registrar Saída).`);
      const snapA=await getDocs(query(collection(db,COL_ARMAS_IND),where("acautelamento.matricula","==",m.matricula)));
      if(snapA.docs.some(d=>d.data().situacao==="Acautelada"))pendencias.push(`Arma de ${m.nome} ainda não foi devolvida.`);
      const snapC=await getDocs(query(collection(db,COL_COLETES),where("distribuicaoAtual.servidorMatricula","==",m.matricula)));
      if(snapC.docs.some(d=>d.data().situacao==="Em uso"))pendencias.push(`Colete de ${m.nome} ainda não foi devolvido.`);
    }
    if(eq.viaturaId){
      const snapV=await getDoc(doc(db,COL_VIATURAS,eq.viaturaId));
      if(snapV.exists()&&snapV.data().situacao!=="disponivel")pendencias.push(`Viatura ${eq.viaturaIdentificacao} ainda não foi devolvida (situação atual: ${snapV.data().situacao}).`);
    }
    if(pendencias.length)return alerta("Ainda não é possível encerrar:\n"+pendencias.join("\n"),"erro");
    if(!confirm(`Confirmar encerramento da equipe "${eq.nome}"?`))return;

    await updateDoc(doc(db,COL_EQUIPES,id),{
      status:"plantao_encerrado",encerradaEm:serverTimestamp(),
      encerradaPor:usuarioLogado?.nome||"",encerradaPorMat:usuarioLogado?.matricula||""
    });
    await registrarAuditoria("Equipe encerrada",`Equipe: ${eq.nome} · Data: ${eq.data} · Encerrada por: ${usuarioLogado?.nome||""}`);
    alerta(`Equipe "${eq.nome}" encerrada!`,"ok");
    renderEquipesLancadas();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.encerrarEquipe=encerrarEquipe;

export async function carregarDashboardSecretario(){
  document.getElementById("sec-atualizado").textContent="Carregando dados de todos os módulos...";
  const hoje=new Date().toISOString().slice(0,10);
  const mesAtual=hoje.slice(0,7);

  const[snapSrv,snapPlantaoHoje,snapViaturas,snapArmas,snapColetes,snapEquipesHoje,
        snapOc,snapPad,snapBH,snapPermutas]=await Promise.all([
    getDocs(query(collection(db,COL_SERV),where("ativo","==",true))).catch(()=>({docs:[]})),
    getDocs(query(collection(db,COL_PLANTAO),where("data","==",hoje))).catch(()=>({docs:[]})),
    getDocs(collection(db,COL_VIATURAS)).catch(()=>({docs:[]})),
    getDocs(collection(db,COL_ARMAS_IND)).catch(()=>({docs:[]})),
    getDocs(collection(db,COL_COLETES)).catch(()=>({docs:[]})),
    getDocs(query(collection(db,COL_EQUIPES),where("data","==",hoje))).catch(()=>({docs:[]})),
    getDocs(collection(db,COL_OC)).catch(()=>({docs:[]})),
    getDocs(collection(db,COL_PAD)).catch(()=>({docs:[]})),
    getDocs(collection(db,COL_BH)).catch(()=>({docs:[]})),
    getDocs(collection(db,COL_PERMUTAS)).catch(()=>({docs:[]})),
  ]);

  const servidores=snapSrv.docs.map(d=>({id:d.id,...d.data()}));
  const plantaoHoje=snapPlantaoHoje.docs.map(d=>d.data());
  const viaturas=snapViaturas.docs.map(d=>({id:d.id,...d.data()}));
  const armas=snapArmas.docs.map(d=>d.data());
  const coletes=snapColetes.docs.map(d=>d.data());
  const equipesHoje=snapEquipesHoje.docs.map(d=>({id:d.id,...d.data()}));
  const ocorrencias=snapOc.docs.map(d=>d.data());
  const pads=snapPad.docs.map(d=>d.data());
  const bancoHoras=snapBH.docs.map(d=>d.data());
  const permutas=snapPermutas.docs.map(d=>d.data());
  _secEquipesCache=equipesHoje;

  const emServicoHoje=plantaoHoje.filter(p=>["presente","atrasado","substituicao"].includes(p.status));
  const vtrDisp=viaturas.filter(v=>v.situacao==="disponivel").length;
  const vtrServico=viaturas.filter(v=>v.situacao==="servico").length;
  const vtrManut=viaturas.filter(v=>v.situacao==="manutencao").length;
  const vtrInativa=viaturas.filter(v=>v.situacao==="inativa").length;
  const armasAcauteladas=armas.filter(a=>a.situacao==="Acautelada").length;
  const coletesDisp=coletes.filter(c=>c.situacao==="Disponível"||c.situacao==="Reserva").length;
  const coletesAcautelados=coletes.filter(c=>c.situacao==="Em uso").length;
  const equipesLancadasHoje=equipesHoje.filter(e=>e.status!=="aguardando_lancamento");
  const equipesPatrulhamento=equipesHoje.filter(e=>e.status==="em_patrulhamento");
  const equipesAtendimento=equipesHoje.filter(e=>e.status==="em_atendimento");
  const equipesDisponiveis=equipesHoje.filter(e=>["lancada","na_base"].includes(e.status));
  const ocExternasAbertas=ocorrencias.filter(o=>o.status!=="encerrada");
  const ocExternasEncerradas=ocorrencias.filter(o=>o.status==="encerrada");
  const padsAndamento=pads.filter(p=>["recebido","analise","aberto"].includes(p.status));
  const heMes=bancoHoras.filter(l=>l.tipo==="extra"&&l.data?.startsWith(mesAtual));
  const heHoje=bancoHoras.filter(l=>l.tipo==="extra"&&l.data===hoje&&(!l.status||l.status==="aprovada"));
  const permutasAprovadasMes=permutas.filter(p=>p.status==="aprovada"&&p.aprovadoEm?.toDate&&p.aprovadoEm.toDate().toISOString().slice(0,7)===mesAtual);
  const situacoesAusencia=["Férias","Licença","Afastado"];
  const foraDeServico=servidores.filter(s=>situacoesAusencia.includes(s.situacao));

  // ── 1. PAINEL EXECUTIVO ──
  const cardsExec=[
    [servidores.length,"👮 Efetivo Total","dash-azul"],
    [emServicoHoje.length,"👮 Efetivo em Serviço Hoje","dash-verde"],
    [vtrDisp,"🚓 Viaturas Disponíveis","dash-verde"],
    [vtrServico,"🚓 Viaturas em Patrulhamento","dash-azul"],
    [vtrManut,"🔧 Viaturas em Manutenção","dash-laranja"],
    [armasAcauteladas,"🔫 Armamentos Acautelados","dash-roxo"],
    [coletesDisp,"🦺 Coletes Disponíveis","dash-verde"],
    [equipesLancadasHoje.length,"👥 Equipes Lançadas","dash-azul"],
    [equipesPatrulhamento.length,"📍 Equipes em Patrulhamento","dash-verde"],
    [ocExternasAbertas.length,"🚨 Ocorrências Externas em Atendimento","dash-vermelho"],
    [padsAndamento.length,"📄 Ocorrências Internas (PAD)","dash-amarelo"],
    [heMes.reduce((s,l)=>s+Number(l.qtd||0),0)+"h","📈 Horas Extras no Mês","dash-roxo"],
  ];
  document.getElementById("sec-painel-executivo").innerHTML=cardsExec.map(([num,label,cls])=>
    `<div class="dash-card ${cls}"><div class="dash-num" style="font-size:1.5rem">${num}</div><div class="dash-label">${label}</div></div>`).join("");

  // ── 2. CENTRO INTEGRADO DE OPERAÇÕES ──
  const cardsCio=[
    [ocExternasAbertas.length,"🚨 Ocorrências Externas Abertas","dash-vermelho"],
    [ocExternasEncerradas.length,"🚨 Ocorrências Externas Encerradas","dash-verde"],
    [padsAndamento.length,"📄 Ocorrências Internas","dash-amarelo"],
    [equipesAtendimento.length,"🚔 Equipes em Atendimento","dash-vermelho"],
    [equipesPatrulhamento.length,"📍 Equipes em Patrulhamento","dash-azul"],
    [equipesDisponiveis.length,"🟢 Equipes Disponíveis","dash-verde"],
  ];
  document.getElementById("sec-cio").innerHTML=cardsCio.map(([num,label,cls])=>
    `<div class="dash-card ${cls}"><div class="dash-num" style="font-size:1.4rem">${num}</div><div class="dash-label">${label}</div></div>`).join("");

  // ── 3. SITUAÇÃO DA FROTA ──
  // Somente informativo — módulo Secretário não navega para outros módulos.
  const frotaItens=[
    ["Disponíveis",vtrDisp],["Em Uso/Patrulhamento",vtrServico],
    ["Em Manutenção",vtrManut],["Inativas/Baixadas",vtrInativa]
  ];
  document.getElementById("sec-frota").innerHTML=frotaItens.map(([label,num])=>
    `<div class="hist-item"><div class="hist-tipo">🚓 ${label}</div><div class="hist-corpo">${num} viatura(s)</div></div>`).join("");

  // ── 4. ARMARIA ──
  // Somente informativo — módulo Secretário não navega para outros módulos.
  const municoesQtd=await (async()=>{try{const m=await carregarMunicoesCache();return m.reduce((s,x)=>s+Number(x.qtd||0),0);}catch(e){return "—";}})();
  const armariaItens=[
    ["🔫 Armamentos Acautelados",armasAcauteladas],
    ["🔫 Armamentos Disponíveis",armas.filter(a=>a.situacao!=="Acautelada").length],
    ["🦺 Coletes Disponíveis",coletesDisp],
    ["🦺 Coletes Acautelados",coletesAcautelados],
    ["🎯 Munições Disponíveis (total)",municoesQtd],
  ];
  document.getElementById("sec-armaria").innerHTML=armariaItens.map(([label,num])=>
    `<div class="hist-item"><div class="hist-tipo">${label}</div><div class="hist-corpo">${num}</div></div>`).join("");

  // ── 5. EFETIVO ──
  const efetivoItens=[
    ["🟢 Servidores em Serviço Hoje",emServicoHoje.length],
    ["🏖 Férias",servidores.filter(s=>s.situacao==="Férias").length],
    ["📄 Licenças",servidores.filter(s=>s.situacao==="Licença").length],
    ["⛔ Afastamentos",servidores.filter(s=>s.situacao==="Afastado").length],
    ["⏱ Horas Extras Hoje",heHoje.reduce((s,l)=>s+Number(l.qtd||0),0)+"h"],
    ["💰 Horas Extras no Mês (total)",heMes.reduce((s,l)=>s+Number(l.qtd||0),0)+"h"],
    ["🔄 Permutas Aprovadas no Mês",permutasAprovadasMes.length],
  ];
  document.getElementById("sec-efetivo").innerHTML=efetivoItens.map(([label,num])=>
    `<div class="hist-item"><div class="hist-tipo">${label}</div><div class="hist-corpo">${num}</div></div>`).join("");

  // ── 6. EQUIPES DE HOJE (com drill-down) ──
  const STATUS_EQ={aguardando_lancamento:["🟡","Aguardando Lançamento"],lancada:["🟢","Lançada"],
    em_patrulhamento:["🟢","Em Patrulhamento"],em_atendimento:["🔴","Em Atendimento"],
    apoio:["🟡","Apoio"],na_base:["🔵","Na Base"],encerrada:["⚫","Encerrada"],plantao_encerrado:["⚫","Plantão Encerrado"]};
  document.getElementById("sec-equipes").innerHTML=equipesHoje.length?equipesHoje.map(eq=>{
    const si=STATUS_EQ[eq.status]||["—",eq.status];
    return `<div class="hist-item" style="cursor:pointer" onclick="abrirDetalheEquipeSecretario('${eq.id}')">
      <div class="hist-tipo">${si[0]} ${eq.nome} — ${si[1]}</div>
      <div class="hist-corpo">${(eq.membrosMat||[]).length} integrante(s)${eq.viaturaIdentificacao?" · 🚓 "+eq.viaturaIdentificacao:""}</div>
    </div>`;
  }).join(""):'<p class="hist-vazio">Nenhuma equipe formada hoje.</p>';

  // ── 7. INDICADORES DO MÊS ──
  document.getElementById("sec-indicadores-mes").innerHTML=`
    <div class="hist-item"><div class="hist-tipo">🚨 Ocorrências no Mês</div><div class="hist-corpo">${ocorrencias.filter(o=>o.data?.startsWith(mesAtual)).length} registradas</div></div>
    <div class="hist-item"><div class="hist-tipo">📈 Horas Extras no Mês</div><div class="hist-corpo">${heMes.reduce((s,l)=>s+Number(l.qtd||0),0)}h em ${heMes.length} lançamento(s)</div></div>
    <div class="hist-item"><div class="hist-tipo">🔄 Permutas Aprovadas no Mês</div><div class="hist-corpo">${permutasAprovadasMes.length}</div></div>
    <div class="hist-item"><div class="hist-tipo">📂 PADs Concluídos no Mês</div><div class="hist-corpo">${pads.filter(p=>p.status==="arquivado"&&p.dataArquivamento?.startsWith?.(mesAtual)).length}</div></div>
  `;

  // ── 8. ALERTAS EXECUTIVOS ──
  const alertas=[];
  if(vtrDisp===0)alertas.push({n:"critico",t:"Nenhuma viatura disponível no momento."});
  if(emServicoHoje.length<Math.max(1,servidores.length*0.3))alertas.push({n:"critico",t:`Efetivo em serviço hoje está baixo (${emServicoHoje.length} de ${servidores.length}).`});
  const armasNaoDevolvidas=armas.filter(a=>a.situacao==="Acautelada"&&a.acautelamento?.dataEntrega&&
    (Date.now()-new Date(a.acautelamento.dataEntrega).getTime())>1000*60*60*24*2).length; // +48h sem devolver (heurística)
  if(armasNaoDevolvidas>0)alertas.push({n:"critico",t:`${armasNaoDevolvidas} arma(s) acautelada(s) há mais de 48h sem devolução.`});
  if(municoesQtd!=="—"&&municoesQtd<50)alertas.push({n:"critico",t:"Estoque de munição está baixo."});
  const heForaLimite=Object.entries(heMes.reduce((acc,l)=>{acc[l.srvMat]=(acc[l.srvMat]||0)+Number(l.qtd||0);return acc;},{})).filter(([,h])=>h>40);
  if(heForaLimite.length)alertas.push({n:"importante",t:`${heForaLimite.length} servidor(es) com mais de 40h extras no mês.`});
  const equipesAguardando=equipesHoje.filter(e=>e.status==="aguardando_lancamento").length;
  if(equipesAguardando>0)alertas.push({n:"importante",t:`${equipesAguardando} equipe(s) aguardando lançamento do inspetor.`});
  if(ocExternasAbertas.filter(o=>o.prioridade==="Alta").length>0)alertas.push({n:"critico",t:`${ocExternasAbertas.filter(o=>o.prioridade==="Alta").length} ocorrência(s) crítica(s) ainda sem encerramento.`});
  document.getElementById("sec-alertas").innerHTML=alertas.length?alertas.map(a=>
    `<div class="sit-alerta ${a.n}">${a.n==="critico"?"🔴":"🟡"} ${a.t}</div>`).join(""):
    '<div class="sit-alerta info">🟢 Nenhum alerta no momento.</div>';

  document.getElementById("sec-atualizado").textContent=`📅 Atualizado agora — ${agora()}`;
}

export async function abrirDetalheEquipeSecretario(id){
  const eq=_secEquipesCache.find(e=>e.id===id);
  if(!eq)return;
  const membros=(eq.membrosMat||[]).map(mat=>servidoresCache.find(s=>s.matricula===mat)?.nome||mat);
  const corpo=document.getElementById("sec-equipe-detalhe-corpo");
  corpo.innerHTML=`
    <div class="hist-item">
      <div class="hist-tipo">🚔 ${eq.nome}</div>
      <div class="hist-corpo">
        Integrantes: ${membros.join(", ")||"—"}<br>
        Viatura: ${eq.viaturaIdentificacao||"—"} (${eq.viaturaPlaca||"—"})<br>
        Área de atuação: ${eq.nome||"—"}<br>
        Inspetor responsável: ${eq.inspetorNome||eq.lancadaPor||"—"}<br>
        Horário da saída: ${eq.lancadaEm?.toDate?eq.lancadaEm.toDate().toLocaleString("pt-BR"):"—"}
      </div>
    </div>
    <div class="secao-titulo" style="font-size:.82rem;margin-top:14px">🚨 Ocorrências Atendidas</div>
    <div id="sec-equipe-ocorrencias"><p class="hist-vazio">Carregando...</p></div>
  `;
  ir("secretario-equipe-detalhe");
  try{
    const snap=await getDocs(query(collection(db,COL_OC),where("equipe","==",eq.nome),where("data","==",eq.data)));
    const ocs=snap.docs.map(d=>d.data());
    document.getElementById("sec-equipe-ocorrencias").innerHTML=ocs.length?ocs.map(o=>
      `<div class="hist-item"><div class="hist-tipo" style="font-size:.78rem">${o.num||""} — ${o.tipo||""}</div>
       <div class="hist-corpo">${o.hora||""} · Status: ${o.status||""}${o.desc?"<br>"+o.desc:""}</div></div>`).join(""):
      '<p class="hist-vazio">Nenhuma ocorrência registrada para essa equipe hoje. (Só aparecem aqui as ocorrências abertas pela Inspetoria durante o plantão — outras origens ainda não estão vinculadas à equipe.)</p>';
  }catch(e){
    document.getElementById("sec-equipe-ocorrencias").innerHTML='<p class="hist-vazio">Erro ao carregar ocorrências.</p>';
  }
}
window.abrirDetalheEquipeSecretario=abrirDetalheEquipeSecretario;

export async function carregarDashboardCorregedoria(){
  document.getElementById("cor-atualizado").textContent="Carregando...";
  const hoje=new Date().toISOString().slice(0,10);
  const mesAtual=hoje.slice(0,7);
  const daqui7dias=new Date();daqui7dias.setDate(daqui7dias.getDate()+7);

  const[snapSrv,snapPad,snapOc,snapAud,snapPlantao,snapEquipes,snapEscala,snapBH,snapPermutas,snapArmas,snapColetes,snapViaturas]=await Promise.all([
    getDocs(query(collection(db,COL_SERV),where("ativo","==",true))).catch(()=>({docs:[]})),
    getDocs(collection(db,COL_PAD)).catch(()=>({docs:[]})),
    getDocs(collection(db,COL_OC)).catch(()=>({docs:[]})),
    getDocs(query(collection(db,"auditoria"),orderBy("criadoEm","desc"))).catch(()=>({docs:[]})),
    getDocs(query(collection(db,COL_PLANTAO),where("data","==",hoje))).catch(()=>({docs:[]})),
    getDocs(query(collection(db,COL_EQUIPES),where("data","==",hoje))).catch(()=>({docs:[]})),
    getDoc(doc(db,COL_ESCALA_MENSAL,chaveEscala(new Date().getFullYear(),new Date().getMonth()))).catch(()=>null),
    getDocs(collection(db,COL_BH)).catch(()=>({docs:[]})),
    getDocs(collection(db,COL_PERMUTAS)).catch(()=>({docs:[]})),
    getDocs(collection(db,COL_ARMAS_IND)).catch(()=>({docs:[]})),
    getDocs(collection(db,COL_COLETES)).catch(()=>({docs:[]})),
    getDocs(collection(db,COL_VIATURAS)).catch(()=>({docs:[]})),
  ]);

  const pads=snapPad.docs.map(d=>d.data());
  const ocorrencias=snapOc.docs.map(d=>d.data());
  const auditoriaLista=snapAud.docs.map(d=>({id:d.id,...d.data()}));
  const plantaoHoje=snapPlantao.docs.map(d=>d.data());
  const equipesHoje=snapEquipes.docs.map(d=>d.data());
  const bancoHoras=snapBH.docs.map(d=>d.data());
  const permutas=snapPermutas.docs.map(d=>d.data());
  const armas=snapArmas.docs.map(d=>d.data());
  const coletes=snapColetes.docs.map(d=>d.data());
  const viaturas=snapViaturas.docs.map(d=>({id:d.id,...d.data()}));

  const padsAndamento=pads.filter(p=>["recebido","analise","aberto"].includes(p.status));
  const padsVencendo=padsAndamento.filter(p=>p.prazoFinal&&new Date(p.prazoFinal)<=daqui7dias);
  const padsConcluidosMes=pads.filter(p=>p.status==="arquivado"&&p.dataArquivamento?.startsWith?.(mesAtual));
  const sindicancias=pads.filter(p=>/sindic/i.test(p.tipo||""));
  const sindicanciasAndamento=sindicancias.filter(p=>["recebido","analise","aberto"].includes(p.status));
  const denuncias=pads.filter(p=>/denúncia|denuncia/i.test(p.origem||p.tipo||""));
  const apuracoesPreliminares=pads.filter(p=>p.status==="recebido");

  // ── INDICADORES GERAIS ──
  const cardsInd=[
    [snapSrv.docs.length,"👮 Efetivo Total","dash-azul"],
    [sindicanciasAndamento.length,"📄 Sindicâncias em Andamento","dash-amarelo"],
    [padsAndamento.length,"⚖️ PADs em Andamento","dash-roxo"],
    [denuncias.length,"📝 Denúncias Recebidas","dash-vermelho"],
    [ocorrencias.length,"🚨 Ocorrências Internas Registradas","dash-laranja"],
    [apuracoesPreliminares.length,"🔍 Apurações Preliminares","dash-azul"],
    [padsVencendo.length,"📅 Processos Próximos do Vencimento","dash-vermelho"],
    [padsConcluidosMes.length,"📂 Processos Concluídos no Mês","dash-verde"],
  ];
  document.getElementById("cor-indicadores").innerHTML=cardsInd.map(([num,label,cls])=>
    `<div class="dash-card ${cls}"><div class="dash-num" style="font-size:1.4rem">${num}</div><div class="dash-label">${label}</div></div>`).join("");

  // ── PAINEL DE CONTROLE ──
  const cardsControle=[
    [padsAndamento.length,"🟡 Procedimentos Pendentes","dash-amarelo"],
    [padsVencendo.length,"🔴 Prazo Vencendo","dash-vermelho"],
    [padsConcluidosMes.length,"🟢 Concluídos no Mês","dash-verde"],
    [pads.filter(p=>p.status==="arquivado").length,"⚫ Arquivados (total)","dash-roxo"],
  ];
  document.getElementById("cor-painel-controle").innerHTML=cardsControle.map(([num,label,cls])=>
    `<div class="dash-card ${cls}"><div class="dash-num" style="font-size:1.4rem">${num}</div><div class="dash-label">${label}</div></div>`).join("");

  // ── INDICADORES OPERACIONAIS (leitura de outros módulos) ──
  const assuncoesPendentes=plantaoHoje.filter(p=>p.status!=="ausente"&&!p.autorizadoAssuncao).length;
  const presencasHoje=plantaoHoje.filter(p=>["presente","atrasado"].includes(p.status)).length;
  const heExtraordinariasMes=bancoHoras.filter(l=>l.tipoHora==="extraordinaria"&&l.data?.startsWith(mesAtual));
  const permutasAprovadasMes=permutas.filter(p=>p.status==="aprovada");
  const armasNaoDevolvidas=armas.filter(a=>a.situacao==="Acautelada").length;
  const coletesNaoDevolvidos=coletes.filter(c=>c.situacao==="Em uso").length;
  const viaturasComAvaria=viaturas.filter(v=>/avaria|dano/i.test(v.obs||"")).length;

  const operacionais=[
    ["🏛 Inspetoria","Assunções pendentes hoje",assuncoesPendentes],
    ["🏛 Inspetoria","Presenças registradas hoje",presencasHoje],
    ["🏛 Inspetoria","Equipes lançadas hoje",equipesHoje.filter(e=>e.status!=="aguardando_lancamento").length],
    ["📁 Administrativo","Horas extras extraordinárias no mês",heExtraordinariasMes.length+" ("+heExtraordinariasMes.reduce((s,l)=>s+Number(l.qtd||0),0)+"h)"],
    ["📁 Administrativo","Permutas aprovadas",permutasAprovadasMes.length],
    ["🏛 Patrimônio","Viaturas com avaria registrada",viaturasComAvaria],
    [`<span class="ic-img ic-arma"></span> Armaria`,"Armamentos não devolvidos",armasNaoDevolvidas],
    [`<span class="ic-img ic-coletes"></span> Armaria`,"Coletes não devolvidos",coletesNaoDevolvidos],
  ];
  document.getElementById("cor-operacionais").innerHTML=operacionais.map(([mod,label,num])=>
    `<div class="hist-item"><div class="hist-tipo">${mod}</div><div class="hist-corpo">${label}: <strong>${num}</strong></div></div>`).join("");

  // ── OCORRÊNCIAS ──
  document.getElementById("cor-ocorrencias").innerHTML=`
    <div class="hist-item"><div class="hist-tipo">📄 Ocorrências Internas</div><div class="hist-corpo">Total: ${ocorrencias.length} · Status: ${ocorrencias.filter(o=>o.status!=="encerrada").length} em aberto</div></div>
    <div class="hist-item"><div class="hist-tipo">⚖️ PADs</div><div class="hist-corpo">Total: ${pads.length} · Em andamento: ${padsAndamento.length}</div></div>
  `;

  // ── AUDITORIA DO SISTEMA (eventos relevantes) ──
  const padroesRelevantes=/escala|ocorrência|ocorrencia|patrimônio|patrimonio|armaria|arma|colete|assunção|assuncao|hora extraordinária|extraordinaria|permuta/i;
  const eventosRelevantes=auditoriaLista.filter(a=>padroesRelevantes.test(a.acao||"")).slice(0,15);
  document.getElementById("cor-auditoria").innerHTML=eventosRelevantes.length?eventosRelevantes.map(a=>
    `<div class="hist-item">
      <div class="hist-tipo" style="font-size:.78rem">${a.acao||"—"}</div>
      <div class="hist-corpo" style="font-size:.7rem">${(a.detalhes||"").substring(0,120)}${a.detalhes?.length>120?"...":""}<br>${a.usuarioNome||""} — ${a.hora||""}</div>
    </div>`).join(""):'<p class="hist-vazio">Nenhum evento relevante registrado ainda.</p>';

  // ── ALERTAS ──
  const alertas=[];
  if(padsVencendo.length)alertas.push({n:"critico",t:`${padsVencendo.length} PAD(s) com prazo vencendo em até 7 dias.`});
  if(sindicanciasAndamento.length)alertas.push({n:"importante",t:`${sindicanciasAndamento.length} sindicância(s) em andamento — verifique prazos.`});
  if(armasNaoDevolvidas>5)alertas.push({n:"critico",t:`${armasNaoDevolvidas} armamento(s) acautelado(s) — confira devoluções pendentes.`});
  if(viaturasComAvaria)alertas.push({n:"critico",t:`${viaturasComAvaria} viatura(s) com avaria registrada nas observações.`});
  const heForaLimiteMes=Object.entries(bancoHoras.filter(l=>l.tipo==="extra"&&l.data?.startsWith(mesAtual))
    .reduce((acc,l)=>{acc[l.srvMat]=(acc[l.srvMat]||0)+Number(l.qtd||0);return acc;},{})).filter(([,h])=>h>40);
  if(heForaLimiteMes.length)alertas.push({n:"importante",t:`${heForaLimiteMes.length} servidor(es) com excesso de horas extras no mês (acima de 40h).`});
  if(assuncoesPendentes>0)alertas.push({n:"critico",t:`${assuncoesPendentes} servidor(es) hoje ainda sem confirmação de assunção do plantão.`});
  document.getElementById("cor-alertas").innerHTML=alertas.length?alertas.map(a=>
    `<div class="sit-alerta ${a.n}">${a.n==="critico"?"🔴":"🟡"} ${a.t}</div>`).join(""):
    '<div class="sit-alerta info">🟢 Nenhum alerta no momento.</div>';

  document.getElementById("cor-atualizado").textContent=`📅 Atualizado agora — ${agora()}`;
}

export async function pesquisaInteligenteCorregedoria(){
  const termo=v("cor-pesq-termo").toLowerCase();
  const el=document.getElementById("cor-pesq-resultado");
  if(!termo){el.innerHTML='<p class="hist-vazio">Digite para pesquisar em servidores, equipes, viaturas, ocorrências e PADs.</p>';return;}
  el.innerHTML='<p class="hist-vazio">Pesquisando...</p>';
  const resultados=[];
  try{
    if(!servidoresCache.length){
      const snapS=await getDocs(query(collection(db,COL_SERV),where("ativo","==",true)));
      servidoresCache=snapS.docs.map(d=>({id:d.id,...d.data()}));
    }
    servidoresCache.filter(s=>s.nome?.toLowerCase().includes(termo)||s.matricula?.toLowerCase().includes(termo))
      .forEach(s=>resultados.push({tipo:"👤 Servidor",texto:`${esc(s.nome)} — Mat: ${esc(s.matricula)} · ${s.cargo||""}`}));

    const snapEq=await getDocs(collection(db,COL_EQUIPES));
    snapEq.docs.map(d=>d.data()).filter(e=>e.nome?.toLowerCase().includes(termo))
      .forEach(e=>resultados.push({tipo:"🚔 Equipe",texto:`${e.nome} — ${e.data} · Status: ${e.status}`}));

    const snapV=await getDocs(collection(db,COL_VIATURAS));
    snapV.docs.map(d=>d.data()).filter(vt=>vt.identificacao?.toLowerCase().includes(termo)||vt.placa?.toLowerCase().includes(termo))
      .forEach(vt=>resultados.push({tipo:"🚓 Viatura",texto:`${vt.identificacao} — Placa: ${vt.placa||"—"} · ${vt.situacao||""}`}));

    const snapOcS=await getDocs(collection(db,COL_OC));
    snapOcS.docs.map(d=>d.data()).filter(o=>o.numero?.toLowerCase?.().includes(termo)||o.tipo?.toLowerCase().includes(termo)||o.envolvidos?.toLowerCase().includes(termo))
      .forEach(o=>resultados.push({tipo:"🚨 Ocorrência",texto:`${o.numero||""} — ${o.tipo||""} · Status: ${o.status||""}`}));

    const snapPadS=await getDocs(collection(db,COL_PAD));
    snapPadS.docs.map(d=>d.data()).filter(p=>p.numero?.toLowerCase?.().includes(termo)||p.servidor?.toLowerCase().includes(termo))
      .forEach(p=>resultados.push({tipo:"⚖️ PAD",texto:`${p.numero||""} — ${p.servidor||""} · Status: ${p.status||""}`}));

    el.innerHTML=resultados.length?resultados.map(r=>
      `<div class="hist-item"><div class="hist-tipo" style="font-size:.78rem">${r.tipo}</div><div class="hist-corpo">${esc(r.texto)}</div></div>`).join(""):
      '<p class="hist-vazio">Nada encontrado.</p>';
  }catch(err){el.innerHTML=`<p class="hist-vazio">Erro: ${err.message}</p>`;}
}
window.pesquisaInteligenteCorregedoria=pesquisaInteligenteCorregedoria;

export function exportarEscala(){
  const meses=["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
    "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const dados=_diasMesAtual;
  if(!Object.keys(dados).length){alerta("Escala vazia para este mês.","aviso");return;}
  let txt=`📅 *ESCALA — ${meses[escalaMesAtual].toUpperCase()} ${escalaAnoAtual}*\n`;
  txt+=`*Polícia Municipal de Caruaru*\n\n`;
  Object.entries(dados).sort(([a],[b])=>Number(a)-Number(b)).forEach(([dia,entradas])=>{
    txt+=`*Dia ${String(dia).padStart(2,"0")}:*\n`;
    entradas.forEach(e=>{ txt+=`  ${e.turno} — ${e.nomeServidor} (${e.jornada})${e.obs?" · "+e.obs:""}\n`; });
  });
  txt+=`\nGerado em: ${agora()}`;
  const tel=prompt("WhatsApp para enviar (DDD+número):");
  if(!tel)return;
  window.open(`https://wa.me/55${tel.replace(/\D/g,"")}?text=${encodeURIComponent(txt)}`,"_blank");
}
window.exportarEscala=exportarEscala;

export function carregarBH(){try{return JSON.parse(localStorage.getItem(CHAVE_BH))||[];}catch{return[];}}

export function salvarBH(arr){localStorage.setItem(CHAVE_BH,JSON.stringify(arr));}

export async function carregarSrvSelectBH(){
  const sel=document.getElementById("bh-servidor-sel");
  if(!sel)return;
  sel.innerHTML='<option value="">Selecione servidor...</option>';
  if(!servidoresCache.length)await carregarSrvCacheLocal();
  servidoresCache.forEach(s=>{
    sel.innerHTML+=`<option value="${s.id}" data-nome="${esc(s.nome)}">${esc(s.nome)} — ${esc(s.matricula)}</option>`;
  });
}

export function calcularSaldoBH(lancamentos){
  return lancamentos.reduce((s,l)=>{
    if(l.status&&l.status!=="aprovada")return s; // pendente/rejeitado/em correção não entra no saldo
    if(l.tipo==="extra")return s+Number(l.qtd||0);
    if(l.tipo==="compensar"||l.tipo==="falta")return s-Number(l.qtd||0);
    return s;
  },0);
}

export async function carregarBancoHoras(){
  const el=document.getElementById("bh-resumo");
  el.innerHTML='<p class="hist-vazio">Carregando...</p>';
  let lista=[];
  try{
    const snap=await getDocs(collection(db,COL_BH));
    lista=snap.docs.map(d=>({_id:d.id,...d.data()})).filter(l=>!l.status||l.status==="aprovada");
  }catch(err){el.innerHTML=`<p class="hist-vazio">Erro: ${err.message}</p>`;return;}
  if(!lista.length){el.innerHTML='<p class="hist-vazio">Nenhum lançamento aprovado ainda.</p>';return;}

  // agrupa por servidor
  const mapa={};
  lista.forEach(l=>{
    if(!mapa[l.srvId])mapa[l.srvId]={nome:l.srvNome,extra:0,compensar:0,falta:0,atestado:0,lancamentos:[]};
    mapa[l.srvId][l.tipo]=(mapa[l.srvId][l.tipo]||0)+Number(l.qtd||0);
    mapa[l.srvId].lancamentos.push(l);
  });

  el.innerHTML=Object.values(mapa).map(s=>{
    const saldo=calcularSaldoBH(s.lancamentos);
    const cor=saldo>0?"#7dcea0":saldo<0?"#f1948a":"var(--cinza)";
    const lancsOrdenados=s.lancamentos.sort((a,b)=>(b.data||"").localeCompare(a.data||""));
    return`<div class="hist-item">
      <div class="hist-tipo">👤 ${esc(s.nome)}</div>
      <div class="hist-corpo">
        ➕ Extras: ${s.extra}h · ➖ Compensadas: ${s.compensar}h<br>
        ❌ Faltas: ${s.falta}h · 🏥 Atestados: ${s.atestado}h<br>
        <strong style="color:${cor}">Saldo: ${saldo>0?"+":""}${saldo}h</strong>
      </div>
      <details style="margin-top:6px">
        <summary style="font-size:.7rem;color:var(--cinza);cursor:pointer">Ver lançamentos</summary>
        ${lancsOrdenados.map(l=>`<div style="font-size:.72rem;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.06)">${l.data} · ${l.tipo} · ${l.qtd}h${l.obs?" · "+l.obs:""}</div>`).join("")}
      </details>
    </div>`;
  }).join("");
}

export function toggleOrigemHoraBH(){
  const wrap=document.getElementById("bh-origem-wrap");
  if(wrap)wrap.style.display=v("bh-tipo")==="extra"?"block":"none";
}

export async function lancarHoras(){
  const sel=document.getElementById("bh-servidor-sel");
  const srvId=sel.value;
  const srvOpt=sel.options[sel.selectedIndex];
  const srvNome=srvOpt?.dataset?.nome||srvOpt?.text?.split(" — ")[0]||"";
  const data=v("bh-data"),tipo=v("bh-tipo"),qtd=v("bh-qtd"),obs=v("bh-obs"),origemHora=v("bh-origem");
  if(!srvId||!data||!qtd)return alerta("Preencha servidor, data e quantidade.","erro");
  try{
    const srv=servidoresCache.find(s=>s.id===srvId);
    await addDoc(collection(db,COL_BH),{
      srvId,srvNome,srvMat:srv?.matricula||"",srvEmail:srv?.email||"",
      data,tipo,qtd:Number(qtd),obs,
      tipoHora:tipo==="extra"?origemHora:"",status:"aprovada",
      lancadoPor:usuarioLogado?.nome||"",lancadoPorMat:usuarioLogado?.matricula||"",criadoEm:serverTimestamp()
    });
    await registrarAuditoria("Lançamento de banco de horas",`${srvNome}: ${tipo} ${qtd}h${tipo==="extra"?" ("+origemHora+")":""}`);
    if(srv?.email){
      const iconeTipo={extra:"➕",compensar:"➖",falta:"❌",atestado:"🏥"};
      await enviarNotificacao(srv.email,`${iconeTipo[tipo]||""} Lançamento no Banco de Horas`,
        `Tipo: ${tipo}\nQuantidade: ${qtd}h\nData: ${data}${obs?"\nObs: "+obs:""}\nLançado por: ${usuarioLogado?.nome||""}`,"administrativo");
    }
    alerta("Lançamento registrado!","ok");
    if((tipo==="compensar"||tipo==="falta")&&srv?.matricula){
      await verificarAlertaBancoHorasNegativo(srv.matricula,srvNome,srv.email);
    }
    ["bh-data","bh-qtd","bh-obs"].forEach(id=>{const el=document.getElementById(id);if(el)el.value="";});
    await carregarBancoHoras();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.lancarHoras=lancarHoras;

export async function abrirMeusPlantoesDoMes(offset=0){
  _mpPlantoesMesOffset=offset;
  ir("mp-plantoes-mes");
  const el=document.getElementById("mp-plantoes-mes-lista");
  el.innerHTML='<p class="hist-vazio">Carregando...</p>';
  try{
    const meuSrv=await obterMeuServidorRoster();
    const base=new Date();
    const alvo=new Date(base.getFullYear(),base.getMonth()+offset,1);
    const ano=alvo.getFullYear(),mes=alvo.getMonth();
    document.getElementById("mp-plantoes-mes-label").textContent=`${MESES_PT[mes]}/${ano}`;
    const chave=chaveEscala(ano,mes);
    const entradasEscala=[];
    if(meuSrv){
      const snap=await getDoc(doc(db,COL_ESCALA_MENSAL,chave));
      if(snap.exists()){
        const dias=snap.data().dias||{};
        Object.entries(dias).forEach(([dia,arr])=>{
          (arr||[]).forEach(e=>{
            if(e.srvId===meuSrv.id){
              const dataISO=`${ano}-${String(mes+1).padStart(2,"0")}-${String(dia).padStart(2,"0")}`;
              entradasEscala.push({data:dataISO,turno:e.turno,jornada:e.jornada||"",obs:e.obs||""});
            }
          });
        });
      }
    }
    entradasEscala.sort((a,b)=>a.data.localeCompare(b.data));

    // cruza com os registros de presença (Registrar Presença) do mesmo mês, se existirem
    let presencasMes=[];
    try{
      const snapP=await getDocs(query(collection(db,COL_PLANTAO),where("servidorMat","==",usuarioLogado.matricula)));
      presencasMes=snapP.docs.map(d=>d.data()).filter(p=>p.data?.startsWith(chave));
    }catch(e){}

    if(!entradasEscala.length){
      el.innerHTML=`<p class="hist-vazio">Nenhum plantão na escala de ${MESES_PT[mes]}/${ano}.</p>`;
      return;
    }
    const hojeStr=new Date().toISOString().slice(0,10);
    el.innerHTML=entradasEscala.map(e=>{
      const presenca=presencasMes.find(p=>p.data===e.data);
      const futuro=e.data>=hojeStr;
      const statusTxt=presenca
        ?(presenca.status==="presente"?"✅ Compareceu":presenca.status==="atrasado"?"⏰ Atrasado":presenca.status==="ausente"?"❌ Faltou":presenca.status)
        :(futuro?"📅 Agendado":"—");
      return`<div class="hist-item">
        <div class="hist-tipo">${TURNO_LABEL[e.turno]||e.turno} — ${e.data.split("-").reverse().join("/")}</div>
        <div class="hist-corpo">Jornada: ${e.jornada||"—"}${e.obs?" · "+e.obs:""}<br>Status: ${statusTxt}${presenca?.entrada?" · Entrada: "+presenca.entrada:""}${presenca?.saida?" · Saída: "+presenca.saida:""}</div>
      </div>`;
    }).join("");
  }catch(err){el.innerHTML=`<p class="hist-vazio">Erro: ${err.message}</p>`;}
}
window.abrirMeusPlantoesDoMes=abrirMeusPlantoesDoMes;

export async function abrirMeuBancoHorasDetalhe(offset=0){
  _mpBhDetalheOffset=offset;
  ir("mp-banco-horas-detalhe");
  const elResumo=document.getElementById("mp-bh-resumo");
  const elLista=document.getElementById("mp-bh-detalhe-lista");
  elLista.innerHTML='<p class="hist-vazio">Carregando...</p>';
  try{
    if(!_mpBhCacheCompleto.length||offset===0){
      let bh=[];
      const snap=await getDocs(query(collection(db,COL_BH),where("srvMat","==",usuarioLogado.matricula)));
      bh=snap.docs.map(d=>d.data());
      if(!bh.length){
        const snap2=await getDocs(query(collection(db,COL_BH),where("srvNome","==",usuarioLogado.nome)));
        bh=snap2.docs.map(d=>d.data());
      }
      _mpBhCacheCompleto=bh;
    }
    const base=new Date();
    const alvo=new Date(base.getFullYear(),base.getMonth()+offset,1);
    const ano=alvo.getFullYear(),mes=alvo.getMonth();
    const chaveMes=`${ano}-${String(mes+1).padStart(2,"0")}`;
    document.getElementById("mp-bh-mes-label").textContent=`${MESES_PT[mes]}/${ano}`;

    const bhMes=_mpBhCacheCompleto.filter(l=>(l.data||"").startsWith(chaveMes))
      .sort((a,b)=>(b.data||"").localeCompare(a.data||""));

    const aprovados=bhMes.filter(l=>!l.status||l.status==="aprovada");
    const totalExtras=aprovados.filter(l=>l.tipo==="extra").reduce((s,l)=>s+Number(l.qtd||0),0);
    const totalNegativo=aprovados.filter(l=>l.tipo==="compensar"||l.tipo==="falta").reduce((s,l)=>s+Number(l.qtd||0),0);
    const saldoMes=Math.round((totalExtras-totalNegativo)*100)/100;

    elResumo.innerHTML=`
      <div class="dash-card dash-verde"><div class="dash-num" style="font-size:1.2rem">${saldoMes>=0?"+":""}${saldoMes}h</div><div class="dash-label">Saldo do Mês</div></div>
      <div class="dash-card dash-azul"><div class="dash-num" style="font-size:1.2rem">+${totalExtras}h</div><div class="dash-label">Total Extras</div></div>
      <div class="dash-card dash-vermelho"><div class="dash-num" style="font-size:1.2rem">-${totalNegativo}h</div><div class="dash-label">Total Negativo</div></div>
    `;

    const iconeTipoBh={extra:"➕",compensar:"➖",falta:"❌",atestado:"🏥"};
    const statusLabel={pendente_analise:"🟡 Pendente de análise",correcao_solicitada:"🔧 Correção solicitada",rejeitada:"❌ Rejeitada"};
    elLista.innerHTML=bhMes.length?bhMes.map(l=>{
      const dataFmt=(l.data||"").split("-").reverse().join("/");
      return`<div class="hist-item">
        <div class="hist-tipo">${iconeTipoBh[l.tipo]||""} ${dataFmt} — ${l.qtd}h ${l.tipo==="extra"?"extras":l.tipo==="compensar"?"a compensar":l.tipo}</div>
        <div class="hist-corpo">${l.horaInicio&&l.horaFim?"Horário: "+esc(l.horaInicio)+"–"+esc(l.horaFim)+"<br>":""}${l.motivo||l.obs?"Motivo: "+esc(l.motivo||l.obs)+"<br>":""}${l.tipoHora?"Tipo: "+esc(l.tipoHora)+"<br>":""}${l.status&&l.status!=="aprovada"?statusLabel[l.status]||esc(l.status):"✅ Aprovado"}</div>
      </div>`;
    }).join(""):`<p class="hist-vazio">Nenhum lançamento em ${MESES_PT[mes]}/${ano}.</p>`;

    _mpBhResumoAtualTexto=`⏱ *BANCO DE HORAS — ${MESES_PT[mes]}/${ano}*\n`+
      `Servidor: ${usuarioLogado?.nome||""}\n`+
      `Saldo do mês: ${saldoMes>=0?"+":""}${saldoMes}h\nTotal extras: +${totalExtras}h\nTotal negativo: -${totalNegativo}h\n\n`+
      (bhMes.length?bhMes.map(l=>`${(l.data||"").split("-").reverse().join("/")} — ${iconeTipoBh[l.tipo]||""} ${l.qtd}h${l.motivo||l.obs?" ("+(l.motivo||l.obs)+")":""}`).join("\n"):"Nenhum lançamento neste mês.");
  }catch(err){elLista.innerHTML=`<p class="hist-vazio">Erro: ${err.message}</p>`;}
}
window.abrirMeuBancoHorasDetalhe=abrirMeuBancoHorasDetalhe;

export function compartilharBancoHorasWhatsApp(){
  if(!_mpBhResumoAtualTexto)return alerta("Nada pra compartilhar ainda.","erro");
  window.open(`https://wa.me/?text=${encodeURIComponent(_mpBhResumoAtualTexto)}`,"_blank");
}
window.compartilharBancoHorasWhatsApp=compartilharBancoHorasWhatsApp;

document.getElementById("perm-meu-plantao")?.addEventListener("change",renderAlertasPermutaPreview);

document.getElementById("perm-plantao-destino")?.addEventListener("change",renderAlertasPermutaPreview);

