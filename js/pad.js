import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, updateDoc, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { COL_ARMAS_IND, COL_BH, COL_OC, COL_OC_HIST, COL_PAD, COL_PAD_HIST, COL_PERMUTAS, COL_PLANTAO, COL_USUARIOS, agora, alerta, db, enviarNotificacao, esc, modalOcAtualId, padEditandoId, padFotosBase64, registrarAuditoria, usuarioLogado, v } from "./core.js";
import { carregarOC, renderOcorrenciasComando, salvarOC } from "./ocorrencias.js";

export async function registrarHistoricoOcorrencia(ocorrenciaId,acao,statusAnterior,statusNovo,observacoes){
  try{
    await addDoc(collection(db,COL_OC_HIST),{
      ocorrenciaId,acao,statusAnterior:statusAnterior||"",statusNovo:statusNovo||"",
      observacoes:observacoes||"",
      usuario:usuarioLogado?.nome||"Sistema",
      data:new Date().toISOString().slice(0,10),
      hora:new Date().toTimeString().slice(0,5),
      criadoEm:serverTimestamp()
    });
  }catch(e){console.warn("Histórico ocorrência:",e.message);}
}

export async function notificarComandoECorregedoria(titulo,corpo){
  try{
    const snap=await getDocs(query(collection(db,COL_USUARIOS),where("status","==","aprovado")));
    for(const d of snap.docs){
      const u=d.data();
      if(!u.email)continue;
      const temCor=u.permissoes?.corregedoria===true;
      const temCmd=u.permissoes?.comando===true;
      if(temCor||temCmd){
        await enviarNotificacao(u.email,titulo,corpo,temCor?"corregedoria":"comando");
      }
    }
  }catch(e){console.warn("notificarComandoECorregedoria:",e.message);}
}

export async function atualizarBadgeCorregedoria(){
  if(!usuarioLogado)return;
  try{
    const snap=await getDocs(query(collection(db,COL_OC),
      where("statusCorregedoria","in",["recebida","info_solicitada","em_analise"])));
    const n=snap.size;
    const badge=document.getElementById("badge-corregedoria");
    if(badge){
      if(n>0){badge.textContent=n>99?"99+":n;badge.style.display="inline-flex";}
      else badge.style.display="none";
    }
  }catch(e){}
}

export async function renderCaixaEntradaCorregedoria(){
  const lista=document.getElementById("corregedoria-inbox-lista");
  const cnt=document.getElementById("corregedoria-inbox-cnt");
  if(!lista)return;
  lista.innerHTML='<p class="hist-vazio">Carregando...</p>';
  try{
    const snap=await getDocs(query(collection(db,COL_OC),
      where("statusCorregedoria","in",["recebida","info_solicitada","em_analise"])));
    const docs=snap.docs.map(d=>({_docId:d.id,...d.data()}))
      .sort((a,b)=>(b.criadoEm?.seconds||0)-(a.criadoEm?.seconds||0));
    window._corInboxCache=docs;
    if(cnt)cnt.textContent=docs.length?`${docs.length} pendente(s)`:"";
    const corPrio={Alta:"#f1948a",Média:"#fbbf24",Baixa:"#7dcea0"};
    lista.innerHTML=!docs.length?'<p class="hist-vazio">Caixa de entrada vazia. ✅</p>'
      :docs.map(r=>`
        <div class="hist-item" style="cursor:pointer" onclick="abrirModalOcCorregedoria('${r._docId}')">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div style="font-size:.8rem;font-family:'Oswald',sans-serif;letter-spacing:1px;color:var(--dourado)">📥 ${r.protocoloCorregedoria||"—"}</div>
            <span style="font-size:.65rem;padding:2px 8px;border-radius:10px;background:${corPrio[r.prioridade]||"#999"};color:#1a1a1a;font-weight:bold">${r.prioridade||"Média"}</span>
          </div>
          <div style="font-size:.72rem;color:var(--cinza);margin-top:4px">📅 ${r.data||"—"}${r.hora?" · 🕐 "+r.hora:""} · ${{recebida:"📥 Recebido",em_analise:"🔍 Em Análise",info_solicitada:"❓ Aguardando informações"}[r.statusCorregedoria]||r.statusCorregedoria}</div>
          <div style="font-size:.75rem;margin-top:3px">👤 ${r.envolvidos||r.servidor||"—"}</div>
          <div style="font-size:.72rem;color:var(--cinza)">Registrado por: ${r.registradoPor||"—"}</div>
          <div style="font-size:.75rem;margin-top:4px">${(r.desc||"Sem descrição").substring(0,80)}</div>
        </div>`).join("");
  }catch(err){lista.innerHTML=`<p class="hist-vazio">Erro: ${err.message}</p>`;}
}

export function cidDispensados(){try{return JSON.parse(localStorage.getItem("pmc_cid_dispensados"))||[];}catch{return[];}}

export function cidAssinatura(txt){return txt.replace(/\s+/g,"").toLowerCase().substring(0,120);}

export async function carregarInteligenciaDisciplinar(){
  const el=document.getElementById("cid-lista");
  el.innerHTML='<p class="hist-vazio">Analisando dados...</p>';
  const alertas=[]; // {texto, servidor, nivel}
  const dispensados=cidDispensados();

  // 1) Reincidência disciplinar — servidores com 2+ PADs
  try{
    const snap=await getDocs(collection(db,COL_PAD));
    const pads=snap.docs.map(d=>d.data());
    const porServidor={};
    pads.forEach(p=>{if(p.servidor)porServidor[p.servidor]=(porServidor[p.servidor]||0)+1;});
    Object.entries(porServidor).filter(([,q])=>q>=2).forEach(([nome,q])=>
      alertas.push({texto:`Reincidência disciplinar: <strong>${nome}</strong> possui ${q} PAD(s) registrados.`,servidor:nome,nivel:"critico"}));
  }catch(e){}

  // 2) Extravios/danos recorrentes — 2+ ocorrências do tipo em 90 dias
  try{
    const desde=new Date();desde.setDate(desde.getDate()-90);
    const desdeStr=desde.toISOString().slice(0,10);
    const ocLista=(window._ocCache||carregarOC()).filter(o=>o.data>=desdeStr&&/extravio|dano|divergência/i.test(o.tipo||""));
    const porServidorEq={};
    ocLista.forEach(o=>{const key=o.servidor||o.envolvidos;if(key)porServidorEq[key]=(porServidorEq[key]||0)+1;});
    Object.entries(porServidorEq).filter(([,q])=>q>=2).forEach(([nome,q])=>
      alertas.push({texto:`Extravios/danos recorrentes envolvendo equipamentos sob responsabilidade de <strong>${nome}</strong> (${q} registros nos últimos 90 dias).`,servidor:nome,nivel:"critico"}));
    if(!Object.keys(porServidorEq).length){
      const semServidor=ocLista.length;
      if(semServidor>=3)alertas.push({texto:`${semServidor} ocorrência(s) de extravio/dano/divergência registradas nos últimos 90 dias — considere revisar os controles da Armaria.`,servidor:"",nivel:"importante"});
    }
  }catch(e){}

  // 3) Faltas e atrasos reincidentes — últimos 30 dias
  try{
    const desde=new Date();desde.setDate(desde.getDate()-30);
    const desdeStr=desde.toISOString().slice(0,10);
    const snap=await getDocs(collection(db,COL_PLANTAO));
    const regs=snap.docs.map(d=>d.data()).filter(r=>r.data>=desdeStr);
    const faltas={},atrasos={};
    regs.forEach(r=>{
      if(r.status==="ausente")faltas[r.servidorNome]=(faltas[r.servidorNome]||0)+1;
      if(r.status==="atrasado")atrasos[r.servidorNome]=(atrasos[r.servidorNome]||0)+1;
    });
    Object.entries(faltas).filter(([,q])=>q>=3).forEach(([nome,q])=>
      alertas.push({texto:`Reincidência de faltas: <strong>${nome}</strong> — ${q} falta(s) nos últimos 30 dias.`,servidor:nome,nivel:"importante"}));
    Object.entries(atrasos).filter(([,q])=>q>=4).forEach(([nome,q])=>
      alertas.push({texto:`Reincidência de atrasos: <strong>${nome}</strong> — ${q} atraso(s) nos últimos 30 dias.`,servidor:nome,nivel:"importante"}));
  }catch(e){}

  // 4) Horas extras extraordinárias frequentes — mesmo servidor, últimos 30 dias
  try{
    const desde=new Date();desde.setDate(desde.getDate()-30);
    const desdeStr=desde.toISOString().slice(0,10);
    const snap=await getDocs(query(collection(db,COL_BH),where("tipoHora","==","extraordinaria")));
    const lancs=snap.docs.map(d=>d.data()).filter(l=>l.data>=desdeStr);
    const porServidor={};
    lancs.forEach(l=>{if(l.srvNome)porServidor[l.srvNome]=(porServidor[l.srvNome]||0)+1;});
    Object.entries(porServidor).filter(([,q])=>q>=4).forEach(([nome,q])=>
      alertas.push({texto:`Horas extras extraordinárias frequentes: <strong>${nome}</strong> — ${q} lançamento(s) nos últimos 30 dias.`,servidor:nome,nivel:"importante"}));
  }catch(e){}

  // 5) Permutas excessivas entre os mesmos dois servidores — últimos 90 dias
  try{
    const desde=new Date();desde.setDate(desde.getDate()-90);
    const snap=await getDocs(collection(db,COL_PERMUTAS));
    const pares={};
    snap.docs.map(d=>d.data()).filter(p=>p.status==="aprovada"&&p.aprovadoEm?.toDate&&p.aprovadoEm.toDate()>=desde)
      .forEach(p=>{
        const chave=[p.solicitanteNome,p.destinatarioNome].sort().join(" ↔ ");
        pares[chave]=(pares[chave]||0)+1;
      });
    Object.entries(pares).filter(([,q])=>q>=3).forEach(([par,q])=>
      alertas.push({texto:`Permutas excessivas entre os mesmos servidores: <strong>${par}</strong> — ${q} permutas aprovadas nos últimos 90 dias.`,servidor:"",nivel:"importante"}));
  }catch(e){}

  // 6) Pendências de devolução de patrimônio — armas/coletes acautelados há mais de 5 dias
  try{
    const snapA=await getDocs(collection(db,COL_ARMAS_IND));
    snapA.docs.map(d=>d.data()).filter(a=>a.situacao==="Acautelada"&&a.acautelamento?.dataEntrega&&
      (Date.now()-new Date(a.acautelamento.dataEntrega).getTime())>1000*60*60*24*5)
      .forEach(a=>alertas.push({texto:`Arma acautelada há mais de 5 dias sem devolução — responsável: <strong>${a.acautelamento?.servidorNome||"—"}</strong>.`,servidor:a.acautelamento?.servidorNome||"",nivel:"importante"}));
  }catch(e){}

  const filtrados=alertas.filter(a=>!dispensados.includes(cidAssinatura(a.texto)));
  window._cidCache=filtrados;

  if(!filtrados.length){
    el.innerHTML='<p class="hist-vazio">Nenhum padrão relevante identificado no momento. ✅</p>';return;
  }
  const icone={critico:"🔴",importante:"🟡"};
  el.innerHTML=filtrados.map((a,i)=>`
    <div class="cid-card">
      ${icone[a.nivel]||"🟢"} ${esc(a.texto)}
      <div class="cid-acoes">
        ${a.servidor?`<button class="btn btn-sm btn-verde" onclick="cidAbrirPAD(${i})">⚖️ Analisar / Abrir PAD</button>`:""}
        <button class="btn btn-sm btn-cinza" onclick="cidDispensar(${i})">🗄 Descartar</button>
      </div>
    </div>`).join("");
}
window.carregarInteligenciaDisciplinar=carregarInteligenciaDisciplinar;

export function cidAbrirPAD(i){
  const a=window._cidCache?.[i];if(!a)return;
  abrirModalPAD("recebido");
  if(a.servidor)document.getElementById("pad-servidor").value=a.servidor;
  document.getElementById("pad-desc").value=`Origem: Central de Inteligência Disciplinar\n${a.texto.replace(/<[^>]+>/g,"")}`;
}
window.cidAbrirPAD=cidAbrirPAD;

export function cidDispensar(i){
  const a=window._cidCache?.[i];if(!a)return;
  const lista=cidDispensados();
  lista.push(cidAssinatura(a.texto));
  localStorage.setItem("pmc_cid_dispensados",JSON.stringify(lista));
  carregarInteligenciaDisciplinar();
}
window.cidDispensar=cidDispensar;

export function abrirModalOcCorregedoria(docId){
  const r=window._corInboxCache.find(x=>x._docId===docId);
  if(!r)return;
  modalOcAtualId=docId;
  document.getElementById("modal-oc-corpo").innerHTML=`
    <div><strong>Protocolo:</strong> ${r.protocoloCorregedoria||"—"}</div>
    <div><strong>Data/Hora:</strong> ${r.data||"—"} ${r.hora||""}</div>
    <div><strong>Nº Ocorrência:</strong> ${r.num||"—"} (${r.tipo||""})</div>
    <div><strong>Local:</strong> ${r.local||"—"}</div>
    <div><strong>Servidor envolvido:</strong> ${r.envolvidos||r.servidor||"—"}</div>
    <div><strong>Registrado por:</strong> ${r.registradoPor||"—"}</div>
    <div><strong>Prioridade:</strong> ${r.prioridade||"Média"}</div>
    <div style="margin-top:6px"><strong>Descrição:</strong><br>${r.desc||"Sem descrição"}</div>
    ${r.solicitacaoInfo?`<div style="margin-top:6px;color:#fbbf24"><strong>❓ Informação solicitada:</strong><br>${r.solicitacaoInfo}</div>`:""}`;
  document.getElementById("modal-oc-corregedoria").classList.add("aberto");
}
window.abrirModalOcCorregedoria=abrirModalOcCorregedoria;

export function fecharModalOcCorregedoria(){
  document.getElementById("modal-oc-corregedoria").classList.remove("aberto");
  modalOcAtualId=null;
}
window.fecharModalOcCorregedoria=fecharModalOcCorregedoria;

export async function acaoCorregedoria(acao){
  if(!modalOcAtualId)return;
  const r=window._corInboxCache.find(x=>x._docId===modalOcAtualId);
  if(!r)return;
  const docId=modalOcAtualId;
  const statusAnterior=r.statusCorregedoria||"recebida";

  if(acao==="analise"){
    try{
      await updateDoc(doc(db,COL_OC,docId),{statusCorregedoria:"em_analise",analiseIniciadaPor:usuarioLogado?.nome||"",analiseIniciadaEm:serverTimestamp()});
      await registrarHistoricoOcorrencia(docId,"Análise iniciada pela Corregedoria",statusAnterior,"em_analise","");
      await registrarAuditoria("Corregedoria iniciou análise",`Protocolo: ${r.protocoloCorregedoria||"—"}`);
      alerta("Ocorrência marcada como 'Em Análise'.","ok");
    }catch(err){return alerta("Erro: "+err.message,"erro");}

  }else if(acao==="pad"){
    if(!confirm("Abrir PAD para esta ocorrência? Ela sairá da Caixa de Entrada."))return;
    const numPAD=gerarNumeroPAD();
    try{
      await addDoc(collection(db,COL_PAD),{
        numero:numPAD,
        data:r.data||new Date().toISOString().slice(0,10),
        servidor:r.envolvidos||r.servidor||"A identificar",
        origem:"Corregedoria — Ocorrência "+(r.protocoloCorregedoria||r.num||""),
        responsavel:"",
        desc:`Ocorrência nº ${r.num||"—"} (${r.tipo||""})\nLocal: ${r.local||"—"}\n\n${r.desc||""}\n\nDecisão da Corregedoria: PAD aberto por ${usuarioLogado?.nome||"—"}.`,
        status:"recebido",fotos:[],
        registradoPor:usuarioLogado?.nome||"Sistema",
        registradoEmail:usuarioLogado?.email||"",
        criadoEm:serverTimestamp()
      });
      await updateDoc(doc(db,COL_OC,docId),{statusCorregedoria:"pad_aberto",padGerado:numPAD,decididoPor:usuarioLogado?.nome||"",decididoEm:serverTimestamp()});
      await registrarHistoricoOcorrencia(docId,"PAD aberto pela Corregedoria",statusAnterior,"pad_aberto",`PAD gerado: ${numPAD}`);
      await registrarAuditoria(`Corregedoria abriu PAD ${numPAD}`,`Origem: Ocorrência ${r.protocoloCorregedoria||r.num||""}`);
      alerta(`PAD ${numPAD} aberto e movido para "Recebido"!`,"ok");
    }catch(err){return alerta("Erro: "+err.message,"erro");}

  }else if(acao==="info"){
    const pedido=prompt("Descreva qual informação adicional está sendo solicitada à Inspetoria:");
    if(!pedido||!pedido.trim())return alerta("Solicitação cancelada.","aviso");
    try{
      await updateDoc(doc(db,COL_OC,docId),{statusCorregedoria:"info_solicitada",solicitacaoInfo:pedido.trim()});
      await registrarHistoricoOcorrencia(docId,"Solicitou mais informações",statusAnterior,"info_solicitada",pedido.trim());
      await registrarAuditoria("Corregedoria solicitou mais informações",`Protocolo: ${r.protocoloCorregedoria||"—"}`);
      // informa apenas Comando/Corregedoria — não vai para o sino da Inspetoria
      await notificarComandoECorregedoria("❓ Corregedoria solicitou mais informações",`Ocorrência ${r.num||""}: ${pedido.trim()}`);
      alerta("Solicitação registrada. A ocorrência permanece na caixa de entrada.","ok");
    }catch(err){return alerta("Erro: "+err.message,"erro");}

  }else if(acao==="arquivar"){
    const just=prompt("Justificativa do arquivamento sem PAD (obrigatória):");
    if(!just||!just.trim())return alerta("Arquivamento cancelado: justificativa é obrigatória.","erro");
    try{
      await updateDoc(doc(db,COL_OC,docId),{statusCorregedoria:"arquivada_sem_pad",justificativaCorregedoria:just.trim(),decididoPor:usuarioLogado?.nome||"",decididoEm:serverTimestamp()});
      await registrarHistoricoOcorrencia(docId,"Arquivada sem PAD",statusAnterior,"arquivada_sem_pad",just.trim());
      await registrarAuditoria("Corregedoria arquivou ocorrência sem PAD",`Justificativa: ${just.trim()}`);
      alerta("Ocorrência arquivada sem PAD.","ok");
    }catch(err){return alerta("Erro: "+err.message,"erro");}

  }else if(acao==="devolver"){
    const motivo=prompt("Motivo da devolução à Inspetoria (obrigatório):");
    if(!motivo||!motivo.trim())return alerta("Devolução cancelada: motivo é obrigatório.","erro");
    try{
      await updateDoc(doc(db,COL_OC,docId),{statusCorregedoria:"devolvida",motivoDevolucao:motivo.trim(),decididoPor:usuarioLogado?.nome||"",decididoEm:serverTimestamp()});
      await registrarHistoricoOcorrencia(docId,"Devolvida à Inspetoria",statusAnterior,"devolvida",motivo.trim());
      await registrarAuditoria("Corregedoria devolveu ocorrência à Inspetoria",`Motivo: ${motivo.trim()}`);
      // informa apenas Comando/Corregedoria — não vai para o sino da Inspetoria
      await notificarComandoECorregedoria("↩️ Ocorrência devolvida pela Corregedoria",`Ocorrência ${r.num||""}: ${motivo.trim()}`);
      alerta("Ocorrência devolvida à Inspetoria.","ok");
    }catch(err){return alerta("Erro: "+err.message,"erro");}
  }

  fecharModalOcCorregedoria();
  renderCaixaEntradaCorregedoria();
  atualizarBadgeCorregedoria();
}
window.acaoCorregedoria=acaoCorregedoria;

export async function carregarOcorrencias(){
  // Firestore é a fonte de verdade. localStorage guarda só o que ainda
  // não sincronizou (_sincronizado:false) — nunca substitui o que veio
  // do servidor, só complementa.
  let remoto=[];
  try{
    const snap=await getDocs(query(collection(db,COL_OC)));
    remoto=snap.docs.map(d=>({...d.data(),id:d.id,_fbId:d.id,_sincronizado:true}));
  }catch(e){
    console.warn("carregarOcorrencias: falha ao buscar do Firestore —",e.message);
  }
  const pendentesLocais=carregarOC().filter(o=>o._sincronizado===false);
  window._ocCache=[...pendentesLocais,...remoto].sort((a,b)=>(b.criadoEm?.seconds||0)-(a.criadoEm?.seconds||0)||(b.criadoEm?.localeCompare?.(a.criadoEm)||0));
  renderOcorrencias();
}

export function renderOcorrencias(){
  const lista=window._ocCache||carregarOC();
  const q=(v("oc-filtro")||"").toLowerCase();
  const st=v("oc-filtro-status");
  const dt=v("oc-filtro-data");
  let filtrados=lista;
  if(q)filtrados=filtrados.filter(o=>o.num?.toLowerCase().includes(q)||o.tipo?.toLowerCase().includes(q)||o.local?.toLowerCase().includes(q));
  if(st)filtrados=filtrados.filter(o=>o.status===st);
  if(dt)filtrados=filtrados.filter(o=>o.data===dt);

  document.getElementById("oc-contador").textContent=filtrados.length?`${filtrados.length} ocorrência(s)`:"";
  const el=document.getElementById("oc-lista");
  if(!filtrados.length){el.innerHTML='<p class="hist-vazio">Nenhuma ocorrência encontrada.</p>';return;}

  el.innerHTML=filtrados.map(o=>{
    const stClass=o.status==="aberta"?"aberta":o.status==="andamento"?"andamento":"encerrada";
    const stLabel=o.status==="aberta"?"🔴 Aberta":o.status==="andamento"?"🟡 Em Andamento":"🟢 Encerrada";
    const naoSincronizada=o._sincronizado===false;
    return`<div class="hist-item oc-${stClass}">
      ${naoSincronizada?`<div style="background:rgba(230,126,34,.15);border:1px solid rgba(230,126,34,.4);border-radius:6px;padding:6px 8px;margin-bottom:6px;font-size:.68rem;color:#f0b060">
        ⚠️ NÃO SINCRONIZADA — salva só neste aparelho
        <button class="btn btn-sm" style="margin-left:6px;background:rgba(230,126,34,.3);border-color:#e67e22;color:#fff" onclick="reenviarOcorrenciaPendente('${o.id}')">🔄 Reenviar</button>
      </div>`:""}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <div class="hist-tipo" style="margin:0">🚨 ${esc(o.num)}</div>
        <span class="oc-badge ${stClass}">${stLabel}</span>
      </div>
      <div class="hist-data">📅 ${esc(o.data)} ${o.hora?"· "+esc(o.hora):""} · ${esc(o.tipo)}</div>
      <div class="hist-usuario">📍 ${esc(o.local)}</div>
      <div class="hist-corpo">${o.envolvidos?"Envolvidos: "+esc(o.envolvidos)+"\n":""}${o.servidor?"Servidor: "+esc(o.servidor)+"\n":""}${esc(o.desc)}\nRegistrado por: ${esc(o.registradoPor)}</div>
      <div style="font-size:.68rem;color:var(--cinza);margin-top:4px">ℹ️ Status definido pelo Comando</div>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
        <button class="btn btn-sm" style="background:rgba(66,133,244,.2);border-color:#60a5fa;color:#60a5fa;font-size:.7rem" onclick="compartilharOC('${o.id}')">📤 WA</button>
      </div>
    </div>`;
  }).join("");
}
window.renderOcorrencias=renderOcorrencias;

export async function alterarStatusOC(id,novoStatus){
  const lista=carregarOC();
  const idx=lista.findIndex(o=>o.id===id);
  const item=(window._ocCache||[]).find(o=>o.id===id);
  if(item&&item._sincronizado===false){
    alerta("Essa ocorrência ainda não foi sincronizada com o servidor — reenvie antes de mudar o status.","erro");
    return;
  }
  try{
    await updateDoc(doc(db,COL_OC,id),{status:novoStatus});
  }catch(err){
    alerta("Não foi possível atualizar o status no servidor: "+err.message,"erro");
    return; // não atualiza a cópia local se o servidor recusou — evita telas divergentes
  }
  if(idx>-1){lista[idx].status=novoStatus;salvarOC(lista);}
  if(window._ocCache){
    const ci=window._ocCache.findIndex(o=>o.id===id);
    if(ci>-1)window._ocCache[ci].status=novoStatus;
  }
  await registrarAuditoria("Status de ocorrência alterado",`${id} → ${novoStatus}`,
    {modulo:"🚨 Ocorrências",registro:id});
  alerta("Status atualizado!","ok");
  renderOcorrencias();
  if(document.getElementById("cmd-oc-lista"))renderOcorrenciasComando();
}
window.alterarStatusOC=alterarStatusOC;

export function gerarNumeroPAD(){
  const ano=new Date().getFullYear();
  const seq=String(Math.floor(Math.random()*9000)+1000);
  return `PAD-${ano}/${seq}`;
}

export function iniciarPADTela(id){
  const statusMap={
    "pad-recebido":"recebido","pad-analise":"analise",
    "pad-aberto":"aberto","pad-arquivado":"arquivado"
  };
  const labelMap={
    recebido:"📥 PAD — Recebido",analise:"🔍 PAD — Em Análise",
    aberto:"📂 PAD — Aberto",arquivado:"🗄 PAD — Arquivado"
  };
  const status=statusMap[id];
  const el=document.getElementById(id);
  el.innerHTML=`
    <button class="btn btn-voltar no-print" onclick="ir('corregedoria')">← Voltar</button>
    <div class="secao-titulo">${labelMap[status]}</div>
    ${status!=="arquivado"?`<button class="btn btn-full btn-perigo" style="margin-bottom:10px" onclick="abrirModalPAD('${status}')">+ Novo PAD</button>`:""}
    <div class="filtros-box" style="margin-bottom:10px">
      <input type="text" id="pad-filtro-${status}" placeholder="🔍 Buscar PAD..." oninput="renderPADs('${status}')" style="margin:0">
    </div>
    <div class="hist-contador" id="pad-cnt-${status}"></div>
    <div id="pad-lista-${status}" class="hist-scroll"><p class="hist-vazio">Carregando...</p></div>`;
  renderPADs(status);
}

export async function renderPADs(status){
  const lista=document.getElementById(`pad-lista-${status}`);
  const cont=document.getElementById(`pad-cnt-${status}`);
  if(!lista)return;
  lista.innerHTML='<p class="hist-vazio">Carregando...</p>';
  try{
    const snap=await getDocs(query(collection(db,COL_PAD),where("status","==",status)));
    const q=(document.getElementById(`pad-filtro-${status}`)?.value||"").toLowerCase();
    let docs=snap.docs.map(d=>({id:d.id,...d.data()}))
      .sort((a,b)=>(b.criadoEm?.seconds||0)-(a.criadoEm?.seconds||0));
    if(q)docs=docs.filter(d=>d.numero?.toLowerCase().includes(q)||d.servidor?.toLowerCase().includes(q)||d.desc?.toLowerCase().includes(q));
    cont.textContent=docs.length?`${docs.length} PAD(s)`:"";
    if(!docs.length){lista.innerHTML='<p class="hist-vazio">Nenhum PAD neste status.</p>';return;}
    lista.innerHTML=docs.map(d=>`
      <div class="hist-item pad-${status}" style="cursor:pointer" onclick="abrirDetalhePAD('${d.id}')">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <div class="hist-tipo" style="margin:0">⚖️ ${esc(d.numero)}</div>
          <span class="pad-badge ${status}">${esc(d.status?.toUpperCase())}</span>
        </div>
        <div class="hist-data">📅 ${esc(d.data)} · Servidor: ${esc(d.servidor)}</div>
        <div class="hist-usuario">👤 Responsável: ${esc(d.responsavel)||"—"}</div>
        <div class="hist-corpo">${esc((d.desc||"").substring(0,80))}${d.desc?.length>80?"...":""}</div>
        ${d.fotos?.length?`<div style="font-size:.68rem;color:var(--cinza);margin-top:4px">📎 ${d.fotos.length} anexo(s)</div>`:""}
      </div>`).join("");
  }catch(err){lista.innerHTML=`<p class="hist-vazio">Erro: ${err.message}</p>`;}
}

export function abrirModalPAD(status){
  padFotosBase64=[];padEditandoId=null;
  document.getElementById("modal-pad-titulo").textContent="Novo PAD";
  document.getElementById("pad-num").value=gerarNumeroPAD();
  document.getElementById("pad-data").value=new Date().toISOString().slice(0,10);
  ["pad-servidor","pad-responsavel","pad-desc"].forEach(id=>{document.getElementById(id).value="";});
  document.getElementById("pad-prazo").value="";
  document.getElementById("pad-origem").selectedIndex=0;
  document.getElementById("pad-fotos-preview").innerHTML="";
  document.getElementById("modal-pad").dataset.status=status;
  document.getElementById("modal-pad").classList.add("aberto");
}
window.abrirModalPAD=abrirModalPAD;

export function fecharModalPAD(){
  document.getElementById("modal-pad").classList.remove("aberto");
}
window.fecharModalPAD=fecharModalPAD;

export async function salvarPAD(){
  const num=v("pad-num")||gerarNumeroPAD();
  const data=v("pad-data");
  const servidor=v("pad-servidor");
  const origem=v("pad-origem");
  const responsavel=v("pad-responsavel");
  const prazo=v("pad-prazo");
  const desc=v("pad-desc");
  const status=document.getElementById("modal-pad").dataset.status||"recebido";
  if(!servidor||!data)return alerta("Preencha servidor e data.","erro");
  try{
    const docData={
      numero:num,data,servidor,origem,responsavel,prazo,desc,
      status,fotos:padFotosBase64,
      registradoPor:usuarioLogado?.nome||"",
      registradoEmail:usuarioLogado?.email||"",
      criadoEm:serverTimestamp()
    };
    await addDoc(collection(db,COL_PAD),docData);
    // auditoria
    await registrarAuditoria(`PAD criado: ${num} — ${servidor}`,`Status: ${status}`);
    alerta(`PAD ${num} registrado!`,"ok");
    fecharModalPAD();
    renderPADs(status);
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.salvarPAD=salvarPAD;

export async function abrirDetalhePAD(id){
  try{
    const snap=await getDocs(query(collection(db,COL_PAD)));
    const d=snap.docs.find(d=>d.id===id);
    if(!d)return;
    const pad={id:d.id,...d.data()};
    document.getElementById("pad-det-titulo").textContent=`⚖️ ${pad.numero}`;
    document.getElementById("pad-det-corpo").innerHTML=`
      <strong>Data:</strong> ${esc(pad.data)}<br>
      <strong>Servidor:</strong> ${esc(pad.servidor)}<br>
      <strong>Origem:</strong> ${esc(pad.origem)}<br>
      <strong>Responsável:</strong> ${esc(pad.responsavel)||"—"}<br>
      <strong>Prazo:</strong> ${esc(pad.prazo)||"—"}<br>
      <strong>Status:</strong> <span class="pad-badge ${pad.status}">${esc(pad.status?.toUpperCase())}</span><br>
      <strong>Registrado por:</strong> ${esc(pad.registradoPor)}<br><br>
      <strong>Descrição:</strong><br>${esc(pad.desc)||"—"}`;
    // fotos
    const fotosEl=document.getElementById("pad-det-fotos");
    fotosEl.innerHTML=pad.fotos?.length
      ?pad.fotos.map(f=>`<img src="${f}" style="width:70px;height:70px;object-fit:cover;border-radius:6px;border:1px solid rgba(201,168,76,.3);cursor:pointer" onclick="window.open('${f}','_blank')">`).join("")
      :"";
    // histórico
    const histEl=document.getElementById("pad-det-historico");
    const histSnap=await getDocs(query(collection(db,COL_PAD_HIST),where("padId","==",id),orderBy("criadoEm","desc")));
    histEl.innerHTML=histSnap.empty?'<p style="color:var(--cinza);font-size:.78rem;padding:8px 0">Nenhuma movimentação.</p>'
      :histSnap.docs.map(h=>{const r=h.data();return`<div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,.06);font-size:.78rem">
        <strong style="color:var(--dourado)">${esc(r.de?.toUpperCase())||""} → ${esc(r.para?.toUpperCase())||""}</strong><br>
        ${esc(r.obs)} · <span style="color:var(--cinza)">${esc(r.hora)} — ${esc(r.usuario)}</span>
      </div>`}).join("");
    // botões de avanço
    const fluxo=["recebido","analise","aberto","arquivado"];
    const idx=fluxo.indexOf(pad.status);
    const acoes=document.getElementById("pad-det-acoes");
    acoes.innerHTML="";
    if(idx<fluxo.length-1){
      const prox=fluxo[idx+1];
      const labels={analise:"🔍 Enviar p/ Análise",aberto:"📂 Abrir PAD",arquivado:"🗄 Arquivar"};
      const btn=document.createElement("button");
      btn.className="btn btn-verde";
      btn.textContent=labels[prox]||prox;
      btn.onclick=()=>avancarPAD(id,pad.status,prox);
      acoes.appendChild(btn);
    }
    const btnExcluir=document.createElement("button");
    btnExcluir.className="btn btn-perigo";
    btnExcluir.textContent="🗑 Excluir";
    btnExcluir.onclick=()=>excluirPAD(id,pad.status);
    acoes.appendChild(btnExcluir);
    document.getElementById("modal-pad-detalhe").classList.add("aberto");
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.abrirDetalhePAD=abrirDetalhePAD;

export function fecharModalPADDetalhe(){
  document.getElementById("modal-pad-detalhe").classList.remove("aberto");
}
window.fecharModalPADDetalhe=fecharModalPADDetalhe;

export async function avancarPAD(id,de,para){
  const obs=prompt(`Observação para mover de ${de.toUpperCase()} → ${para.toUpperCase()} (opcional):`)||"";
  try{
    await updateDoc(doc(db,COL_PAD,id),{status:para});
    await addDoc(collection(db,COL_PAD_HIST),{
      padId:id,de,para,obs,
      usuario:usuarioLogado?.nome||"",hora:agora(),criadoEm:serverTimestamp()
    });
    await registrarAuditoria(`PAD movido: ${de} → ${para}`,`PAD ID: ${id}`);
    alerta(`PAD movido para ${para.toUpperCase()}!`,"ok");
    fecharModalPADDetalhe();
    // atualiza a tela atual
    const statusMap={recebido:"pad-recebido",analise:"pad-analise",aberto:"pad-aberto",arquivado:"pad-arquivado"};
    renderPADs(de);renderPADs(para);
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.avancarPAD=avancarPAD;

export async function excluirPAD(id,status){
  if(!confirm("Excluir este PAD permanentemente?"))return;
  try{
    await deleteDoc(doc(db,COL_PAD,id));
    await registrarAuditoria(`PAD excluído`,`PAD ID: ${id}`);
    alerta("PAD excluído.","aviso");
    fecharModalPADDetalhe();
    renderPADs(status);
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.excluirPAD=excluirPAD;

document.getElementById("pad-fotos").addEventListener("change",function(){
  padFotosBase64=[];
  const prev=document.getElementById("pad-fotos-preview");
  prev.innerHTML="";
  Array.from(this.files).forEach(file=>{
    const reader=new FileReader();
    reader.onload=e=>{
      padFotosBase64.push(e.target.result);
      const img=document.createElement("img");
      img.src=e.target.result;
      img.style.cssText="width:60px;height:60px;object-fit:cover;border-radius:6px;border:1px solid rgba(201,168,76,.3)";
      prev.appendChild(img);
    };
    reader.readAsDataURL(file);
  });
});

