import { addDoc, collection, deleteDoc, doc, getDocs, query, serverTimestamp, updateDoc, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { CHAVE, COL_ARMAS_HIST, COL_ARMAS_IND, COL_COLETES, COL_COLETES_HIST, COL_MUNICOES, COL_MUNICOES_HIST, COL_VIATURAS, _armasIndCache, _coleteFotoBase64, _coletesCache, _histArmariaCache, _municoesCache, _viaturasCache, agora, alerta, contadorArmas, db, registrarAuditoria, salvarAuditoria, usuarioLogado, v } from "./core.js";
import { criarOcorrenciaAutomatica } from "./ocorrencias.js";

export function iniciarArmas(){
  const cont=document.getElementById("armas-linhas");
  if(cont.children.length===0){contadorArmas=0;adicionarLinhaArma();}
}

export function adicionarLinhaArma(){
  contadorArmas++;const n=contadorArmas,cont=document.getElementById("armas-linhas"),div=document.createElement("div");
  div.className="arma-linha";div.id="arma-linha-"+n;
  div.innerHTML=`<div class="arma-linha-header">
    <span class="arma-linha-num">Item ${n}</span>
    ${n>1?`<button class="btn-remover-linha" data-num="${n}">✕ Remover</button>`:""}
  </div>
  <select id="tipoArma_${n}"><option>Tonfas</option><option>Sparks</option><option>Coletes</option><option>Algemas</option><option>Pistolas</option><option>Calibre 12</option></select>
  <input type="number" id="qtdArma_${n}" placeholder="Quantidade">
  <textarea id="obsArma_${n}" placeholder="Observações"></textarea>`;
  div.querySelector("[data-num]")?.addEventListener("click",e=>document.getElementById("arma-linha-"+e.target.dataset.num)?.remove());
  cont.appendChild(div);
}

window.adicionarLinhaArma=adicionarLinhaArma;

export function carregarHist(){try{return JSON.parse(localStorage.getItem(CHAVE))||[];}catch{return[];}}

export function salvarLocal(tipo,dados){
  const h=carregarHist();h.unshift({tipo,dados,data:agora()});
  localStorage.setItem(CHAVE,JSON.stringify(h));
}

export async function atualizarBadge(){
  try{
    const hoje=new Date().toISOString().slice(0,10);
    const [a,c,m]=await Promise.all([
      getDocs(collection(db,COL_ARMAS_HIST)),
      getDocs(collection(db,COL_COLETES_HIST)),
      getDocs(collection(db,COL_MUNICOES_HIST))
    ]);
    const total=[...a.docs,...c.docs,...m.docs].filter(d=>(d.data().hora||"").startsWith(hoje)).length;
    const badge=document.getElementById("badge-hist");
    if(badge)badge.textContent=total;
  }catch(e){}
}

export async function renderHistorico(){
  const el=document.getElementById("historico-lista");
  el.innerHTML='<p class="hist-vazio">Carregando...</p>';
  try{
    const [a,c,m]=await Promise.all([
      getDocs(collection(db,COL_ARMAS_HIST)),
      getDocs(collection(db,COL_COLETES_HIST)),
      getDocs(collection(db,COL_MUNICOES_HIST))
    ]);
    const lista=[
      ...a.docs.map(d=>({...d.data(),_origem:"arma",_icone:"<span class=\"ic-img ic-arma\"></span>"})),
      ...c.docs.map(d=>({...d.data(),_origem:"colete",_icone:"<span class=\"ic-img ic-coletes\"></span>"})),
      ...m.docs.map(d=>({...d.data(),_origem:"municao",_icone:"<span class=\"ic-img ic-municoes\"></span>"}))
    ].sort((x,y)=>(y.hora||"").localeCompare(x.hora||""));
    _histArmariaCache=lista;

    const filtro=v("hist-armaria-filtro-tipo");
    const filtrada=filtro?lista.filter(r=>r._origem===filtro):lista;

    document.getElementById("hist-contador").textContent=filtrada.length?`${filtrada.length} registro(s)`:"";
    el.innerHTML=filtrada.length
      ?filtrada.map(r=>`<div class="hist-item">
          <div class="hist-tipo">${r._icone} ${(r.tipo||"").replace(/_/g," ").toUpperCase()}</div>
          <div class="hist-data">🕐 ${r.hora||""} · 👤 ${r.usuarioNome||"—"}</div>
          <div class="hist-corpo">${r.detalhes||""}</div>
        </div>`).join("")
      :'<p class="hist-vazio">Nenhum registro ainda.</p>';
    atualizarBadge();
  }catch(err){el.innerHTML=`<p class="hist-vazio">Erro: ${err.message}</p>`;}
}

export function imprimirHistorico(){
  if(!_histArmariaCache.length)return alerta("Histórico vazio.","aviso");
  document.getElementById("print-meta").innerHTML=`Gerado em: ${agora()}<br>Total: ${_histArmariaCache.length} registro(s)`;
  window.print();
}
window.imprimirHistorico=imprimirHistorico;

export async function enviarArmas(){
  const linhas=document.querySelectorAll(".arma-linha");
  if(!linhas.length)return alerta("Adicione pelo menos um item.","erro");
  let resumo="";
  linhas.forEach((l,i)=>{const n=l.id.replace("arma-linha-","");
    resumo+=`— Item ${i+1}: ${v("tipoArma_"+n)} | Qtd: ${v("qtdArma_"+n)}`+(v("obsArma_"+n)?` | Obs: ${v("obsArma_"+n)}`:"")+"\n";});
  resumo=resumo.trim();salvarLocal("Armas",resumo);await salvarAuditoria("Armas",resumo);
  window.location.href=`mailto:valmir.silva.adm@hotmail.com?subject=Armas&body=${encodeURIComponent("Armas:\n"+resumo)}`;
}
window.enviarArmas=enviarArmas;

export async function enviarMunicao(){
  const resumo=`Tipo: ${v("tipoMunicao")}\nQuantidade: ${v("qtdMunicao")}\nObs: ${v("obsMunicao")}`;
  salvarLocal("Munições",resumo);await salvarAuditoria("Munições",resumo);
  window.location.href=`mailto:valmir.silva.adm@hotmail.com?subject=Munições&body=${encodeURIComponent("Munições:\n"+resumo)}`;
}
window.enviarMunicao=enviarMunicao;

export async function enviarViatura(){
  const resumo=`Identificação: ${v("viatura")}\nObs: ${v("obsViatura")}`;
  salvarLocal("Viaturas",resumo);await salvarAuditoria("Viaturas",resumo);
  window.location.href=`mailto:valmir.silva.adm@hotmail.com?subject=Viaturas&body=${encodeURIComponent("Viatura:\n"+resumo)}`;
}
window.enviarViatura=enviarViatura;

export async function carregarMunicoesCache(){
  try{
    const snap=await getDocs(collection(db,COL_MUNICOES));
    _municoesCache=snap.docs.map(d=>({id:d.id,...d.data()}))
      .sort((a,b)=>(b.criadoEm?.seconds||0)-(a.criadoEm?.seconds||0));
  }catch(e){_municoesCache=[];}
  return _municoesCache;
}

export async function registrarMovMunicao(municaoId,tipo,detalhes,extra={}){
  await addDoc(collection(db,COL_MUNICOES_HIST),{
    municaoId,tipo,detalhes,...extra,
    usuarioNome:usuarioLogado?.nome||"",usuarioEmail:usuarioLogado?.email||"",
    hora:agora(),criadoEm:serverTimestamp()
  });
}

export async function carregarViaturasCache(){
  try{
    const snap=await getDocs(collection(db,COL_VIATURAS));
    _viaturasCache=snap.docs.map(d=>({id:d.id,...d.data()}))
      .sort((a,b)=>(b.criadoEm?.seconds||0)-(a.criadoEm?.seconds||0));
  }catch(e){_viaturasCache=[];}
  return _viaturasCache;
}

export function diasParaVencer(dataStr){
  if(!dataStr)return null;
  const hoje=new Date();hoje.setHours(0,0,0,0);
  const venc=new Date(dataStr+"T00:00:00");
  if(isNaN(venc.getTime()))return null;
  return Math.round((venc-hoje)/86400000);
}

export function alertaVencimento(dataStr){
  const d=diasParaVencer(dataStr);
  if(d===null)return null;
  if(d<0)return{nivel:"vencido",texto:"🔴 VENCIDO",cor:"#f87171"};
  if(d<=30)return{nivel:"critico",texto:`🟠 Vence em ${d}d`,cor:"#fb923c"};
  if(d<=90)return{nivel:"atencao",texto:`🟡 Vence em ${d}d`,cor:"#fbbf24"};
  if(d<=180)return{nivel:"aviso",texto:`ℹ️ Vence em ${d}d`,cor:"#60a5fa"};
  return null;
}

export async function carregarArmasInd(){
  const el=document.getElementById("armas-lista");
  if(el)el.innerHTML='<p class="hist-vazio">Carregando...</p>';
  try{
    const snap=await getDocs(collection(db,COL_ARMAS_IND));
    _armasIndCache=snap.docs.map(d=>({...d.data(),_id:d.id}))
      .sort((a,b)=>(b.criadoEmTxt||"").localeCompare(a.criadoEmTxt||""));
  }catch(e){_armasIndCache=[];}
  renderArmasInd();
  renderAcautelarArmasLista();
  renderRecebimentoArmasLista();
}

export function renderArmasInd(){
  const q=(v("arma-filtro")||"").toLowerCase();
  let lista=_armasIndCache;
  if(q)lista=lista.filter(a=>a.numeroSerie?.toLowerCase().includes(q)||a.patrimonio?.toLowerCase().includes(q)||
    a.tipo?.toLowerCase().includes(q)||a.modelo?.toLowerCase().includes(q)||a.acautelamento?.servidorNome?.toLowerCase().includes(q));
  const el=document.getElementById("armas-lista");
  const cnt=document.getElementById("arma-contador");
  if(cnt)cnt.textContent=lista.length?`${lista.length} arma(s) cadastrada(s)`:"";
  if(!el)return;
  el.innerHTML=lista.length?lista.map(a=>{
    const acautelada=a.situacao==="Acautelada";
    return`<div class="hist-item">
      <div class="hist-tipo" style="margin:0"><span class="ic-img ic-arma"></span> ${a.tipo||""} ${a.marca||""} ${a.modelo||""}</div>
      <div class="hist-data">Série: ${a.numeroSerie||"—"} · Patr: ${a.patrimonio||"—"} · Cal: ${a.calibre||"—"} · <strong>${a.situacao||"—"}</strong></div>
      <div class="hist-corpo">${acautelada?`Sob responsabilidade de: <strong>${a.acautelamento?.servidorNome||"—"}</strong> (Mat: ${a.acautelamento?.matricula||"—"})\nCarregadores: ${a.acautelamento?.qtdCarregadores??"—"} · Munições: ${a.acautelamento?.qtdMunicoes??"—"}\nEntrega: ${a.acautelamento?.dataEntrega||""} ${a.acautelamento?.horaEntrega||""}`:"Sem servidor responsável no momento."}${a.obs?"\n"+a.obs:""}</div>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
        <button class="btn btn-sm btn-cinza" onclick="abrirModalArma('${a._id}')">✏️ Editar</button>
        <button class="btn btn-sm" style="background:rgba(96,165,250,.2);border-color:#60a5fa;color:#60a5fa;font-size:.65rem" onclick="conferenciaArma('${a._id}')">🔍 Conferência</button>
        <button class="btn btn-sm" style="background:rgba(167,139,250,.2);border-color:#a78bfa;color:#a78bfa;font-size:.65rem" onclick="manutencaoArma('${a._id}')">🔧 Manutenção</button>
        <button class="btn btn-sm" style="background:rgba(201,168,76,.2);border-color:var(--dourado);color:var(--dourado);font-size:.65rem" onclick="historicoArma('${a._id}')">🕐 Histórico</button>
        <button class="btn btn-sm btn-perigo" style="background:rgba(248,113,113,.25)" onclick="reportarExtravioArma('${a._id}')">🚨 Extravio/Dano</button>
        <button class="btn btn-sm btn-perigo" onclick="excluirArmaInd('${a._id}')">🗑</button>
      </div>
    </div>`;
  }).join(""):'<p class="hist-vazio">Nenhuma arma cadastrada.</p>';
}
window.renderArmasInd=renderArmasInd;

export function iniciarAcautelarArmas(){
  if(!_armasIndCache.length)carregarArmasInd();else renderAcautelarArmasLista();
}

export function renderAcautelarArmasLista(){
  const el=document.getElementById("acautelar-lista");
  if(!el)return; // tela ainda não existe no DOM neste momento do carregamento
  const q=(v("acautelar-filtro")||"").toLowerCase();
  let lista=(_armasIndCache||[]).filter(a=>a.situacao!=="Acautelada");
  if(q)lista=lista.filter(a=>a.numeroSerie?.toLowerCase().includes(q)||a.tipo?.toLowerCase().includes(q)||a.modelo?.toLowerCase().includes(q));
  const cnt=document.getElementById("acautelar-contador");
  if(cnt)cnt.textContent=lista.length?`${lista.length} arma(s) disponível(is)`:"";
  el.innerHTML=lista.length?lista.map(a=>`<div class="hist-item">
      <div class="hist-tipo" style="margin:0"><span class="ic-img ic-arma"></span> ${a.tipo||""} ${a.marca||""} ${a.modelo||""}</div>
      <div class="hist-data">Série: ${a.numeroSerie||"—"} · Patr: ${a.patrimonio||"—"} · Cal: ${a.calibre||"—"}</div>
      <div style="margin-top:8px">
        <button class="btn btn-sm" style="background:rgba(125,206,160,.2);border-color:#7dcea0;color:#7dcea0;font-size:.7rem" onclick="acautelarArma('${a._id}')">📤 Acautelar</button>
      </div>
    </div>`).join(""):'<p class="hist-vazio">Nenhuma arma disponível para acautelamento no momento.</p>';
}
window.renderAcautelarArmasLista=renderAcautelarArmasLista;

export function iniciarRecebimentoArmas(){
  if(!_armasIndCache.length)carregarArmasInd();else renderRecebimentoArmasLista();
}

export function renderRecebimentoArmasLista(){
  const el=document.getElementById("recebimento-lista");
  if(!el)return;
  const q=(v("recebimento-filtro")||"").toLowerCase();
  let lista=(_armasIndCache||[]).filter(a=>a.situacao==="Acautelada");
  if(q)lista=lista.filter(a=>a.numeroSerie?.toLowerCase().includes(q)||a.tipo?.toLowerCase().includes(q)||
    a.modelo?.toLowerCase().includes(q)||a.acautelamento?.servidorNome?.toLowerCase().includes(q));
  const cnt=document.getElementById("recebimento-contador");
  if(cnt)cnt.textContent=lista.length?`${lista.length} arma(s) acautelada(s)`:"";
  el.innerHTML=lista.length?lista.map(a=>`<div class="hist-item">
      <div class="hist-tipo" style="margin:0"><span class="ic-img ic-arma"></span> ${a.tipo||""} ${a.marca||""} ${a.modelo||""}</div>
      <div class="hist-data">Série: ${a.numeroSerie||"—"} · Patr: ${a.patrimonio||"—"}</div>
      <div class="hist-corpo">Sob responsabilidade de: <strong>${a.acautelamento?.servidorNome||"—"}</strong> (Mat: ${a.acautelamento?.matricula||"—"})\nCarregadores: ${a.acautelamento?.qtdCarregadores??"—"} · Munições: ${a.acautelamento?.qtdMunicoes??"—"}\nEntrega: ${a.acautelamento?.dataEntrega||""} ${a.acautelamento?.horaEntrega||""}</div>
      <div style="margin-top:8px">
        <button class="btn btn-sm" style="background:rgba(251,191,36,.2);border-color:#fbbf24;color:#fbbf24;font-size:.7rem" onclick="devolverArma('${a._id}')">📥 Receber</button>
      </div>
    </div>`).join(""):'<p class="hist-vazio">Nenhuma arma acautelada no momento.</p>';
}
window.renderRecebimentoArmasLista=renderRecebimentoArmasLista;

export function abrirModalArma(id=null){
  document.getElementById("arma-edit-id").value=id||"";
  if(id){
    const a=_armasIndCache.find(x=>x._id===id);if(!a)return;
    document.getElementById("modal-arma-titulo").textContent="Editar Arma";
    document.getElementById("arma-patrimonio").value=a.patrimonio||"";
    document.getElementById("arma-serie").value=a.numeroSerie||"";
    document.getElementById("arma-tipo").value=a.tipo||"Pistola";
    document.getElementById("arma-marca").value=a.marca||"";
    document.getElementById("arma-modelo").value=a.modelo||"";
    document.getElementById("arma-calibre").value=a.calibre||"";
    document.getElementById("arma-capacidade").value=a.capacidadeCarregador||"";
    document.getElementById("arma-ano").value=a.anoFabricacao||"";
    document.getElementById("arma-aquisicao").value=a.dataAquisicao||"";
    document.getElementById("arma-fornecedor").value=a.fornecedor||"";
    document.getElementById("arma-valor").value=a.valorAquisicao||"";
    document.getElementById("arma-situacao").value=a.situacao||"Disponível";
    document.getElementById("arma-obs").value=a.obs||"";
  }else{
    document.getElementById("modal-arma-titulo").textContent="Nova Arma";
    ["arma-patrimonio","arma-serie","arma-marca","arma-modelo","arma-calibre","arma-capacidade","arma-ano","arma-aquisicao","arma-fornecedor","arma-valor","arma-obs"]
      .forEach(i=>document.getElementById(i).value="");
    document.getElementById("arma-tipo").value="Pistola";
    document.getElementById("arma-situacao").value="Disponível";
  }
  document.getElementById("modal-arma").classList.add("aberto");
}
window.abrirModalArma=abrirModalArma;

export function fecharModalArma(){document.getElementById("modal-arma").classList.remove("aberto");}
window.fecharModalArma=fecharModalArma;

export async function salvarArmaGestao(){
  const editId=v("arma-edit-id");
  const numeroSerie=v("arma-serie");
  if(!numeroSerie)return alerta("Preencha o número de série.","erro");
  const dados={
    patrimonio:v("arma-patrimonio"),numeroSerie,tipo:v("arma-tipo"),marca:v("arma-marca"),modelo:v("arma-modelo"),
    calibre:v("arma-calibre"),capacidadeCarregador:v("arma-capacidade"),anoFabricacao:v("arma-ano"),
    dataAquisicao:v("arma-aquisicao"),fornecedor:v("arma-fornecedor"),valorAquisicao:v("arma-valor"),
    situacao:v("arma-situacao"),obs:v("arma-obs")
  };
  try{
    if(editId){
      await updateDoc(doc(db,COL_ARMAS_IND,editId),{...dados,alteradoPor:usuarioLogado?.nome||"",alteradoPorEmail:usuarioLogado?.email||"",alteradoEm:serverTimestamp()});
      await addDoc(collection(db,COL_ARMAS_HIST),{armaId:editId,tipo:"edicao",detalhes:"Dados da arma atualizados",usuarioNome:usuarioLogado?.nome||"",usuarioEmail:usuarioLogado?.email||"",hora:agora(),criadoEm:serverTimestamp()});
      await registrarAuditoria("Arma editada",`Série ${numeroSerie} — por ${usuarioLogado?.nome||""}`);
    }else{
      dados.criadoPor=usuarioLogado?.nome||"";dados.criadoPorEmail=usuarioLogado?.email||"";
      dados.criadoEm=serverTimestamp();dados.criadoEmTxt=agora();
      const novo=await addDoc(collection(db,COL_ARMAS_IND),dados);
      await addDoc(collection(db,COL_ARMAS_HIST),{armaId:novo.id,tipo:"cadastro",detalhes:"Arma cadastrada",usuarioNome:usuarioLogado?.nome||"",usuarioEmail:usuarioLogado?.email||"",hora:agora(),criadoEm:serverTimestamp()});
      await registrarAuditoria("Arma cadastrada",`Série ${numeroSerie} — por ${usuarioLogado?.nome||""}`);
    }
    alerta(`Arma ${editId?"atualizada":"cadastrada"}!`,"ok");
    fecharModalArma();await carregarArmasInd();atualizarDashboardArmaria();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.salvarArmaGestao=salvarArmaGestao;

export async function excluirArmaInd(id){
  const a=_armasIndCache.find(x=>x._id===id);
  if(!confirm(`Excluir a arma (série ${a?.numeroSerie||id})? Essa ação é definitiva.`))return;
  try{
    await deleteDoc(doc(db,COL_ARMAS_IND,id));
    await registrarAuditoria("Arma excluída",`Série ${a?.numeroSerie||id} — por ${usuarioLogado?.nome||""}`);
    alerta("Arma excluída.","aviso");
    await carregarArmasInd();atualizarDashboardArmaria();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.excluirArmaInd=excluirArmaInd;

export async function acautelarArma(id){
  const a=_armasIndCache.find(x=>x._id===id);if(!a)return;
  const nome=prompt("Nome do servidor responsável:");if(!nome)return;
  const matricula=prompt("Matrícula:")||"";
  const cargo=prompt("Cargo/Função:")||"";
  const qtdCarregadores=Number(prompt("Quantidade de carregadores entregues:","0"))||0;
  const qtdMunicoes=Number(prompt("Quantidade de munições entregues:","0"))||0;
  const responsavel=prompt("Responsável pela entrega:",usuarioLogado?.nome||"")||"";
  const ag=new Date();
  const acautelamento={servidorNome:nome,matricula,cargo,dataEntrega:ag.toISOString().slice(0,10),
    horaEntrega:ag.toTimeString().slice(0,5),qtdCarregadores,qtdMunicoes,responsavelEntrega:responsavel};
  try{
    await updateDoc(doc(db,COL_ARMAS_IND,id),{acautelamento,situacao:"Acautelada",alteradoPor:usuarioLogado?.nome||"",alteradoEm:serverTimestamp()});
    await addDoc(collection(db,COL_ARMAS_HIST),{armaId:id,tipo:"acautelamento",
      detalhes:`Acautelada a ${nome} (Mat: ${matricula}) — ${qtdCarregadores} carregador(es), ${qtdMunicoes} munição(ões)`,
      usuarioNome:usuarioLogado?.nome||"",usuarioEmail:usuarioLogado?.email||"",hora:agora(),criadoEm:serverTimestamp()});
    await registrarAuditoria("Arma acautelada",`${a.numeroSerie} → ${nome} — por ${usuarioLogado?.nome||""}`);
    alerta("Acautelamento registrado!","ok");
    await carregarArmasInd();atualizarDashboardArmaria();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.acautelarArma=acautelarArma;

export async function devolverArma(id){
  const a=_armasIndCache.find(x=>x._id===id);if(!a)return;
  if(!confirm(`Confirmar devolução da arma pelo servidor ${a.acautelamento?.servidorNome||"—"}?`))return;
  const qtdCarregadores=Number(prompt("Quantidade de carregadores devolvidos:",a.acautelamento?.qtdCarregadores??0))||0;
  const qtdMunicoes=Number(prompt("Quantidade de munições devolvidas:",a.acautelamento?.qtdMunicoes??0))||0;
  const responsavel=prompt("Responsável pelo recebimento:",usuarioLogado?.nome||"")||"";
  const ag=new Date();
  const nomeAnterior=a.acautelamento?.servidorNome||"—";
  try{
    await updateDoc(doc(db,COL_ARMAS_IND,id),{
      ultimaDevolucao:{dataDevolucao:ag.toISOString().slice(0,10),horaDevolucao:ag.toTimeString().slice(0,5),
        qtdCarregadoresDevolvidos:qtdCarregadores,qtdMunicoesDevolvidas:qtdMunicoes,responsavelRecebimento:responsavel},
      acautelamento:null,situacao:"Disponível",alteradoPor:usuarioLogado?.nome||"",alteradoEm:serverTimestamp()
    });
    await addDoc(collection(db,COL_ARMAS_HIST),{armaId:id,tipo:"devolucao",
      detalhes:`Devolvida por ${nomeAnterior} — ${qtdCarregadores} carregador(es), ${qtdMunicoes} munição(ões)`,
      usuarioNome:usuarioLogado?.nome||"",usuarioEmail:usuarioLogado?.email||"",hora:agora(),criadoEm:serverTimestamp()});
    await registrarAuditoria("Arma devolvida",`${a.numeroSerie} — por ${usuarioLogado?.nome||""}`);
    alerta("Devolução registrada!","ok");
    await carregarArmasInd();atualizarDashboardArmaria();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.devolverArma=devolverArma;

export async function conferenciaArma(id){
  const a=_armasIndCache.find(x=>x._id===id);if(!a)return;
  const estadoGeral=prompt("Estado geral da arma:","Bom");if(estadoGeral===null)return;
  const funcionamento=confirm("Funcionamento OK? OK = Sim / Cancelar = Não");
  const limpeza=confirm("Limpeza realizada? OK = Sim / Cancelar = Não");
  const numConferida=confirm("Numeração conferida e confere? OK = Sim / Cancelar = Não");
  const carregadoresConferidos=confirm("Carregadores conferidos? OK = Sim / Cancelar = Não");
  const avarias=confirm("Possui avarias? OK = Sim / Cancelar = Não");
  const manutencao=confirm("Necessita manutenção? OK = Sim / Cancelar = Não");
  try{
    await updateDoc(doc(db,COL_ARMAS_IND,id),{
      conferencia:{estadoGeral,funcionamento,limpeza,numConferida,carregadoresConferidos,avarias,manutencao,data:agora()},
      alteradoPor:usuarioLogado?.nome||"",alteradoEm:serverTimestamp()
    });
    await addDoc(collection(db,COL_ARMAS_HIST),{armaId:id,tipo:"conferencia",
      detalhes:`Estado: ${estadoGeral}${avarias?" · Possui avarias":""}${manutencao?" · Necessita manutenção":""}`,
      usuarioNome:usuarioLogado?.nome||"",usuarioEmail:usuarioLogado?.email||"",hora:agora(),criadoEm:serverTimestamp()});
    await registrarAuditoria("Conferência de arma",`${a.numeroSerie} — ${estadoGeral} — por ${usuarioLogado?.nome||""}`);
    alerta("Conferência registrada!","ok");
    await carregarArmasInd();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.conferenciaArma=conferenciaArma;

export async function manutencaoArma(id){
  const a=_armasIndCache.find(x=>x._id===id);if(!a)return;
  const tipo=prompt("Tipo de manutenção:");if(!tipo)return;
  const empresa=prompt("Empresa ou armeiro responsável:")||"";
  const pecas=prompt("Peças substituídas (se houver):")||"";
  const dataEnvio=prompt("Data de envio (AAAA-MM-DD):",new Date().toISOString().slice(0,10))||"";
  try{
    await updateDoc(doc(db,COL_ARMAS_IND,id),{situacao:"Em manutenção",alteradoPor:usuarioLogado?.nome||"",alteradoEm:serverTimestamp()});
    await addDoc(collection(db,COL_ARMAS_HIST),{armaId:id,tipo:"manutencao",
      detalhes:`${tipo} · Empresa/Armeiro: ${empresa} · Envio: ${dataEnvio}${pecas?" · Peças: "+pecas:""}`,
      usuarioNome:usuarioLogado?.nome||"",usuarioEmail:usuarioLogado?.email||"",hora:agora(),criadoEm:serverTimestamp()});
    await registrarAuditoria("Arma enviada para manutenção",`${a.numeroSerie} — ${tipo} — por ${usuarioLogado?.nome||""}`);
    alerta("Manutenção registrada! Situação alterada para 'Em manutenção'.","ok");
    await carregarArmasInd();atualizarDashboardArmaria();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.manutencaoArma=manutencaoArma;

export async function historicoArma(id){
  try{
    const snap=await getDocs(query(collection(db,COL_ARMAS_HIST),where("armaId","==",id)));
    const lista=snap.docs.map(d=>d.data()).sort((a,b)=>(b.hora||"").localeCompare(a.hora||""));
    alert(lista.length?lista.map(h=>`${h.hora} · ${(h.tipo||"").toUpperCase()}\n${h.detalhes||""}\nPor: ${h.usuarioNome||"—"}`).join("\n\n"):"Sem histórico registrado.");
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.historicoArma=historicoArma;

export async function reportarExtravioArma(id){
  const a=_armasIndCache.find(x=>x._id===id);if(!a)return;
  const tipo=prompt("Tipo do fato:\n1) Extravio de arma\n2) Extravio de munição\n3) Divergência de estoque\n4) Dano ao patrimônio\n\nDigite o número da opção:");
  const mapa={"1":"Extravio de Arma","2":"Extravio de Munição","3":"Divergência de Estoque (Armaria)","4":"Dano ao Patrimônio (Arma)"};
  if(!tipo||!mapa[tipo.trim()])return alerta("Operação cancelada.","aviso");
  const desc=prompt("Descreva o ocorrido (obrigatório):");
  if(!desc||!desc.trim())return alerta("Descrição é obrigatória.","erro");
  try{
    const servidorResp=a.acautelamento?.servidorNome||"";
    const num=await criarOcorrenciaAutomatica({
      tipo:mapa[tipo.trim()],local:"Armaria",
      envolvidos:servidorResp,servidor:servidorResp,
      desc:`Arma: ${a.tipo||""} ${a.marca||""} ${a.modelo||""} · Série: ${a.numeroSerie||"—"} · Patr: ${a.patrimonio||"—"}\n\n${desc.trim()}`,
      prioridade:"Alta",origemModulo:"Armaria"
    });
    await addDoc(collection(db,COL_ARMAS_HIST),{armaId:id,tipo:"extravio_dano",
      detalhes:`${mapa[tipo.trim()]} reportado — Ocorrência ${num}`,
      usuarioNome:usuarioLogado?.nome||"",usuarioEmail:usuarioLogado?.email||"",hora:agora(),criadoEm:serverTimestamp()});
    alerta(`Ocorrência ${num} registrada e enviada ao Comando/Corregedoria.`,"ok");
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.reportarExtravioArma=reportarExtravioArma;

export async function carregarColetes(){
  const el=document.getElementById("coletes-lista");
  if(el)el.innerHTML='<p class="hist-vazio">Carregando...</p>';
  try{
    const snap=await getDocs(collection(db,COL_COLETES));
    _coletesCache=snap.docs.map(d=>({...d.data(),_id:d.id}))
      .sort((a,b)=>(b.criadoEmTxt||"").localeCompare(a.criadoEmTxt||""));
  }catch(e){_coletesCache=[];}
  renderColetes();
}

export function renderColetes(){
  const q=(v("colete-filtro")||"").toLowerCase();
  let lista=_coletesCache;
  if(q)lista=lista.filter(c=>c.patrimonio?.toLowerCase().includes(q)||c.numeroSerie?.toLowerCase().includes(q)||c.distribuicaoAtual?.servidorNome?.toLowerCase().includes(q));
  const el=document.getElementById("coletes-lista");
  const cnt=document.getElementById("colete-contador");
  if(cnt)cnt.textContent=lista.length?`${lista.length} colete(s) cadastrado(s)`:"";
  if(!el)return;
  el.innerHTML=lista.length?lista.map(c=>{
    const al=alertaVencimento(c.dataValidade);
    const emUso=c.distribuicaoAtual&&c.distribuicaoAtual.servidorNome;
    return`<div class="hist-item">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <div class="hist-tipo" style="margin:0"><span class="ic-img ic-coletes"></span> Patr. ${c.patrimonio||"—"} · ${c.marca||""} ${c.modelo||""}</div>
        ${al?`<span style="font-size:.62rem;color:${al.cor};font-family:Oswald">${al.texto}</span>`:""}
      </div>
      <div class="hist-data">Nível: ${c.nivelProtecao||"—"} · Tam: ${c.tamanho||"—"} · <strong>${c.situacao||"—"}</strong></div>
      <div class="hist-corpo">${emUso?`Em uso por: <strong>${c.distribuicaoAtual.servidorNome}</strong> (Mat: ${c.distribuicaoAtual.servidorMatricula||"—"})\nEntrega: ${c.distribuicaoAtual.dataEntrega||""} ${c.distribuicaoAtual.horaEntrega||""}`:"Sem servidor responsável no momento."}${c.dataValidade?`\nValidade: ${c.dataValidade}`:""}${c.obs?"\n"+c.obs:""}</div>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
        <button class="btn btn-sm btn-cinza" onclick="abrirModalColete('${c._id}')">✏️ Editar</button>
        ${!emUso?`<button class="btn btn-sm" style="background:rgba(125,206,160,.2);border-color:#7dcea0;color:#7dcea0;font-size:.65rem" onclick="entregarColete('${c._id}')">📤 Entregar</button>`
                :`<button class="btn btn-sm" style="background:rgba(251,191,36,.2);border-color:#fbbf24;color:#fbbf24;font-size:.65rem" onclick="devolverColete('${c._id}')">↩️ Devolver</button>`}
        <button class="btn btn-sm" style="background:rgba(96,165,250,.2);border-color:#60a5fa;color:#60a5fa;font-size:.65rem" onclick="conferenciaColete('${c._id}')">🔍 Conferência</button>
        <button class="btn btn-sm" style="background:rgba(201,168,76,.2);border-color:var(--dourado);color:var(--dourado);font-size:.65rem" onclick="historicoColete('${c._id}')">🕐 Histórico</button>
        <button class="btn btn-sm btn-perigo" style="background:rgba(248,113,113,.25)" onclick="reportarExtravioColete('${c._id}')">🚨 Extravio/Dano</button>
        <button class="btn btn-sm btn-perigo" onclick="excluirColete('${c._id}')">🗑</button>
      </div>
    </div>`;
  }).join(""):'<p class="hist-vazio">Nenhum colete cadastrado.</p>';
}
window.renderColetes=renderColetes;

export function selecionarFotoColete(input){
  const file=input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    _coleteFotoBase64=e.target.result;
    const img=document.getElementById("colete-foto-preview");
    img.src=_coleteFotoBase64;img.style.display="block";
  };
  reader.readAsDataURL(file);
}
window.selecionarFotoColete=selecionarFotoColete;

export function abrirModalColete(id=null){
  document.getElementById("colete-edit-id").value=id||"";
  _coleteFotoBase64=null;
  document.getElementById("colete-foto-preview").style.display="none";
  document.getElementById("colete-foto-preview").src="";
  if(id){
    const c=_coletesCache.find(x=>x._id===id);if(!c)return;
    document.getElementById("modal-colete-titulo").textContent="Editar Colete";
    document.getElementById("colete-patrimonio").value=c.patrimonio||"";
    document.getElementById("colete-serie").value=c.numeroSerie||"";
    document.getElementById("colete-marca").value=c.marca||"";
    document.getElementById("colete-modelo").value=c.modelo||"";
    document.getElementById("colete-nivel").value=c.nivelProtecao||"IIIA";
    document.getElementById("colete-tamanho").value=c.tamanho||"M";
    document.getElementById("colete-cor").value=c.cor||"";
    document.getElementById("colete-fabricacao").value=c.dataFabricacao||"";
    document.getElementById("colete-aquisicao").value=c.dataAquisicao||"";
    document.getElementById("colete-validade").value=c.dataValidade||"";
    document.getElementById("colete-valor").value=c.valorAquisicao||"";
    document.getElementById("colete-fornecedor").value=c.fornecedor||"";
    document.getElementById("colete-situacao").value=c.situacao||"Novo";
    document.getElementById("colete-obs").value=c.obs||"";
    if(c.foto){_coleteFotoBase64=c.foto;document.getElementById("colete-foto-preview").src=c.foto;document.getElementById("colete-foto-preview").style.display="block";}
  }else{
    document.getElementById("modal-colete-titulo").textContent="Novo Colete";
    ["colete-patrimonio","colete-serie","colete-marca","colete-modelo","colete-cor","colete-fabricacao","colete-aquisicao","colete-validade","colete-valor","colete-fornecedor","colete-obs"]
      .forEach(i=>document.getElementById(i).value="");
    document.getElementById("colete-nivel").value="IIIA";
    document.getElementById("colete-tamanho").value="M";
    document.getElementById("colete-situacao").value="Novo";
  }
  document.getElementById("modal-colete").classList.add("aberto");
}
window.abrirModalColete=abrirModalColete;

export function fecharModalColete(){document.getElementById("modal-colete").classList.remove("aberto");}
window.fecharModalColete=fecharModalColete;

export async function salvarColete(){
  const editId=v("colete-edit-id");
  const patrimonio=v("colete-patrimonio");
  if(!patrimonio)return alerta("Preencha o número de patrimônio.","erro");
  const dados={
    patrimonio,numeroSerie:v("colete-serie"),marca:v("colete-marca"),modelo:v("colete-modelo"),
    nivelProtecao:v("colete-nivel"),tamanho:v("colete-tamanho"),cor:v("colete-cor"),
    dataFabricacao:v("colete-fabricacao"),dataAquisicao:v("colete-aquisicao"),dataValidade:v("colete-validade"),
    valorAquisicao:v("colete-valor"),fornecedor:v("colete-fornecedor"),situacao:v("colete-situacao"),
    obs:v("colete-obs")
  };
  if(_coleteFotoBase64)dados.foto=_coleteFotoBase64;
  try{
    if(editId){
      await updateDoc(doc(db,COL_COLETES,editId),{...dados,alteradoPor:usuarioLogado?.nome||"",alteradoPorEmail:usuarioLogado?.email||"",alteradoEm:serverTimestamp()});
      await addDoc(collection(db,COL_COLETES_HIST),{coleteId:editId,tipo:"edicao",detalhes:"Dados do colete atualizados",usuarioNome:usuarioLogado?.nome||"",usuarioEmail:usuarioLogado?.email||"",hora:agora(),criadoEm:serverTimestamp()});
      await registrarAuditoria("Colete editado",`Patrimônio ${patrimonio} — por ${usuarioLogado?.nome||""}`);
    }else{
      dados.criadoPor=usuarioLogado?.nome||"";dados.criadoPorEmail=usuarioLogado?.email||"";
      dados.criadoEm=serverTimestamp();dados.criadoEmTxt=agora();
      const novo=await addDoc(collection(db,COL_COLETES),dados);
      await addDoc(collection(db,COL_COLETES_HIST),{coleteId:novo.id,tipo:"cadastro",detalhes:"Colete cadastrado",usuarioNome:usuarioLogado?.nome||"",usuarioEmail:usuarioLogado?.email||"",hora:agora(),criadoEm:serverTimestamp()});
      await registrarAuditoria("Colete cadastrado",`Patrimônio ${patrimonio} — por ${usuarioLogado?.nome||""}`);
    }
    alerta(`Colete ${editId?"atualizado":"cadastrado"}!`,"ok");
    fecharModalColete();await carregarColetes();atualizarDashboardArmaria();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.salvarColete=salvarColete;

export async function excluirColete(id){
  const c=_coletesCache.find(x=>x._id===id);
  if(!confirm(`Excluir o colete (patrimônio ${c?.patrimonio||id})? Essa ação é definitiva.`))return;
  try{
    await deleteDoc(doc(db,COL_COLETES,id));
    await registrarAuditoria("Colete excluído",`Patrimônio ${c?.patrimonio||id} — por ${usuarioLogado?.nome||""}`);
    alerta("Colete excluído.","aviso");
    await carregarColetes();atualizarDashboardArmaria();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.excluirColete=excluirColete;

export async function entregarColete(id){
  const c=_coletesCache.find(x=>x._id===id);if(!c)return;
  const nome=prompt("Nome do servidor que vai receber o colete:");if(!nome)return;
  const matricula=prompt("Matrícula do servidor:")||"";
  const responsavel=prompt("Responsável pela entrega:",usuarioLogado?.nome||"")||"";
  const ag=new Date();
  const distribuicaoAtual={servidorNome:nome,servidorMatricula:matricula,
    dataEntrega:ag.toISOString().slice(0,10),horaEntrega:ag.toTimeString().slice(0,5),responsavelEntrega:responsavel};
  try{
    await updateDoc(doc(db,COL_COLETES,id),{distribuicaoAtual,situacao:"Em uso",alteradoPor:usuarioLogado?.nome||"",alteradoEm:serverTimestamp()});
    await addDoc(collection(db,COL_COLETES_HIST),{coleteId:id,tipo:"entrega",detalhes:`Entregue a ${nome} (Mat: ${matricula})`,
      usuarioNome:usuarioLogado?.nome||"",usuarioEmail:usuarioLogado?.email||"",hora:agora(),criadoEm:serverTimestamp()});
    await registrarAuditoria("Colete entregue",`Patrimônio ${c.patrimonio} → ${nome} — por ${usuarioLogado?.nome||""}`);
    alerta("Entrega registrada!","ok");
    await carregarColetes();atualizarDashboardArmaria();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.entregarColete=entregarColete;

export async function devolverColete(id){
  const c=_coletesCache.find(x=>x._id===id);if(!c)return;
  if(!confirm(`Confirmar devolução do colete pelo servidor ${c.distribuicaoAtual?.servidorNome||"—"}?`))return;
  const responsavel=prompt("Responsável pelo recebimento:",usuarioLogado?.nome||"")||"";
  const nomeAnterior=c.distribuicaoAtual?.servidorNome||"—";
  try{
    await updateDoc(doc(db,COL_COLETES,id),{distribuicaoAtual:null,situacao:"Reserva",alteradoPor:usuarioLogado?.nome||"",alteradoEm:serverTimestamp()});
    await addDoc(collection(db,COL_COLETES_HIST),{coleteId:id,tipo:"devolucao",detalhes:`Devolvido por ${nomeAnterior} — recebido por ${responsavel}`,
      usuarioNome:usuarioLogado?.nome||"",usuarioEmail:usuarioLogado?.email||"",hora:agora(),criadoEm:serverTimestamp()});
    await registrarAuditoria("Colete devolvido",`Patrimônio ${c.patrimonio} — por ${usuarioLogado?.nome||""}`);
    alerta("Devolução registrada!","ok");
    await carregarColetes();atualizarDashboardArmaria();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.devolverColete=devolverColete;

export async function conferenciaColete(id){
  const c=_coletesCache.find(x=>x._id===id);if(!c)return;
  const estado=prompt("Estado de conservação (Excelente/Bom/Regular/Ruim/Inutilizável):","Bom");
  if(estado===null)return;
  const rasgos=confirm("Possui rasgos? OK = Sim / Cancelar = Não");
  const perfuracoes=confirm("Possui perfurações? OK = Sim / Cancelar = Não");
  const desgaste=confirm("Possui desgaste nas costuras? OK = Sim / Cancelar = Não");
  const capaDanificada=confirm("Capa danificada? OK = Sim / Cancelar = Não");
  const painelIntegro=confirm("Painel balístico íntegro? OK = Sim / Cancelar = Não");
  const necessitaManutencao=confirm("Necessita manutenção? OK = Sim / Cancelar = Não");
  const necessitaSubstituicao=confirm("Necessita substituição? OK = Sim / Cancelar = Não");
  try{
    await updateDoc(doc(db,COL_COLETES,id),{
      conservacao:{estado,rasgos,perfuracoes,desgaste,capaDanificada,painelIntegro,necessitaManutencao,necessitaSubstituicao,data:agora()},
      alteradoPor:usuarioLogado?.nome||"",alteradoEm:serverTimestamp()
    });
    await addDoc(collection(db,COL_COLETES_HIST),{coleteId:id,tipo:"inspecao",
      detalhes:`Estado: ${estado}${necessitaSubstituicao?" · NECESSITA SUBSTITUIÇÃO":""}${necessitaManutencao?" · Necessita manutenção":""}`,
      usuarioNome:usuarioLogado?.nome||"",usuarioEmail:usuarioLogado?.email||"",hora:agora(),criadoEm:serverTimestamp()});
    await registrarAuditoria("Conferência de colete",`Patrimônio ${c.patrimonio} — ${estado} — por ${usuarioLogado?.nome||""}`);
    alerta("Conferência registrada!","ok");
    await carregarColetes();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.conferenciaColete=conferenciaColete;

export async function historicoColete(id){
  try{
    const snap=await getDocs(query(collection(db,COL_COLETES_HIST),where("coleteId","==",id)));
    const lista=snap.docs.map(d=>d.data()).sort((a,b)=>(b.hora||"").localeCompare(a.hora||""));
    alert(lista.length?lista.map(h=>`${h.hora} · ${(h.tipo||"").toUpperCase()}\n${h.detalhes||""}\nPor: ${h.usuarioNome||"—"}`).join("\n\n"):"Sem histórico registrado.");
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.historicoColete=historicoColete;

export async function reportarExtravioColete(id){
  const c=_coletesCache.find(x=>x._id===id);if(!c)return;
  const tipo=prompt("Tipo do fato:\n1) Extraviado\n2) Danificado\n3) Não devolvido\n\nDigite o número da opção:");
  const mapa={"1":"Extravio de Colete","2":"Dano ao Colete","3":"Colete Não Devolvido"};
  if(!tipo||!mapa[tipo.trim()])return alerta("Operação cancelada.","aviso");
  const desc=prompt("Descreva o ocorrido (obrigatório):");
  if(!desc||!desc.trim())return alerta("Descrição é obrigatória.","erro");
  try{
    const servidorResp=c.distribuicaoAtual?.servidorNome||"";
    const num=await criarOcorrenciaAutomatica({
      tipo:mapa[tipo.trim()],local:"Armaria",
      envolvidos:servidorResp,servidor:servidorResp,
      desc:`Colete — Patr: ${c.patrimonio||"—"} · Série: ${c.numeroSerie||"—"}\n\n${desc.trim()}`,
      prioridade:"Alta",origemModulo:"Armaria"
    });
    await addDoc(collection(db,COL_COLETES_HIST),{coleteId:id,tipo:"extravio_dano",
      detalhes:`${mapa[tipo.trim()]} reportado — Ocorrência ${num}`,
      usuarioNome:usuarioLogado?.nome||"",usuarioEmail:usuarioLogado?.email||"",hora:agora(),criadoEm:serverTimestamp()});
    alerta(`Ocorrência ${num} registrada e enviada ao Comando/Corregedoria.`,"ok");
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.reportarExtravioColete=reportarExtravioColete;

export async function atualizarDashboardArmaria(){
  const el=document.getElementById("armaria-dashboard");
  if(!el)return;
  try{
    let armas=_armasIndCache,coletes=_coletesCache;
    if(!armas.length){try{armas=(await getDocs(collection(db,COL_ARMAS_IND))).docs.map(d=>d.data());}catch(e){armas=[];}}
    if(!coletes.length){try{coletes=(await getDocs(collection(db,COL_COLETES))).docs.map(d=>d.data());}catch(e){coletes=[];}}
    const totalArmas=armas.length;
    const disponiveis=armas.filter(a=>a.situacao==="Disponível").length;
    const acauteladas=armas.filter(a=>a.situacao==="Acautelada").length;
    const manutencaoQ=armas.filter(a=>a.situacao==="Em manutenção").length;
    const baixadas=armas.filter(a=>a.situacao==="Baixada"||a.situacao==="Apreendida").length;
    const totalColetes=coletes.length;
    const coletesVencidos=coletes.filter(c=>{const d=diasParaVencer(c.dataValidade);return d!==null&&d<0;}).length;
    const coletesEmUso=coletes.filter(c=>c.distribuicaoAtual&&c.distribuicaoAtual.servidorNome).length;
    const municoesTotal=(await carregarMunicoesCache()).reduce((s,m)=>s+(Number(m.qtd)||0),0);
    el.innerHTML=`
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="dash-card dash-azul"><div class="dash-num">${totalArmas}</div><div class="dash-label"><span class="ic-img ic-arma"></span> Armas</div></div>
        <div class="dash-card dash-verde"><div class="dash-num">${disponiveis}</div><div class="dash-label">Disponíveis</div></div>
        <div class="dash-card dash-laranja"><div class="dash-num">${acauteladas}</div><div class="dash-label">Acauteladas</div></div>
        <div class="dash-card dash-roxo"><div class="dash-num">${manutencaoQ}</div><div class="dash-label">Em Manutenção</div></div>
        <div class="dash-card dash-vermelho"><div class="dash-num">${baixadas}</div><div class="dash-label">Baixadas/Apreendidas</div></div>
        <div class="dash-card dash-azul"><div class="dash-num">${totalColetes}</div><div class="dash-label"><span class="ic-img ic-coletes"></span> Coletes</div></div>
        <div class="dash-card dash-laranja"><div class="dash-num">${coletesEmUso}</div><div class="dash-label">Coletes em Uso</div></div>
        <div class="dash-card dash-vermelho"><div class="dash-num">${coletesVencidos}</div><div class="dash-label">Coletes Vencidos</div></div>
        <div class="dash-card dash-verde" style="grid-column:1/-1"><div class="dash-num">${municoesTotal}</div><div class="dash-label"><span class="ic-img ic-municoes"></span> Munições em Estoque</div></div>
      </div>`;
  }catch(e){el.innerHTML='<p class="hist-vazio">Erro ao carregar indicadores.</p>';}
}
window.atualizarDashboardArmaria=atualizarDashboardArmaria;

export function abrirModalMunicao(id=null){
  document.getElementById("mun-edit-id").value=id||"";
  if(id){
    const m=_municoesCache.find(x=>x.id===id);if(!m)return;
    document.getElementById("modal-mun-titulo").textContent="Editar Munição";
    document.getElementById("mun-nome").value=m.nome||"";
    document.getElementById("mun-calibre").value=m.calibre||"";
    document.getElementById("mun-qtd").value=m.qtd||0;
    document.getElementById("mun-min").value=m.min||0;
    document.getElementById("mun-local").value=m.local||"";
    document.getElementById("mun-obs").value=m.obs||"";
  }else{
    document.getElementById("modal-mun-titulo").textContent="Nova Munição";
    ["mun-nome","mun-calibre","mun-local","mun-obs"].forEach(i=>document.getElementById(i).value="");
    document.getElementById("mun-qtd").value=0;document.getElementById("mun-min").value=0;
  }
  document.getElementById("modal-municao").classList.add("aberto");
}
window.abrirModalMunicao=abrirModalMunicao;

export function fecharModalMunicao(){document.getElementById("modal-municao").classList.remove("aberto");}
window.fecharModalMunicao=fecharModalMunicao;

export async function salvarMunicaoGestao(){
  const editId=v("mun-edit-id");
  const dados={nome:v("mun-nome"),calibre:v("mun-calibre"),
    qtd:Number(v("mun-qtd")||0),min:Number(v("mun-min")||0),
    local:v("mun-local"),obs:v("mun-obs")};
  if(!dados.nome)return alerta("Preencha o nome.","erro");
  try{
    if(editId){
      await updateDoc(doc(db,COL_MUNICOES,editId),dados);
      await registrarMovMunicao(editId,"edicao",`Item editado: ${dados.nome}`);
    }else{
      const ref=await addDoc(collection(db,COL_MUNICOES),{...dados,criadoPor:usuarioLogado?.nome||"",criadoEm:serverTimestamp()});
      await registrarMovMunicao(ref.id,"cadastro",`Item cadastrado: ${dados.nome} (qtd inicial: ${dados.qtd})`);
    }
    await registrarAuditoria(`Munição ${editId?"editada":"cadastrada"}: ${dados.nome}`,`Qtd: ${dados.qtd}`);
    alerta(`Munição ${editId?"atualizada":"cadastrada"}!`,"ok");
    fecharModalMunicao();await renderMunicoes();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.salvarMunicaoGestao=salvarMunicaoGestao;

export async function renderMunicoes(){
  const q=(v("municao-filtro")||"").toLowerCase();
  const el=document.getElementById("municoes-lista");
  el.innerHTML='<p class="hist-vazio">Carregando...</p>';
  await carregarMunicoesCache();
  let lista=_municoesCache;
  if(q)lista=lista.filter(m=>m.nome?.toLowerCase().includes(q)||m.calibre?.toLowerCase().includes(q));
  const cnt=document.getElementById("municao-contador");
  cnt.textContent=lista.length?`${lista.length} item(ns)`:"";
  el.innerHTML=lista.length?lista.map(m=>{
    const baixo=m.qtd<=m.min&&m.min>0;
    return`<div class="hist-item ${baixo?"estoque-baixo":""}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <div class="hist-tipo" style="margin:0"><span class="ic-img ic-municoes"></span> ${m.nome}</div>
        ${baixo?'<span style="font-size:.62rem;color:#f87171;font-family:Oswald">⚠️ ESTOQUE BAIXO</span>':""}
      </div>
      <div class="hist-data">Cal: ${m.calibre||"—"} · Local: ${m.local||"—"}</div>
      <div class="hist-corpo">Qtd: <strong>${m.qtd}</strong> · Mínimo: ${m.min}${m.obs?"\n"+m.obs:""}</div>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
        <button class="btn btn-sm btn-cinza" onclick="abrirModalMunicao('${m.id}')">✏️ Editar</button>
        <button class="btn btn-sm" style="background:rgba(201,168,76,.2);border-color:var(--dourado);color:var(--dourado);font-size:.65rem" onclick="movMunicao('${m.id}')">📦 Entrada/Saída</button>
        <button class="btn btn-sm" style="background:rgba(125,206,160,.2);border-color:#7dcea0;color:#7dcea0;font-size:.65rem" onclick="acautelarMunicao('${m.id}')">📤 Acautelar</button>
        <button class="btn btn-sm" style="background:rgba(96,165,250,.2);border-color:#60a5fa;color:#60a5fa;font-size:.65rem" onclick="devolverMunicao('${m.id}')">↩️ Devolver</button>
        <button class="btn btn-sm" style="background:rgba(201,168,76,.15);border-color:var(--dourado);color:var(--dourado);font-size:.65rem" onclick="historicoMunicao('${m.id}')">🕐 Histórico</button>
        <button class="btn btn-sm btn-perigo" onclick="excluirMunicao('${m.id}')">🗑 Excluir</button>
      </div>
    </div>`;}).join(""):'<p class="hist-vazio">Nenhuma munição cadastrada.</p>';
}
window.renderMunicoes=renderMunicoes;

export async function excluirMunicao(id){
  if(!confirm("Excluir?"))return;
  try{
    const m=_municoesCache.find(x=>x.id===id);
    await deleteDoc(doc(db,COL_MUNICOES,id));
    await registrarAuditoria(`Munição excluída: ${m?.nome||id}`,"");
    alerta("Excluída.","aviso");await renderMunicoes();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.excluirMunicao=excluirMunicao;

export async function movMunicao(id){
  const m=_municoesCache.find(x=>x.id===id);if(!m)return;
  const qtd=Number(prompt(`${m.nome} — Qtd atual: ${m.qtd}\nDigite +N para entrada ou -N para saída:`));
  if(!qtd)return;
  const novaQtd=Math.max(0,m.qtd+qtd);
  try{
    await updateDoc(doc(db,COL_MUNICOES,id),{qtd:novaQtd});
    await registrarMovMunicao(id,qtd>0?"entrada":"saida",`${m.nome}: ${qtd>0?"+":""}${qtd} (novo saldo: ${novaQtd})`);
    await registrarAuditoria(`Movimentação munição: ${m.nome}`,`${qtd>0?"+":""}${qtd}`);
    alerta(`Nova qtd: ${novaQtd}`,"ok");await renderMunicoes();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.movMunicao=movMunicao;

export async function acautelarMunicao(id){
  const m=_municoesCache.find(x=>x.id===id);if(!m)return;
  const nome=prompt("Nome do servidor que vai receber a munição:");
  if(!nome||!nome.trim())return;
  const qtd=Number(prompt(`Quantidade a acautelar (estoque atual: ${m.qtd}):`));
  if(!qtd||qtd<=0)return alerta("Quantidade inválida.","erro");
  if(qtd>m.qtd)return alerta(`Estoque insuficiente. Disponível: ${m.qtd}.`,"erro");
  try{
    const novaQtd=m.qtd-qtd;
    await updateDoc(doc(db,COL_MUNICOES,id),{qtd:novaQtd});
    await registrarMovMunicao(id,"acautelamento",`${qtd} un. de ${m.nome} acauteladas para ${nome.trim()} (saldo: ${novaQtd})`,
      {servidorNome:nome.trim(),qtdMovimentada:qtd});
    await registrarAuditoria(`Munição acautelada`,`${m.nome} · ${qtd} un. · Servidor: ${nome.trim()}`);
    alerta(`${qtd} un. acauteladas para ${nome.trim()}.`,"ok");
    await renderMunicoes();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.acautelarMunicao=acautelarMunicao;

export async function devolverMunicao(id){
  const m=_municoesCache.find(x=>x.id===id);if(!m)return;
  const nome=prompt("Nome do servidor que está devolvendo:");
  if(!nome||!nome.trim())return;
  const qtd=Number(prompt("Quantidade devolvida:"));
  if(!qtd||qtd<=0)return alerta("Quantidade inválida.","erro");
  try{
    const novaQtd=m.qtd+qtd;
    await updateDoc(doc(db,COL_MUNICOES,id),{qtd:novaQtd});
    await registrarMovMunicao(id,"devolucao",`${qtd} un. de ${m.nome} devolvidas por ${nome.trim()} (saldo: ${novaQtd})`,
      {servidorNome:nome.trim(),qtdMovimentada:qtd});
    await registrarAuditoria(`Munição devolvida`,`${m.nome} · ${qtd} un. · Servidor: ${nome.trim()}`);
    alerta(`${qtd} un. devolvidas. Novo saldo: ${novaQtd}.`,"ok");
    await renderMunicoes();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.devolverMunicao=devolverMunicao;

export async function historicoMunicao(id){
  try{
    const snap=await getDocs(query(collection(db,COL_MUNICOES_HIST),where("municaoId","==",id)));
    const lista=snap.docs.map(d=>d.data()).sort((a,b)=>(b.hora||"").localeCompare(a.hora||""));
    alert(lista.length?lista.map(h=>`${h.hora} · ${(h.tipo||"").toUpperCase()}\n${h.detalhes||""}\nPor: ${h.usuarioNome||"—"}`).join("\n\n"):"Sem histórico registrado.");
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.historicoMunicao=historicoMunicao;

