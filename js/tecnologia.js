import { addDoc, collection, deleteDoc, doc, getDocs, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { carregarViaturasCache } from "./armaria.js";
import { COL_CHAMADOS, COL_ERROS, COL_VIATURAS, _chamadosCache, _viaturasCache, agora, alerta, db, esc, registrarAuditoria, usuarioLogado, v } from "./core.js";
import { carregarTecnologia } from "./patrimonio.js";

export function gerarProtocoloChamado(){
  return `CH-${new Date().getFullYear()}-${String(Math.floor(Math.random()*900000)+100000)}`;
}

export async function iniciarChamados(){
  document.getElementById("cham-titulo").value="";
  document.getElementById("cham-desc").value="";
  document.getElementById("cham-prioridade").value="Média";
  await renderChamados();
}
window.iniciarChamados=iniciarChamados;

export async function abrirChamado(){
  const titulo=v("cham-titulo"),desc=v("cham-desc"),prioridade=v("cham-prioridade");
  if(!titulo||!desc)return alerta("Preencha título e descrição.","erro");
  const protocolo=gerarProtocoloChamado();
  try{
    await addDoc(collection(db,COL_CHAMADOS),{
      protocolo,titulo,desc,prioridade,status:"aberto",
      abertoPor:usuarioLogado?.nome||"",abertoPorEmail:usuarioLogado?.email||"",
      responsavel:"",data:new Date().toISOString().slice(0,10),criadoEm:serverTimestamp()
    });
    await registrarAuditoria("Chamado técnico aberto",`${protocolo}: ${titulo}`);
    alerta(`Chamado ${protocolo} registrado!`,"ok");
    document.getElementById("cham-titulo").value="";
    document.getElementById("cham-desc").value="";
    await renderChamados();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.abrirChamado=abrirChamado;

export async function renderChamados(){
  const el=document.getElementById("chamados-lista");
  const cnt=document.getElementById("cham-contador");
  el.innerHTML='<p class="hist-vazio">Carregando...</p>';
  try{
    const snap=await getDocs(collection(db,COL_CHAMADOS));
    _chamadosCache=snap.docs.map(d=>({_id:d.id,...d.data()}))
      .sort((a,b)=>(b.criadoEm?.seconds||0)-(a.criadoEm?.seconds||0));
  }catch(e){el.innerHTML=`<p class="hist-vazio">Erro: ${e.message}</p>`;return;}

  const filtro=v("cham-filtro-status");
  let lista=_chamadosCache;
  if(filtro)lista=lista.filter(c=>c.status===filtro);
  if(cnt)cnt.textContent=lista.length?`${lista.length} chamado(s)`:"";

  const corSt={aberto:"#f87171",andamento:"#fbbf24",resolvido:"#7dcea0"};
  const iconeSt={aberto:"🔴",andamento:"🟡",resolvido:"🟢"};
  const iconePr={Alta:"🔺",Média:"🔸",Baixa:"🔹"};
  el.innerHTML=lista.length?lista.map(c=>`
    <div class="hist-item" style="border-left-color:${corSt[c.status]||"#888"}">
      <div class="hist-tipo" style="color:${corSt[c.status]||"#fff"}">${iconeSt[c.status]||""} ${esc(c.protocolo)} — ${esc(c.titulo)}</div>
      <div class="hist-data">${iconePr[c.prioridade]||""} ${esc(c.prioridade)} · 📅 ${c.data} · Aberto por: ${esc(c.abertoPor)||"—"}</div>
      <div class="hist-corpo">${esc(c.desc)}${c.responsavel?`\n👤 Responsável: ${esc(c.responsavel)}`:""}</div>
      ${c.status!=="resolvido"?`
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
        ${c.status==="aberto"?`<button class="btn btn-sm" style="background:rgba(251,191,36,.2);border-color:#fbbf24;color:#fbbf24;font-size:.65rem" onclick="assumirChamado('${c._id}')">🙋 Assumir</button>`:""}
        <button class="btn btn-sm btn-verde" onclick="resolverChamado('${c._id}')">✔ Marcar Resolvido</button>
      </div>`:""}
    </div>`).join(""):'<p class="hist-vazio">Nenhum chamado encontrado.</p>';
}
window.renderChamados=renderChamados;

export async function assumirChamado(id){
  try{
    await updateDoc(doc(db,COL_CHAMADOS,id),{status:"andamento",responsavel:usuarioLogado?.nome||""});
    await registrarAuditoria("Chamado técnico assumido",`ID: ${id}`);
    await renderChamados();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.assumirChamado=assumirChamado;

export async function resolverChamado(id){
  if(!confirm("Marcar este chamado como resolvido?"))return;
  try{
    await updateDoc(doc(db,COL_CHAMADOS,id),{status:"resolvido",resolvidoPor:usuarioLogado?.nome||"",resolvidoEm:serverTimestamp()});
    await registrarAuditoria("Chamado técnico resolvido",`ID: ${id}`);
    await renderChamados();
    carregarTecnologia();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.resolverChamado=resolverChamado;

export async function registrarErroSistema(erro,modulo,descricao){
  try{
    await addDoc(collection(db,COL_ERROS),{
      erro:String(erro).substring(0,300),modulo:modulo||"Desconhecido",
      descricao:descricao||"",status:"aberto",
      usuarioNome:usuarioLogado?.nome||"Anônimo",usuarioEmail:usuarioLogado?.email||"",
      dispositivo:navigator.userAgent.substring(0,80),
      data:agora(),criadoEm:serverTimestamp()
    });
  }catch(e){/* evita loop de erro ao logar erro */}
}
window.registrarErroSistema=registrarErroSistema;

export function reportarErroManual(){
  const desc=prompt("Descreva o problema que você encontrou:");
  if(!desc||!desc.trim())return;
  const modulo=prompt("Em qual módulo aconteceu? (ex: Armaria, Plantão...)")||"Não informado";
  registrarErroSistema("Reportado manualmente pelo usuário",modulo,desc.trim());
  alerta("Problema reportado à equipe de Tecnologia.","ok");
  renderErros();
}
window.reportarErroManual=reportarErroManual;

export async function renderErros(){
  const el=document.getElementById("erros-lista");
  el.innerHTML='<p class="hist-vazio">Carregando...</p>';
  let docs=[];
  try{
    const snap=await getDocs(collection(db,COL_ERROS));
    docs=snap.docs.map(d=>({_id:d.id,...d.data()}))
      .sort((a,b)=>(b.criadoEm?.seconds||0)-(a.criadoEm?.seconds||0));
  }catch(e){el.innerHTML=`<p class="hist-vazio">Erro: ${e.message}</p>`;return;}

  const filtro=v("erro-filtro-status");
  let lista=docs;
  if(filtro)lista=lista.filter(d=>d.status===filtro);
  const cnt=document.getElementById("erro-contador");
  if(cnt)cnt.textContent=lista.length?`${lista.length} registro(s)`:"";

  const corSt={aberto:"#f87171",analise:"#fbbf24",corrigido:"#7dcea0",ignorado:"#9ca3af"};
  const iconeSt={aberto:"🔴",analise:"🟡",corrigido:"🟢",ignorado:"⚪"};
  el.innerHTML=lista.length?lista.map(d=>`
    <div class="hist-item" style="border-left-color:${corSt[d.status]||"#888"}">
      <div class="hist-tipo" style="color:${corSt[d.status]}">${iconeSt[d.status]||""} ${esc(d.erro)}</div>
      <div class="hist-data">📁 ${esc(d.modulo)} · 👤 ${esc(d.usuarioNome)} · 📅 ${d.data}</div>
      ${d.descricao?`<div class="hist-corpo">${esc(d.descricao)}</div>`:""}
      <select onchange="atualizarStatusErro('${d._id}',this.value)" style="margin-top:8px">
        <option value="aberto" ${d.status==="aberto"?"selected":""}>🔴 Aberto</option>
        <option value="analise" ${d.status==="analise"?"selected":""}>🟡 Em Análise</option>
        <option value="corrigido" ${d.status==="corrigido"?"selected":""}>🟢 Corrigido</option>
        <option value="ignorado" ${d.status==="ignorado"?"selected":""}>⚪ Ignorado</option>
      </select>
    </div>`).join(""):'<p class="hist-vazio">Nenhum erro registrado. 🎉</p>';
}
window.renderErros=renderErros;

export async function atualizarStatusErro(id,status){
  try{
    await updateDoc(doc(db,COL_ERROS,id),{status});
    await registrarAuditoria("Status de erro atualizado",`${id}: ${status}`);
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.atualizarStatusErro=atualizarStatusErro;

export function abrirModalViatura(id=null){
  document.getElementById("vtr-edit-id").value=id||"";
  if(id){
    const vt=_viaturasCache.find(x=>x.id===id);if(!vt)return;
    document.getElementById("modal-vtr-titulo").textContent="Editar Viatura";
    document.getElementById("vtr-id").value=vt.identificacao||"";
    document.getElementById("vtr-modelo").value=vt.modelo||"";
    document.getElementById("vtr-placa").value=vt.placa||"";
    document.getElementById("vtr-situacao").value=vt.situacao||"disponivel";
    document.getElementById("vtr-km").value=vt.km||"";
    document.getElementById("vtr-obs").value=vt.obs||"";
  }else{
    document.getElementById("modal-vtr-titulo").textContent="Nova Viatura";
    ["vtr-id","vtr-modelo","vtr-placa","vtr-km","vtr-obs"].forEach(i=>document.getElementById(i).value="");
    document.getElementById("vtr-situacao").value="disponivel";
  }
  document.getElementById("modal-viatura").classList.add("aberto");
}
window.abrirModalViatura=abrirModalViatura;

export function fecharModalViatura(){document.getElementById("modal-viatura").classList.remove("aberto");}
window.fecharModalViatura=fecharModalViatura;

export async function salvarViaturaGestao(){
  const editId=v("vtr-edit-id");
  const dados={identificacao:v("vtr-id"),modelo:v("vtr-modelo"),
    placa:v("vtr-placa"),situacao:v("vtr-situacao"),km:v("vtr-km"),obs:v("vtr-obs"),atualizadoEm:agora()};
  if(!dados.identificacao)return alerta("Preencha a identificação.","erro");
  try{
    if(editId){
      await updateDoc(doc(db,COL_VIATURAS,editId),dados);
    }else{
      await addDoc(collection(db,COL_VIATURAS),{...dados,criadoPor:usuarioLogado?.nome||"",criadoEm:serverTimestamp()});
    }
    await registrarAuditoria(`Viatura ${editId?"editada":"cadastrada"}: ${dados.identificacao}`,`Placa: ${dados.placa}`);
    alerta(`Viatura ${editId?"atualizada":"cadastrada"}!`,"ok");
    fecharModalViatura();await renderViaturas();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.salvarViaturaGestao=salvarViaturaGestao;

export async function renderViaturas(){
  const q=(v("viatura-filtro")||"").toLowerCase();
  const el=document.getElementById("viaturas-lista");
  el.innerHTML='<p class="hist-vazio">Carregando...</p>';
  await carregarViaturasCache();
  let lista=_viaturasCache;
  if(q)lista=lista.filter(vt=>vt.identificacao?.toLowerCase().includes(q)||vt.placa?.toLowerCase().includes(q)||vt.modelo?.toLowerCase().includes(q));
  const cnt=document.getElementById("viatura-contador");
  cnt.textContent=lista.length?`${lista.length} viatura(s)`:"";
  const sitLabel={disponivel:"✅ Disponível",servico:"🚔 Em Serviço",manutencao:"🔧 Manutenção",inativa:"⛔ Inativa"};
  const sitColor={disponivel:"#7dcea0",servico:"#90c2fa",manutencao:"#f0b27a",inativa:"#f1948a"};
  el.innerHTML=lista.length?lista.map(vt=>`
    <div class="hist-item">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <div class="hist-tipo" style="margin:0">🚗 ${vt.identificacao}</div>
        <span style="font-size:.68rem;font-family:'Oswald',sans-serif;color:${sitColor[vt.situacao]||"var(--cinza)"}">${sitLabel[vt.situacao]||vt.situacao}</span>
      </div>
      <div class="hist-data">${vt.modelo||"—"} · Placa: ${vt.placa||"—"}</div>
      <div class="hist-corpo">KM: ${vt.km||"—"}${vt.obs?"\n"+vt.obs:""}</div>
      <div style="display:flex;gap:6px;margin-top:8px">
        <button class="btn btn-sm btn-cinza" onclick="abrirModalViatura('${vt.id}')">✏️ Editar</button>
        <button class="btn btn-sm btn-perigo" onclick="excluirViatura('${vt.id}')">🗑 Excluir</button>
      </div>
    </div>`).join(""):'<p class="hist-vazio">Nenhuma viatura cadastrada.</p>';
}
window.renderViaturas=renderViaturas;

export async function excluirViatura(id){
  if(!confirm("Excluir viatura?"))return;
  try{
    const vt=_viaturasCache.find(x=>x.id===id);
    await deleteDoc(doc(db,COL_VIATURAS,id));
    await registrarAuditoria(`Viatura excluída: ${vt?.identificacao||id}`,"");
    alerta("Viatura excluída.","aviso");await renderViaturas();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.excluirViatura=excluirViatura;

window.addEventListener("error",e=>{
  if(usuarioLogado)registrarErroSistema(e.message,"Sistema",e.filename?`${e.filename}:${e.lineno}`:"");
});

window.addEventListener("unhandledrejection",e=>{
  if(usuarioLogado)registrarErroSistema(e.reason?.message||String(e.reason),"Sistema","Promise rejeitada");
});

