import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { diasParaVencer } from "./armaria.js";
import { COLECOES_RESTAURAVEIS, COL_BH, COL_CHAMADOS, COL_DISPOSITIVOS, COL_LOG, COL_PATRIMONIO, COL_PATRIMONIO_HIST, COL_PATRIMONIO_INV, COL_PERMUTAS, COL_PLANTAO, COL_SISTEMA_CONFIG, COL_USUARIOS, _bensCache, _inventarioConferidos, agora, alerta, db, esc, filtrarAuditoria, ir, registrarAuditoria, usuarioLogado, v } from "./core.js";
import { criarOcorrenciaAutomatica } from "./ocorrencias.js";

export async function carregarDashboardPatrimonio(){
  document.getElementById("pat-data").textContent=`📅 ${agora()}`;
  try{
    const snap=await getDocs(collection(db,COL_PATRIMONIO));
    _bensCache=snap.docs.map(d=>({_id:d.id,...d.data()}));
  }catch(e){_bensCache=[];}

  const total=_bensCache.reduce((acc,b)=>acc+(Number(b.qtd)||1),0);
  const emUso=_bensCache.filter(b=>b.situacao==="Em uso").reduce((acc,b)=>acc+(Number(b.qtd)||1),0);
  const manutencao=_bensCache.filter(b=>b.situacao==="Em manutenção").reduce((acc,b)=>acc+(Number(b.qtd)||1),0);
  const baixados=_bensCache.filter(b=>b.situacao==="Baixado").reduce((acc,b)=>acc+(Number(b.qtd)||1),0);
  const valorTotal=_bensCache.reduce((acc,b)=>acc+((Number(b.valor)||0)*(Number(b.qtd)||1)),0);

  document.getElementById("pat-total").textContent=total;
  document.getElementById("pat-uso").textContent=emUso;
  document.getElementById("pat-manutencao").textContent=manutencao;
  document.getElementById("pat-baixados").textContent=baixados;
  document.getElementById("pat-valor").textContent=valorTotal.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});

  const alertas=[];
  _bensCache.forEach(b=>{
    if(b.situacao==="Baixado"||b.situacao==="Extraviado")return;
    if(b.garantia&&b.aquisicao){
      const venc=new Date(b.aquisicao+"T00:00:00");
      venc.setMonth(venc.getMonth()+Number(b.garantia));
      const d=Math.round((venc-new Date())/86400000);
      if(d<0)alertas.push({nivel:"critico",texto:`Garantia vencida — <strong>${b.descricao||b.patrimonio}</strong> (patr. ${b.patrimonio||"—"})`});
      else if(d<=30)alertas.push({nivel:"importante",texto:`Garantia vence em ${d} dia(s) — <strong>${b.descricao||b.patrimonio}</strong> (patr. ${b.patrimonio||"—"})`});
    }
  });
  const emManutHaMuito=_bensCache.filter(b=>b.situacao==="Em manutenção");
  if(emManutHaMuito.length)alertas.push({nivel:"importante",texto:`${emManutHaMuito.length} bem(ns) em manutenção — acompanhe o retorno.`});

  const el=document.getElementById("pat-alertas");
  const icone={critico:"🔴",importante:"🟡"};
  el.innerHTML=alertas.length?alertas.map(a=>`<div class="sit-alerta ${a.nivel}">${icone[a.nivel]} ${esc(a.texto)}</div>`).join("")
    :'<div class="sit-alerta info">🟢 Nenhum alerta no momento.</div>';
}
window.carregarDashboardPatrimonio=carregarDashboardPatrimonio;

export function abrirModalBem(id=null){
  document.getElementById("bem-edit-id").value=id||"";
  if(id){
    const b=_bensCache.find(x=>x._id===id);if(!b)return;
    document.getElementById("modal-bem-titulo").textContent="Editar Bem";
    document.getElementById("bem-patrimonio").value=b.patrimonio||"";
    document.getElementById("bem-categoria").value=b.categoria||"Outros";
    document.getElementById("bem-descricao").value=b.descricao||"";
    document.getElementById("bem-marca").value=b.marca||"";
    document.getElementById("bem-modelo").value=b.modelo||"";
    document.getElementById("bem-serie").value=b.numeroSerie||"";
    document.getElementById("bem-qtd").value=b.qtd||1;
    document.getElementById("bem-valor").value=b.valor||"";
    document.getElementById("bem-aquisicao").value=b.aquisicao||"";
    document.getElementById("bem-fornecedor").value=b.fornecedor||"";
    document.getElementById("bem-garantia").value=b.garantia||"";
    document.getElementById("bem-localizacao").value=b.localizacao||"Quartel";
    document.getElementById("bem-situacao").value=b.situacao||"Em estoque";
    document.getElementById("bem-obs").value=b.obs||"";
  }else{
    document.getElementById("modal-bem-titulo").textContent="Novo Bem";
    ["bem-patrimonio","bem-descricao","bem-marca","bem-modelo","bem-serie","bem-valor","bem-aquisicao","bem-fornecedor","bem-garantia","bem-obs"]
      .forEach(i=>document.getElementById(i).value="");
    document.getElementById("bem-qtd").value=1;
    document.getElementById("bem-categoria").value="Outros";
    document.getElementById("bem-localizacao").value="Quartel";
    document.getElementById("bem-situacao").value="Em estoque";
  }
  document.getElementById("modal-bem").classList.add("aberto");
}
window.abrirModalBem=abrirModalBem;

export function fecharModalBem(){document.getElementById("modal-bem").classList.remove("aberto");}
window.fecharModalBem=fecharModalBem;

export async function salvarBem(){
  const id=v("bem-edit-id");
  const dados={
    patrimonio:v("bem-patrimonio"),categoria:v("bem-categoria"),descricao:v("bem-descricao"),
    marca:v("bem-marca"),modelo:v("bem-modelo"),numeroSerie:v("bem-serie"),
    qtd:Number(v("bem-qtd"))||1,valor:Number(v("bem-valor"))||0,aquisicao:v("bem-aquisicao"),
    fornecedor:v("bem-fornecedor"),garantia:Number(v("bem-garantia"))||0,
    localizacao:v("bem-localizacao"),situacao:v("bem-situacao"),obs:v("bem-obs")
  };
  if(!dados.descricao)return alerta("Informe a descrição do bem.","erro");
  try{
    if(id){
      await updateDoc(doc(db,COL_PATRIMONIO,id),dados);
      await registrarAuditoria("Bem patrimonial atualizado",`${dados.descricao} (Patr: ${dados.patrimonio||"—"})`);
    }else{
      const ref=await addDoc(collection(db,COL_PATRIMONIO),{...dados,criadoPor:usuarioLogado?.nome||"",criadoEm:serverTimestamp()});
      await addDoc(collection(db,COL_PATRIMONIO_HIST),{bemId:ref.id,tipo:"entrada",
        detalhes:`Bem cadastrado: ${dados.descricao} (Patr: ${dados.patrimonio||"—"})`,
        usuarioNome:usuarioLogado?.nome||"",hora:agora(),criadoEm:serverTimestamp()});
      await registrarAuditoria("Bem patrimonial cadastrado",`${dados.descricao} (Patr: ${dados.patrimonio||"—"})`);
    }
    fecharModalBem();
    await carregarDashboardPatrimonio();
    renderBens();
    alerta("Bem salvo com sucesso!","ok");
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.salvarBem=salvarBem;

export async function excluirBem(id){
  if(!confirm("Excluir este bem permanentemente? Esta ação não pode ser desfeita."))return;
  try{
    await deleteDoc(doc(db,COL_PATRIMONIO,id));
    await registrarAuditoria("Bem patrimonial excluído",`ID: ${id}`);
    await carregarDashboardPatrimonio();
    renderBens();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.excluirBem=excluirBem;

export function renderBens(){
  const q=(v("bem-filtro")||"").toLowerCase();
  const catF=v("bem-filtro-categoria"),sitF=v("bem-filtro-situacao");
  let lista=_bensCache;
  if(q)lista=lista.filter(b=>b.descricao?.toLowerCase().includes(q)||b.patrimonio?.toLowerCase().includes(q)||b.numeroSerie?.toLowerCase().includes(q));
  if(catF)lista=lista.filter(b=>b.categoria===catF);
  if(sitF)lista=lista.filter(b=>b.situacao===sitF);
  const el=document.getElementById("bens-lista");
  const cnt=document.getElementById("bem-contador");
  if(cnt)cnt.textContent=lista.length?`${lista.length} bem(ns) encontrado(s)`:"";
  if(!el)return;
  const corSituacao={"Em uso":"#7dcea0","Em estoque":"#60a5fa","Em manutenção":"#fbbf24","Baixado":"#f1948a","Extraviado":"#f87171"};
  el.innerHTML=lista.length?lista.map(b=>`
    <div class="hist-item">
      <div class="hist-tipo" style="margin:0">${esc(b.categoria)} ${esc(b.descricao)}</div>
      <div class="hist-data">Patr: ${esc(b.patrimonio)||"—"} · Série: ${esc(b.numeroSerie)||"—"} · Qtd: ${b.qtd||1} · <strong style="color:${corSituacao[b.situacao]||"#fff"}">${esc(b.situacao)||"—"}</strong></div>
      <div class="hist-corpo">Local: ${esc(b.localizacao)||"—"}${b.responsavel?` · Responsável: <strong>${esc(b.responsavel)}</strong>`:""}${b.valor?` · Valor: R$ ${Number(b.valor).toLocaleString("pt-BR")}`:""}${b.obs?"\n"+esc(b.obs):""}</div>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
        <button class="btn btn-sm btn-cinza" onclick="abrirModalBem('${b._id}')">✏️ Editar</button>
        ${!b.responsavel?`<button class="btn btn-sm" style="background:rgba(125,206,160,.2);border-color:#7dcea0;color:#7dcea0;font-size:.65rem" onclick="responsabilizarBem('${b._id}')">📤 Atribuir</button>`
                        :`<button class="btn btn-sm" style="background:rgba(251,191,36,.2);border-color:#fbbf24;color:#fbbf24;font-size:.65rem" onclick="devolverBem('${b._id}')">↩️ Devolver</button>`}
        <button class="btn btn-sm" style="background:rgba(96,165,250,.2);border-color:#60a5fa;color:#60a5fa;font-size:.65rem" onclick="transferirBem('${b._id}')">🔁 Transferir</button>
        ${b.situacao!=="Em manutenção"?`<button class="btn btn-sm" style="background:rgba(167,139,250,.2);border-color:#a78bfa;color:#a78bfa;font-size:.65rem" onclick="manutencaoBem('${b._id}')">🔧 Manutenção</button>`
                                       :`<button class="btn btn-sm" style="background:rgba(125,206,160,.2);border-color:#7dcea0;color:#7dcea0;font-size:.65rem" onclick="retornarManutencaoBem('${b._id}')">✔ Retornou</button>`}
        <button class="btn btn-sm" style="background:rgba(201,168,76,.2);border-color:var(--dourado);color:var(--dourado);font-size:.65rem" onclick="historicoBem('${b._id}')">🕐 Histórico</button>
        <button class="btn btn-sm btn-perigo" style="background:rgba(248,113,113,.25)" onclick="reportarExtravioBem('${b._id}')">🚨 Extravio/Dano</button>
        <button class="btn btn-sm btn-perigo" onclick="baixarBem('${b._id}')">🚫 Baixa</button>
        <button class="btn btn-sm btn-perigo" onclick="excluirBem('${b._id}')">🗑</button>
      </div>
    </div>`).join(""):'<p class="hist-vazio">Nenhum bem cadastrado.</p>';
}
window.renderBens=renderBens;

export async function logMovimentacaoBem(bemId,tipo,detalhes){
  await addDoc(collection(db,COL_PATRIMONIO_HIST),{bemId,tipo,detalhes,
    usuarioNome:usuarioLogado?.nome||"",usuarioEmail:usuarioLogado?.email||"",hora:agora(),criadoEm:serverTimestamp()});
}

export async function responsabilizarBem(id){
  const b=_bensCache.find(x=>x._id===id);if(!b)return;
  const nome=prompt("Nome do servidor responsável:");
  if(!nome||!nome.trim())return;
  try{
    await updateDoc(doc(db,COL_PATRIMONIO,id),{responsavel:nome.trim(),localizacao:"Com Servidor Responsável",situacao:"Em uso"});
    await logMovimentacaoBem(id,"responsabilidade",`Bem entregue a ${nome.trim()}`);
    await registrarAuditoria("Bem patrimonial acautelado",`${b.descricao} → ${nome.trim()}`);
    await carregarDashboardPatrimonio();renderBens();
    alerta("Responsabilidade atribuída.","ok");
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.responsabilizarBem=responsabilizarBem;

export async function devolverBem(id){
  const b=_bensCache.find(x=>x._id===id);if(!b)return;
  if(!confirm(`Confirmar devolução do bem por ${b.responsavel||"—"}?`))return;
  try{
    await updateDoc(doc(db,COL_PATRIMONIO,id),{responsavel:null,localizacao:"Almoxarifado",situacao:"Em estoque"});
    await logMovimentacaoBem(id,"devolucao",`Bem devolvido por ${b.responsavel||"—"}`);
    await registrarAuditoria("Bem patrimonial devolvido",`${b.descricao}`);
    await carregarDashboardPatrimonio();renderBens();
    alerta("Devolução registrada.","ok");
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.devolverBem=devolverBem;

export async function transferirBem(id){
  const b=_bensCache.find(x=>x._id===id);if(!b)return;
  const opcoes=["Quartel","Armaria","Almoxarifado","Inspetoria","Setor Administrativo"];
  const destino=prompt(`Transferir para onde?\n${opcoes.map((o,i)=>`${i+1}) ${o}`).join("\n")}\n\nDigite o número:`);
  const idx=Number(destino)-1;
  if(isNaN(idx)||!opcoes[idx])return alerta("Operação cancelada.","aviso");
  try{
    await updateDoc(doc(db,COL_PATRIMONIO,id),{localizacao:opcoes[idx]});
    await logMovimentacaoBem(id,"transferencia",`Transferido de ${b.localizacao||"—"} para ${opcoes[idx]}`);
    await registrarAuditoria("Bem patrimonial transferido",`${b.descricao}: ${b.localizacao||"—"} → ${opcoes[idx]}`);
    await carregarDashboardPatrimonio();renderBens();
    alerta("Transferência registrada.","ok");
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.transferirBem=transferirBem;

export async function manutencaoBem(id){
  const b=_bensCache.find(x=>x._id===id);if(!b)return;
  const desc=prompt("Descreva o motivo do envio à manutenção:");
  if(!desc||!desc.trim())return;
  try{
    await updateDoc(doc(db,COL_PATRIMONIO,id),{situacao:"Em manutenção"});
    await logMovimentacaoBem(id,"manutencao",`Enviado à manutenção: ${desc.trim()}`);
    await registrarAuditoria("Bem patrimonial em manutenção",`${b.descricao}: ${desc.trim()}`);
    await carregarDashboardPatrimonio();renderBens();
    alerta("Bem marcado como em manutenção.","ok");
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.manutencaoBem=manutencaoBem;

export async function retornarManutencaoBem(id){
  const b=_bensCache.find(x=>x._id===id);if(!b)return;
  try{
    await updateDoc(doc(db,COL_PATRIMONIO,id),{situacao:"Em estoque"});
    await logMovimentacaoBem(id,"retorno_manutencao","Retornou da manutenção");
    await registrarAuditoria("Bem patrimonial retornou da manutenção",`${b.descricao}`);
    await carregarDashboardPatrimonio();renderBens();
    alerta("Retorno da manutenção registrado.","ok");
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.retornarManutencaoBem=retornarManutencaoBem;

export async function baixarBem(id){
  const b=_bensCache.find(x=>x._id===id);if(!b)return;
  const just=prompt("Justificativa da baixa (obrigatória):");
  if(!just||!just.trim())return alerta("Baixa cancelada: justificativa é obrigatória.","erro");
  try{
    await updateDoc(doc(db,COL_PATRIMONIO,id),{situacao:"Baixado",responsavel:null});
    await logMovimentacaoBem(id,"baixa",`Baixado: ${just.trim()}`);
    await registrarAuditoria("Bem patrimonial baixado",`${b.descricao}: ${just.trim()}`);
    await carregarDashboardPatrimonio();renderBens();
    alerta("Baixa registrada.","ok");
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.baixarBem=baixarBem;

export async function reportarExtravioBem(id){
  const b=_bensCache.find(x=>x._id===id);if(!b)return;
  const tipo=prompt("Tipo do fato:\n1) Extraviado\n2) Danificado\n3) Furtado\n4) Divergência de inventário\n\nDigite o número:");
  const mapa={"1":"Extravio de Bem Patrimonial","2":"Dano a Bem Patrimonial","3":"Furto de Bem Patrimonial","4":"Divergência Patrimonial"};
  if(!tipo||!mapa[tipo.trim()])return alerta("Operação cancelada.","aviso");
  const desc=prompt("Descreva o ocorrido (obrigatório):");
  if(!desc||!desc.trim())return alerta("Descrição é obrigatória.","erro");
  try{
    const num=await criarOcorrenciaAutomatica({
      tipo:mapa[tipo.trim()],local:b.localizacao||"—",
      envolvidos:b.responsavel||"",servidor:b.responsavel||"",
      desc:`Bem: ${b.descricao||""} · Patr: ${b.patrimonio||"—"} · Série: ${b.numeroSerie||"—"}\n\n${desc.trim()}`,
      prioridade:"Alta",origemModulo:"Patrimônio"
    });
    await updateDoc(doc(db,COL_PATRIMONIO,id),{situacao:tipo.trim()==="1"||tipo.trim()==="3"?"Extraviado":b.situacao});
    await logMovimentacaoBem(id,"extravio_dano",`${mapa[tipo.trim()]} reportado — Ocorrência ${num}`);
    await carregarDashboardPatrimonio();renderBens();
    alerta(`Ocorrência ${num} registrada e enviada ao Comando/Corregedoria.`,"ok");
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.reportarExtravioBem=reportarExtravioBem;

export async function historicoBem(id){
  try{
    const snap=await getDocs(query(collection(db,COL_PATRIMONIO_HIST),where("bemId","==",id)));
    const lista=snap.docs.map(d=>d.data()).sort((a,b)=>(b.hora||"").localeCompare(a.hora||""));
    alert(lista.length?lista.map(h=>`${h.hora} · ${(h.tipo||"").toUpperCase()}\n${h.detalhes||""}\nPor: ${h.usuarioNome||"—"}`).join("\n\n"):"Sem histórico registrado.");
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.historicoBem=historicoBem;

export async function iniciarInventario(){
  _inventarioConferidos=new Set();
  document.getElementById("inv-resultado").innerHTML="";
  try{
    const snap=await getDocs(collection(db,COL_PATRIMONIO));
    _bensCache=snap.docs.map(d=>({_id:d.id,...d.data()})).filter(b=>b.situacao!=="Baixado");
  }catch(e){_bensCache=[];}
  renderInventarioLista();
}
window.iniciarInventario=iniciarInventario;

export function renderInventarioLista(){
  const el=document.getElementById("inv-lista");
  const cnt=document.getElementById("inv-contador");
  if(cnt)cnt.textContent=`${_inventarioConferidos.size} de ${_bensCache.length} conferido(s)`;
  el.innerHTML=_bensCache.length?_bensCache.map(b=>`
    <label class="equip-check-item" style="width:100%;border-bottom:1px solid rgba(255,255,255,.06);padding:8px 4px">
      <input type="checkbox" ${_inventarioConferidos.has(b._id)?"checked":""} onchange="toggleInventarioItem('${b._id}',this.checked)">
      <span>${esc(b.categoria)} ${esc(b.descricao)} — Patr: ${esc(b.patrimonio)||"—"} ${b.localizacao?"("+esc(b.localizacao)+")":""}</span>
    </label>`).join(""):'<p class="hist-vazio">Nenhum bem cadastrado para conferência.</p>';
}

export function toggleInventarioItem(id,checked){
  if(checked)_inventarioConferidos.add(id);else _inventarioConferidos.delete(id);
  document.getElementById("inv-contador").textContent=`${_inventarioConferidos.size} de ${_bensCache.length} conferido(s)`;
}
window.toggleInventarioItem=toggleInventarioItem;

export async function finalizarInventario(){
  const naoConferidos=_bensCache.filter(b=>!_inventarioConferidos.has(b._id));
  if(!confirm(`Finalizar inventário?\n\nConferidos: ${_inventarioConferidos.size}\nNão conferidos: ${naoConferidos.length}`))return;
  const agora_str=agora();
  try{
    await addDoc(collection(db,COL_PATRIMONIO_INV),{
      data:new Date().toISOString().slice(0,10),
      totalBens:_bensCache.length,totalConferidos:_inventarioConferidos.size,
      totalDivergencias:naoConferidos.length,
      divergencias:naoConferidos.map(b=>`${b.descricao} (Patr: ${b.patrimonio||"—"})`),
      responsavel:usuarioLogado?.nome||"",responsavelMat:usuarioLogado?.matricula||"",
      criadoEm:serverTimestamp()
    });
    await registrarAuditoria("Inventário patrimonial finalizado",
      `Conferidos: ${_inventarioConferidos.size}/${_bensCache.length} · Divergências: ${naoConferidos.length}`);
    document.getElementById("inv-resultado").innerHTML=`
      <div class="hist-item" style="border-left:3px solid var(--dourado)">
        <div class="hist-corpo">
          ✔ INVENTÁRIO FINALIZADO — ${agora_str}\n
          Total de bens: ${_bensCache.length}\n
          🟢 Conferidos: ${_inventarioConferidos.size}\n
          🔴 Divergências: ${naoConferidos.length}${naoConferidos.length?"\n\n"+naoConferidos.map(b=>"⚠ "+b.descricao+" (Patr: "+(b.patrimonio||"—")+")").join("\n"):""}\n
          Responsável: ${usuarioLogado?.nome||""}
        </div>
      </div>`;
    alerta("Inventário registrado com sucesso.","ok");
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.finalizarInventario=finalizarInventario;

export async function carregarTecnologia(){
  document.getElementById("tec-data").textContent=`📅 ${agora()}`;
  let usuariosAprovados=0,pendentes=0,chamadosAbertos=0,ultimoBackupTxt="Nunca realizado";
  let leituraUsuariosOk=true;

  try{
    const snap=await getDocs(collection(db,COL_USUARIOS));
    const docs=snap.docs.map(d=>d.data());
    usuariosAprovados=docs.filter(u=>u.status==="aprovado").length;
    pendentes=docs.filter(u=>u.status==="pendente").length;
  }catch(e){leituraUsuariosOk=false;}

  try{
    const snap=await getDocs(collection(db,COL_CHAMADOS));
    chamadosAbertos=snap.docs.filter(d=>d.data().status!=="resolvido").length;
  }catch(e){}

  try{
    const snap=await getDoc(doc(db,COL_SISTEMA_CONFIG,"config"));
    if(snap.exists()&&snap.data().ultimoBackup)ultimoBackupTxt=snap.data().ultimoBackup;
  }catch(e){}

  document.getElementById("tec-usuarios").textContent=leituraUsuariosOk?usuariosAprovados:"—";
  document.getElementById("tec-pendentes").textContent=leituraUsuariosOk?pendentes:"—";
  document.getElementById("tec-chamados").textContent=chamadosAbertos;
  document.getElementById("tec-ultimo-backup").textContent=ultimoBackupTxt;

  // Painel de Saúde — 🟢 normal / 🟡 atenção / 🔴 crítico
  const box=document.getElementById("tec-saude"),icone=document.getElementById("tec-saude-icone"),txt=document.getElementById("tec-saude-texto");
  box.classList.remove("tec-saude-verde","tec-saude-amarelo","tec-saude-vermelho");
  let diasSemBackup=null;
  try{
    const snap=await getDoc(doc(db,COL_SISTEMA_CONFIG,"config"));
    if(snap.exists()&&snap.data().ultimoBackupData)diasSemBackup=diasParaVencer(snap.data().ultimoBackupData)*-1;
  }catch(e){}
  if(pendentes>=5||chamadosAbertos>=10||(diasSemBackup!==null&&diasSemBackup>30)){
    box.classList.add("tec-saude-vermelho");icone.textContent="🔴";txt.textContent="Atenção necessária";
  }else if(pendentes>0||chamadosAbertos>0||diasSemBackup===null||diasSemBackup>7){
    box.classList.add("tec-saude-amarelo");icone.textContent="🟡";txt.textContent="Sistema operando com pendências";
  }else{
    box.classList.add("tec-saude-verde");icone.textContent="🟢";txt.textContent="Sistema operando normalmente";
  }

  // Checklist detalhado do Painel de Saúde
  const checklist=document.getElementById("tec-saude-checklist");
  let firebaseOk=true,firestoreOk=leituraUsuariosOk;
  try{await getDoc(doc(db,COL_SISTEMA_CONFIG,"config"));}catch(e){firebaseOk=false;}
  let versaoApp="—",errosAbertos=0;
  try{
    const snapCfg=await getDoc(doc(db,COL_SISTEMA_CONFIG,"config"));
    if(snapCfg.exists())versaoApp=snapCfg.data().versaoApp||"—";
  }catch(e){}
  try{
    const snapErr=await getDocs(query(collection(db,"erros_sistema"),where("status","==","aberto")));
    errosAbertos=snapErr.size;
  }catch(e){}
  let logins24h=0;
  try{
    const desde=new Date(Date.now()-24*3600*1000);
    const snapLog=await getDocs(query(collection(db,COL_LOG),where("tipo","==","login")));
    logins24h=snapLog.docs.filter(d=>d.data().criadoEm?.toDate&&d.data().criadoEm.toDate()>=desde).length;
  }catch(e){}
  let totalDocsAprox=0;
  try{
    for(const col of ["usuarios","plantao","ocorrencias","banco_horas"]){
      const s=await getDocs(collection(db,col));totalDocsAprox+=s.size;
    }
  }catch(e){}

  const itensChecklist=[
    {ok:firebaseOk,label:"Firebase conectado"},
    {ok:firestoreOk,label:"Banco de dados (Firestore) online"},
    {ok:true,label:"Notificações internas funcionando (in-app)"},
    {ok:diasSemBackup!==null&&diasSemBackup<=7,label:`Último backup: ${ultimoBackupTxt}`},
    {ok:true,label:`Armazenamento (estimativa): ${totalDocsAprox}+ documentos em coleções-chave`},
    {ok:true,label:`Usuários com login nas últimas 24h: ${logins24h}`},
    {ok:true,label:`Versão do aplicativo: ${versaoApp}`},
    {ok:errosAbertos===0,label:errosAbertos>0?`${errosAbertos} alerta(s) técnico(s) em aberto`:"Nenhum alerta técnico em aberto"}
  ];
  checklist.innerHTML=itensChecklist.map(i=>`<div class="hist-item" style="padding:6px 10px;margin-bottom:4px;display:flex;gap:8px;align-items:center">
      <span>${i.ok?"🟢":"🔴"}</span><span style="font-size:.75rem">${i.label}</span>
    </div>`).join("");

  // Estatísticas técnicas simples
  const stats=document.getElementById("tec-stats");
  const itens=[`👥 Usuários aprovados: ${leituraUsuariosOk?usuariosAprovados:"sem permissão para consultar"}`,
    `🎫 Chamados abertos: ${chamadosAbertos}`,`💾 Último backup: ${ultimoBackupTxt}`,
    `📱 Dispositivo atual: ${navigator.userAgent.substring(0,60)}`];
  stats.innerHTML=itens.map(t=>`<div class="hist-item" style="padding:7px 10px;margin-bottom:5px;font-size:.76rem">${t}</div>`).join("");
}
window.carregarTecnologia=carregarTecnologia;

export async function realizarBackupManual(){
  if(!confirm("Gerar backup manual agora? O arquivo será baixado no seu dispositivo."))return;
  const colecoes=["servidores_plantao","plantao","ocorrencias","pad","armas_individuais",
    "coletes","patrimonio","ordens_servico","fiscalizacao","escalas_mensais","banco_horas","viaturas"];
  const dump={geradoEm:agora(),geradoPor:usuarioLogado?.nome||"",dados:{}};
  try{
    for(const col of colecoes){
      try{
        const snap=await getDocs(collection(db,col));
        dump.dados[col]=snap.docs.map(d=>({id:d.id,...d.data()}));
      }catch(e){dump.dados[col]=`Erro ao ler: ${e.message}`;}
    }
    const blob=new Blob([JSON.stringify(dump,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download=`backup_pmc_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);a.click();a.remove();
    URL.revokeObjectURL(url);

    const dataHoje=new Date().toISOString().slice(0,10);
    await setDoc(doc(db,COL_SISTEMA_CONFIG,"config"),{
      ultimoBackup:agora(),ultimoBackupData:dataHoje,
      ultimoBackupPor:usuarioLogado?.nome||""
    },{merge:true});
    await registrarAuditoria("Backup manual realizado",`Coleções: ${colecoes.join(", ")}`);
    alerta("Backup gerado e baixado com sucesso!","ok");
    const statusEl=document.getElementById("backup-status");
    if(statusEl)statusEl.innerHTML=`<div class="hist-tipo">✅ Backup gerado</div><div class="hist-corpo">Em: ${agora()}\nPor: ${usuarioLogado?.nome||""}\nColeções: ${colecoes.length}</div>`;
    carregarTecnologia();
  }catch(err){alerta("Erro ao gerar backup: "+err.message,"erro");}
}
window.realizarBackupManual=realizarBackupManual;

export function abrirLogAcessosTec(){
  ir("tec-auditoria");
  const sel=document.getElementById("filtro-aud-origem");
  if(sel){sel.value="acesso";filtrarAuditoria();}
}

export async function iniciarTecSeguranca(){
  const el=document.getElementById("tec-sessoes-lista");
  el.innerHTML='<p class="hist-vazio">Carregando...</p>';
  try{
    const desde=new Date(Date.now()-24*3600*1000);
    const snap=await getDocs(query(collection(db,COL_LOG),orderBy("criadoEm","desc")));
    const recentes=snap.docs.map(d=>d.data())
      .filter(l=>l.tipo==="login"&&l.criadoEm?.toDate&&l.criadoEm.toDate()>=desde);
    // uma "sessão" por usuário = login mais recente dele nas últimas 24h
    const porUsuario={};
    recentes.forEach(l=>{if(!porUsuario[l.usuarioEmail]||(l.criadoEm.seconds>porUsuario[l.usuarioEmail].criadoEm.seconds))porUsuario[l.usuarioEmail]=l;});
    const lista=Object.values(porUsuario).sort((a,b)=>b.criadoEm.seconds-a.criadoEm.seconds);
    el.innerHTML=lista.length?lista.map(l=>`<div class="hist-item">
        <div class="hist-tipo">🟢 ${l.usuarioNome||l.usuarioEmail}</div>
        <div class="hist-data">Último login: ${l.hora||""}</div>
        <div class="hist-corpo" style="font-size:.7rem">📱 ${(l.dispositivo||"").substring(0,55)}</div>
      </div>`).join(""):'<p class="hist-vazio">Nenhum login nas últimas 24h.</p>';
  }catch(err){el.innerHTML=`<p class="hist-vazio">Erro: ${err.message}</p>`;}
  atualizarStatusLogoffGeral();
}

export async function atualizarStatusLogoffGeral(){
  const el=document.getElementById("tec-logoff-status");
  if(!el)return;
  try{
    const snap=await getDoc(doc(db,COL_SISTEMA_CONFIG,"config"));
    const cfg=snap.exists()?snap.data():{};
    if(cfg.forcarLogoffEm?.toDate){
      el.textContent=`Último disparo: ${cfg.forcarLogoffEm.toDate().toLocaleString("pt-BR")} — por ${cfg.forcarLogoffPor||"—"}`;
    }else{
      el.textContent="Nunca foi disparado.";
    }
  }catch(e){}
}

export async function forcarLogoffGeral(){
  if(!confirm("Isso vai desconectar TODOS os usuários com o app aberto agora, em qualquer aparelho — inclusive você. Tem certeza?"))return;
  if(!confirm("Confirma mesmo? Todo mundo vai precisar fazer login de novo em até 30 segundos."))return;
  try{
    await setDoc(doc(db,COL_SISTEMA_CONFIG,"config"),{
      forcarLogoffEm:serverTimestamp(),forcarLogoffPor:usuarioLogado?.nome||""
    },{merge:true});
    await registrarAuditoria("Forçou logoff geral de todos os usuários",`Disparado por: ${usuarioLogado?.nome||""}`);
    alerta("Logoff geral disparado! Todas as sessões (inclusive a sua) serão encerradas em até 30 segundos.","aviso");
    atualizarStatusLogoffGeral();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.forcarLogoffGeral=forcarLogoffGeral;

export async function iniciarTecDispositivos(){
  const sel=document.getElementById("disp-usuario-sel");
  sel.innerHTML='<option value="">Carregando usuários...</option>';
  try{
    const snap=await getDocs(query(collection(db,COL_USUARIOS),where("status","==","aprovado")));
    const usuarios=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.nome.localeCompare(b.nome));
    sel.innerHTML='<option value="">Selecione...</option>'+usuarios.map(u=>`<option value="${u.id}" data-nome="${u.nome}">${u.nome} (${u.matricula||"—"})</option>`).join("");
  }catch(e){sel.innerHTML='<option value="">Erro ao carregar usuários</option>';}

  document.getElementById("disp-nome").value="";
  document.getElementById("disp-modelo").value="";
  document.getElementById("disp-obs").value="";
  renderDispositivos();
  renderHistoricoAparelhos();
}

export async function registrarDispositivo(){
  const sel=document.getElementById("disp-usuario-sel");
  const usuarioId=sel.value,usuarioNome=sel.options[sel.selectedIndex]?.dataset?.nome||"";
  const nome=v("disp-nome"),modelo=v("disp-modelo"),obs=v("disp-obs");
  if(!usuarioId)return alerta("Selecione o usuário vinculado.","erro");
  if(!nome)return alerta("Dê um apelido para o aparelho.","erro");
  try{
    await addDoc(collection(db,COL_DISPOSITIVOS),{
      usuarioId,usuarioNome,nome,modelo,obs,status:"ativo",
      registradoPor:usuarioLogado?.nome||"",criadoEm:serverTimestamp()
    });
    await registrarAuditoria("Registrou dispositivo autorizado",`${nome} — vinculado a ${usuarioNome}`);
    alerta("Dispositivo registrado!","ok");
    iniciarTecDispositivos();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.registrarDispositivo=registrarDispositivo;

export async function renderDispositivos(){
  const el=document.getElementById("disp-lista");
  el.innerHTML='<p class="hist-vazio">Carregando...</p>';
  try{
    const snap=await getDocs(query(collection(db,COL_DISPOSITIVOS),orderBy("criadoEm","desc")));
    const lista=snap.docs.map(d=>({id:d.id,...d.data()}));
    el.innerHTML=lista.length?lista.map(d=>{
      const bloqueado=d.status==="bloqueado";
      return`<div class="hist-item">
        <div class="hist-tipo">${bloqueado?"🔴":"🟢"} ${esc(d.nome)}${bloqueado?' <span class="badge status-erro">Bloqueado</span>':""}</div>
        <div class="hist-data">👤 ${esc(d.usuarioNome)} ${d.modelo?" · "+esc(d.modelo):""}</div>
        ${d.obs?`<div class="hist-corpo">${esc(d.obs)}</div>`:""}
        <div style="display:flex;gap:6px;margin-top:6px">
          <button class="btn btn-sm" style="flex:1;background:${bloqueado?'rgba(125,206,160,.2)':'rgba(192,57,43,.2)'};border-color:${bloqueado?'#7dcea0':'#f1948a'};color:${bloqueado?'#7dcea0':'#f1948a'}"
            onclick="toggleBloqueioDispositivo('${d.id}',${!bloqueado})">${bloqueado?"🔓 Desbloquear":"🚫 Marcar como perdido/roubado"}</button>
          <button class="btn btn-sm btn-perigo" onclick="removerDispositivo('${d.id}')">🗑</button>
        </div>
      </div>`;
    }).join(""):'<p class="hist-vazio">Nenhum dispositivo registrado.</p>';
  }catch(err){el.innerHTML=`<p class="hist-vazio">Erro: ${err.message}</p>`;}
}

export async function toggleBloqueioDispositivo(id,bloquear){
  if(!confirm(bloquear?"Marcar este dispositivo como perdido/roubado? (isso é só um registro — não bloqueia tecnicamente o acesso)":"Desbloquear este dispositivo?"))return;
  try{
    await updateDoc(doc(db,COL_DISPOSITIVOS,id),{status:bloquear?"bloqueado":"ativo"});
    await registrarAuditoria(bloquear?"Marcou dispositivo como perdido/roubado":"Desbloqueou dispositivo",`Doc ${id}`);
    renderDispositivos();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.toggleBloqueioDispositivo=toggleBloqueioDispositivo;

export async function removerDispositivo(id){
  if(!confirm("Remover este registro de dispositivo?"))return;
  await deleteDoc(doc(db,COL_DISPOSITIVOS,id));
  renderDispositivos();
}
window.removerDispositivo=removerDispositivo;

export async function renderHistoricoAparelhos(){
  const el=document.getElementById("disp-historico-lista");
  el.innerHTML='<p class="hist-vazio">Carregando...</p>';
  try{
    const snap=await getDocs(query(collection(db,COL_LOG),where("tipo","==","login"),orderBy("criadoEm","desc")));
    const docs=snap.docs.map(d=>d.data()).slice(0,300);
    const grupos={};
    docs.forEach(l=>{
      const chave=`${l.usuarioEmail}|${(l.dispositivo||"").substring(0,40)}`;
      if(!grupos[chave])grupos[chave]={usuarioNome:l.usuarioNome,dispositivo:l.dispositivo,vezes:0,ultimo:l.hora};
      grupos[chave].vezes++;
    });
    const lista=Object.values(grupos).sort((a,b)=>b.vezes-a.vezes).slice(0,25);
    el.innerHTML=lista.length?lista.map(g=>`<div class="hist-item">
        <div class="hist-tipo">👤 ${esc(g.usuarioNome)}</div>
        <div class="hist-corpo" style="font-size:.7rem">📱 ${esc((g.dispositivo||"").substring(0,60))}<br>${g.vezes} login(s) · último em ${g.ultimo}</div>
      </div>`).join(""):'<p class="hist-vazio">Sem histórico de login ainda.</p>';
  }catch(err){el.innerHTML=`<p class="hist-vazio">Erro: ${err.message}</p>`;}
}

export async function carregarTecMonitoramento(){
  const colecoes=["usuarios","servidores_plantao","plantao","permutas","banco_horas","escalas_mensais",
    "ocorrencias","pad","armas_individuais","coletes","patrimonio","viaturas","ordens_servico",
    "fiscalizacao","notificacoes","chamados_tecnicos","erros_sistema","log_acessos","auditoria","dispositivos"];
  const porColecao={};
  let totalDocs=0;
  for(const col of colecoes){
    try{
      const snap=await getDocs(collection(db,col));
      porColecao[col]=snap.size;totalDocs+=snap.size;
    }catch(e){porColecao[col]="sem acesso";}
  }
  document.getElementById("mon-docs-total").textContent=totalDocs;

  try{
    const desde=new Date(Date.now()-24*3600*1000);
    const snapLog=await getDocs(query(collection(db,COL_LOG),where("tipo","==","login")));
    const logins24h=snapLog.docs.filter(d=>d.data().criadoEm?.toDate&&d.data().criadoEm.toDate()>=desde).length;
    document.getElementById("mon-logins-24h").textContent=logins24h;
  }catch(e){document.getElementById("mon-logins-24h").textContent="—";}

  try{
    const desde7=new Date(Date.now()-7*24*3600*1000);
    const snapErros=await getDocs(collection(db,"erros_sistema"));
    const erros7d=snapErros.docs.filter(d=>d.data().criadoEm?.toDate&&d.data().criadoEm.toDate()>=desde7).length;
    document.getElementById("mon-erros-7d").textContent=erros7d;
  }catch(e){document.getElementById("mon-erros-7d").textContent="—";}

  try{
    const snapCh=await getDocs(collection(db,COL_CHAMADOS));
    document.getElementById("mon-chamados-abertos").textContent=snapCh.docs.filter(d=>d.data().status!=="resolvido").length;
  }catch(e){document.getElementById("mon-chamados-abertos").textContent="—";}

  document.getElementById("mon-por-colecao").innerHTML=Object.entries(porColecao)
    .sort((a,b)=>(Number(b[1])||0)-(Number(a[1])||0))
    .map(([col,n])=>`<div class="hist-item" style="padding:6px 10px;margin-bottom:4px"><div class="hist-tipo" style="font-size:.75rem">${col}</div><div class="hist-corpo">${n} documento(s)</div></div>`).join("");
}

export async function carregarTecIntegracoes(){
  const el=document.getElementById("integ-lista");
  const itens=[
    {nome:"Firebase Authentication",status:true,desc:"Login e cadastro de usuários"},
    {nome:"Cloud Firestore",status:true,desc:"Banco de dados principal"},
    {nome:"Firebase Hosting",status:true,desc:"Hospedagem do aplicativo"},
    {nome:"Firebase Cloud Messaging",status:false,desc:"Configurado no projeto, mas não usado para push — as notificações hoje são internas (polling), não push do sistema operacional"},
    {nome:"Firebase Storage",status:false,desc:"Não utilizado neste sistema (fotos/anexos ficam como referência, não upload de arquivo)"}
  ];
  el.innerHTML=itens.map(i=>`<div class="hist-item">
      <div class="hist-tipo">${i.status?"🟢":"⚪"} ${i.nome}</div>
      <div class="hist-corpo">${i.desc}</div>
    </div>`).join("");
  try{
    const snap=await getDoc(doc(db,COL_SISTEMA_CONFIG,"config"));
    document.getElementById("integ-notas").value=snap.exists()?(snap.data().notasIntegracoes||""):"";
  }catch(e){}
}

export async function salvarNotasIntegracoes(){
  try{
    await setDoc(doc(db,COL_SISTEMA_CONFIG,"config"),{notasIntegracoes:v("integ-notas")},{merge:true});
    alerta("Notas salvas!","ok");
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.salvarNotasIntegracoes=salvarNotasIntegracoes;

export async function verificarIntegridadeBanco(){
  const el=document.getElementById("integridade-resultado");
  el.innerHTML='<p class="hist-vazio">Verificando...</p>';
  const achados=[];
  try{
    const snapPlantao=await getDocs(collection(db,COL_PLANTAO));
    const semMatricula=snapPlantao.docs.filter(d=>!d.data().servidorMat).length;
    if(semMatricula)achados.push(`⚠️ ${semMatricula} registro(s) de plantão sem matrícula vinculada.`);

    const snapBH=await getDocs(collection(db,COL_BH));
    const semStatus=snapBH.docs.filter(d=>!d.data().status).length;
    if(semStatus)achados.push(`ℹ️ ${semStatus} lançamento(s) de banco de horas sem campo "status" (lançamentos antigos — tratados como aprovados automaticamente, não é um erro).`);

    const snapUsuarios=await getDocs(collection(db,COL_USUARIOS));
    const semMatriculaUser=snapUsuarios.docs.filter(d=>!d.data().matricula).length;
    if(semMatriculaUser)achados.push(`⚠️ ${semMatriculaUser} usuário(s) sem matrícula cadastrada.`);

    const snapPerm=await getDocs(collection(db,COL_PERMUTAS));
    const permAbertas=snapPerm.docs.filter(d=>["aguardando_servidor","aguardando_administrativo"].includes(d.data().status)).length;
    achados.push(`ℹ️ ${permAbertas} permuta(s) em andamento (informativo).`);

    el.innerHTML=achados.length?achados.map(a=>`<div class="hist-item">${a}</div>`).join(""):
      '<div class="hist-item"><div class="hist-tipo">✅ Nenhuma inconsistência encontrada</div></div>';
    await registrarAuditoria("Verificou integridade do banco de dados",`${achados.length} observação(ões)`);
  }catch(err){el.innerHTML=`<p class="hist-vazio">Erro: ${err.message}</p>`;}
}
window.verificarIntegridadeBanco=verificarIntegridadeBanco;

export async function restaurarBackup(){
  if(v("restore-confirmacao")!=="CONFIRMAR")return alerta('Digite exatamente "CONFIRMAR" para habilitar a restauração.',"erro");
  let dump;
  try{dump=JSON.parse(v("restore-json"));}catch(e){return alerta("JSON inválido — cole o conteúdo exato do arquivo de backup.","erro");}
  if(!dump.dados)return alerta("Este arquivo não parece ser um backup gerado por este painel.","erro");

  const disponiveis=Object.keys(dump.dados).filter(c=>COLECOES_RESTAURAVEIS.includes(c));
  if(!disponiveis.length)return alerta("Este backup não contém nenhuma coleção técnica restaurável (usuarios, chamados_tecnicos, erros_sistema, dispositivos, sistema_config, perfis_permissao).","erro");
  if(!confirm(`Isso vai SOBRESCREVER ${disponiveis.join(", ")} com os dados do arquivo colado. Esta ação não pode ser desfeita. Continuar?`))return;

  let totalRestaurado=0;
  try{
    for(const col of disponiveis){
      const docs=dump.dados[col];
      if(!Array.isArray(docs))continue;
      for(const d of docs){
        const{id,...campos}=d;
        if(!id)continue;
        await setDoc(doc(db,col,id),campos);
        totalRestaurado++;
      }
    }
    await registrarAuditoria("Restaurou backup de dados técnicos",`Coleções: ${disponiveis.join(", ")} · ${totalRestaurado} documento(s)`);
    alerta(`Restauração concluída! ${totalRestaurado} documento(s) restaurado(s).`,"ok");
    document.getElementById("restore-json").value="";
    document.getElementById("restore-confirmacao").value="";
  }catch(err){alerta("Erro durante a restauração: "+err.message,"erro");}
}
window.restaurarBackup=restaurarBackup;

