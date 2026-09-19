import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { carregarViaturasCache, diasParaVencer } from "./armaria.js";
import { CHAVE_OC, COL_ARMAS_IND, COL_BH, COL_COLETES, COL_ESCALA_MENSAL, COL_FISC, COL_OC, COL_OS, COL_PAD, COL_PLANTAO, COL_SERV, COL_USUARIOS, MARCACOES_LICENCA, _relatorioAtual, _relatorioTexto, _viaturasCache, agora, alerta, db, enviarNotificacao, esc, plantaoNumeroAtual, registrarAuditoria, usuarioLogado, v } from "./core.js";
import { atualizarBadgeCorregedoria, carregarOcorrencias, registrarHistoricoOcorrencia } from "./pad.js";
import { gerarNumeroPlantao } from "./plantao.js";

export function iniciarOcorrenciasPlantao(){
  document.getElementById("ocp-numero-txt").textContent=plantaoNumeroAtual||"—";
  document.getElementById("ocp-servidor").value="";
  document.getElementById("ocp-desc").value="";
  renderOcorrenciasPlantao();
}

export async function registrarOcorrenciaPlantao(){
  const tipo=v("ocp-tipo"),servidorEnvolvido=v("ocp-servidor"),desc=v("ocp-desc");
  if(!desc)return alerta("Descreva o ocorrido.","erro");
  const hoje=new Date().toISOString().slice(0,10);
  const num=`PLT-${plantaoNumeroAtual||gerarNumeroPlantao(hoje)}-${(carregarOC().length+1)}`;
  const oc={id:Date.now().toString(),num,tipo:`Plantão: ${tipo}`,local:v("plantao-unidade")||"—",
    data:hoje,hora:new Date().toTimeString().slice(0,5),
    envolvidos:servidorEnvolvido,servidor:servidorEnvolvido,desc,status:"aberta",prioridade:"Média",
    origemPlantao:plantaoNumeroAtual||"",equipe:v("plantao-equipe")||"",registradoPor:usuarioLogado?.nome||"",
    email:usuarioLogado?.email||"",criadoEm:agora()};
  try{
    const ref=await addDoc(collection(db,COL_OC),{...oc,criadoEm:serverTimestamp()});
    oc.id=ref.id;oc._fbId=ref.id;oc._sincronizado=true;
    const lista=carregarOC();lista.unshift(oc);salvarOC(lista);
  }catch(err){
    oc._sincronizado=false;
    const lista=carregarOC();lista.unshift(oc);salvarOC(lista);
    alerta("⚠️ Não foi possível enviar ao servidor agora ("+err.message+"). "+
      "Ficou salva só neste aparelho — reenvie pela lista de ocorrências assim que tiver conexão.","erro");
    document.getElementById("ocp-servidor").value="";
    document.getElementById("ocp-desc").value="";
    renderOcorrenciasPlantao();atualizarContadorOcPlantao();
    return;
  }
  await registrarAuditoria(`Ocorrência de plantão registrada: ${num}`,`Tipo: ${tipo} | Plantão Nº ${plantaoNumeroAtual}`,
    {modulo:"🚨 Ocorrências",registro:num});
  await notificarComandoNovaOcorrencia(num,`Plantão: ${tipo}`,v("plantao-unidade")||"—");
  alerta(`Ocorrência ${num} registrada e enviada ao Comando.`,"ok");
  document.getElementById("ocp-servidor").value="";
  document.getElementById("ocp-desc").value="";
  renderOcorrenciasPlantao();
  atualizarContadorOcPlantao();
}
window.registrarOcorrenciaPlantao=registrarOcorrenciaPlantao;

export function renderOcorrenciasPlantao(){
  const lista=document.getElementById("plantao-oc-lista");
  const ocs=carregarOC().filter(o=>o.origemPlantao===plantaoNumeroAtual);
  lista.innerHTML=ocs.length?ocs.map(o=>`
    <div class="oc-plantao-item">
      <strong>${esc(o.num)}</strong> · ${esc(o.tipo)}<br>
      <span style="color:var(--cinza)">${esc(o.data)} ${esc(o.hora)} ${o.servidor?"· "+esc(o.servidor):""}</span><br>
      ${esc(o.desc)}
    </div>`).join(""):'<p class="hist-vazio">Nenhuma ocorrência registrada para este plantão.</p>';
}

export function atualizarContadorOcPlantao(){
  const el=document.getElementById("cnt-oc-plantao");
  if(!el)return;
  el.textContent=carregarOC().filter(o=>o.origemPlantao===plantaoNumeroAtual).length;
}

export async function carregarDashboard(){
  document.getElementById("dash-data").textContent=`📅 ${agora()}`;
  const hoje=new Date().toISOString().slice(0,10);

  // Presentes/Ausentes/Atrasados hoje
  try{
    const snapP=await getDocs(query(collection(db,COL_PLANTAO),where("data","==",hoje)));
    let p=0,a=0,at=0;
    snapP.docs.forEach(d=>{
      const s=d.data().status;
      if(s==="presente")p++;else if(s==="ausente")a++;else if(s==="atrasado")at++;
    });
    document.getElementById("dash-presentes").textContent=p;
    document.getElementById("dash-ausentes").textContent=a;
    document.getElementById("dash-atrasados").textContent=at;
  }catch(e){}

  // O.S abertas
  try{
    const snapOS=await getDocs(query(collection(db,COL_OS),where("statusOS","==","ativa")));
    document.getElementById("dash-os-abertas").textContent=snapOS.size;
  }catch(e){}

  // Ocorrências abertas
  try{
    const snapOC=await getDocs(query(collection(db,COL_OC),where("status","in",["aberta","andamento"])));
    document.getElementById("dash-ocorrencias").textContent=snapOC.size;
  }catch(e){}

  // Boletim rápido do dia
  await gerarBoletimData(hoje,"dash-boletim");
}

export function exportarBoletim(){
  const hoje=new Date().toISOString().slice(0,10);
  _exportarBoletimWAData(hoje);
}
window.exportarBoletim=exportarBoletim;

export function carregarOC(){try{return JSON.parse(localStorage.getItem(CHAVE_OC))||[];}catch{return[];}}

export function salvarOC(arr){localStorage.setItem(CHAVE_OC,JSON.stringify(arr));}

export function iniciarOcData(){
  const hoje=new Date().toISOString().slice(0,10);
  if(!v("oc-data"))document.getElementById("oc-data").value=hoje;
}

export function gerarProtocoloCorregedoria(){
  const ano=new Date().getFullYear();
  const seq=String(Math.floor(Math.random()*9000)+1000);
  return `COR-${ano}/${seq}`;
}

export async function criarOcorrenciaAutomatica({tipo,local,envolvidos,servidor,desc,prioridade,origemModulo}){
  const num=`AUTO-${Date.now().toString().slice(-8)}`;
  const hoje=new Date();
  const oc={id:Date.now().toString(),num,tipo,local:local||"—",
    data:hoje.toISOString().slice(0,10),hora:hoje.toTimeString().slice(0,5),
    envolvidos:envolvidos||servidor||"",servidor:servidor||"",desc:desc||"",
    status:"aberta",prioridade:prioridade||"Média",
    registradoPor:usuarioLogado?.nome||"Sistema",
    email:usuarioLogado?.email||"",origemModulo:origemModulo||"",criadoEm:agora()};
  const lista=carregarOC();lista.unshift(oc);salvarOC(lista);
  try{await addDoc(collection(db,COL_OC),{...oc,criadoEm:serverTimestamp()});}catch(e){}
  await registrarAuditoria(`Ocorrência automática gerada: ${num}`,`Origem: ${origemModulo||"—"} · Tipo: ${tipo}`);
  await notificarComandoNovaOcorrencia(num,tipo,local||"—");
  return num;
}

export async function registrarOcorrencia(){
  const num=v("oc-num"),tipo=v("oc-tipo"),local=v("oc-local"),
        data=v("oc-data"),hora=v("oc-hora"),
        envolvidos=v("oc-envolvidos"),servidor=v("oc-servidor"),
        desc=v("oc-desc"),prioridade=v("oc-prioridade")||"Média";
  if(!num||!local||!data)return alerta("Preencha nº, local e data.","erro");

  // status inicial sempre "aberta": o Comando é quem define o status e o encaminhamento
  const oc={id:Date.now().toString(),num,tipo,local,data,hora,
    envolvidos,servidor,desc,status:"aberta",prioridade,
    registradoPor:usuarioLogado?.nome||"",
    email:usuarioLogado?.email||"",criadoEm:agora()};
  // statusCorregedoria fica indefinido: aguardando decisão do Comando

  // O Firestore é a fonte de verdade. Só depois que ele confirma é que
  // guardamos uma cópia local (como cache de leitura, não como gravação
  // primária) — assim nenhuma ocorrência fica presa só no aparelho sem
  // ninguém saber.
  try{
    const ref=await addDoc(collection(db,COL_OC),{...oc,criadoEm:serverTimestamp()});
    oc.id=ref.id;oc._fbId=ref.id;oc._sincronizado=true;
    const lista=carregarOC();lista.unshift(oc);salvarOC(lista);
  }catch(err){
    // Falhou de verdade — avisa e NÃO diz que foi registrada. Guarda local
    // marcada como pendente, para não perder o texto já digitado, mas o
    // usuário precisa saber que ainda não chegou ao servidor.
    oc._sincronizado=false;
    const lista=carregarOC();lista.unshift(oc);salvarOC(lista);
    alerta("⚠️ Não foi possível enviar ao servidor agora ("+err.message+"). "+
      "A ocorrência ficou salva só neste aparelho, marcada como NÃO SINCRONIZADA — "+
      "tente novamente assim que tiver conexão, usando o botão de reenvio na lista.","erro");
    [ "oc-num","oc-local","oc-hora","oc-envolvidos","oc-servidor","oc-desc"]
      .forEach(id=>{const el=document.getElementById(id);if(el)el.value="";});
    carregarOcorrencias();
    return;
  }

  await registrarAuditoria(`Ocorrência registrada: ${num}`,`Tipo: ${tipo} | Local: ${local}`,
    {modulo:"🚨 Ocorrências",registro:num});
  await notificarComandoNovaOcorrencia(num,tipo,local);

  alerta(`Ocorrência ${num} registrada! Enviada para as notificações do Comando.`,"ok");
  ["oc-num","oc-local","oc-hora","oc-envolvidos","oc-servidor","oc-desc"]
    .forEach(id=>{const el=document.getElementById(id);if(el)el.value="";});
  carregarOcorrencias();
}
window.registrarOcorrencia=registrarOcorrencia;

export async function reenviarOcorrenciaPendente(idLocal){
  const lista=carregarOC();
  const idx=lista.findIndex(o=>o.id===idLocal);
  if(idx===-1)return;
  const oc={...lista[idx]};
  delete oc._sincronizado;delete oc._fbId;
  try{
    const ref=await addDoc(collection(db,COL_OC),{...oc,criadoEm:serverTimestamp()});
    lista[idx].id=ref.id;lista[idx]._fbId=ref.id;lista[idx]._sincronizado=true;
    salvarOC(lista);
    await registrarAuditoria(`Ocorrência reenviada: ${oc.num}`,"Sincronização manual após falha anterior.",
      {modulo:"🚨 Ocorrências",registro:oc.num});
    alerta("Ocorrência sincronizada com sucesso!","ok");
    carregarOcorrencias();
  }catch(err){alerta("Ainda não foi possível sincronizar: "+err.message,"erro");}
}
window.reenviarOcorrenciaPendente=reenviarOcorrenciaPendente;

export async function notificarComandoNovaOcorrencia(num,tipo,local){
  try{
    const snap=await getDocs(query(collection(db,COL_USUARIOS),where("status","==","aprovado")));
    const titulo=`🚨 Nova Ocorrência — ${num}`;
    const corpo=`Tipo: ${tipo}\nLocal: ${local}\nAguardando decisão do Comando.`;
    for(const d of snap.docs){
      const u=d.data();
      if(u.email && u.permissoes?.comando===true){
        await enviarNotificacao(u.email,titulo,corpo,"comando");
      }
    }
  }catch(e){console.warn("notificarComando:",e.message);}
  atualizarBadgeCmdOc();
}

export function renderOcorrenciasComando(){
  const lista=window._ocCache||carregarOC();
  const q=(v("cmd-oc-filtro")||"").toLowerCase();
  const st=v("cmd-oc-filtro-status");
  const dec=v("cmd-oc-filtro-decisao");
  let filtrados=lista;
  if(q)filtrados=filtrados.filter(o=>o.num?.toLowerCase().includes(q)||o.tipo?.toLowerCase().includes(q)||o.local?.toLowerCase().includes(q));
  if(st)filtrados=filtrados.filter(o=>o.status===st);
  if(dec==="pendente")filtrados=filtrados.filter(o=>!o.statusCorregedoria);
  else if(dec)filtrados=filtrados.filter(o=>o.statusCorregedoria===dec);

  const cnt=document.getElementById("cmd-oc-contador");
  if(cnt)cnt.textContent=filtrados.length?`${filtrados.length} ocorrência(s)`:"";
  const el=document.getElementById("cmd-oc-lista");
  if(!el)return;
  if(!filtrados.length){el.innerHTML='<p class="hist-vazio">Nenhuma ocorrência encontrada.</p>';return;}

  const decLabel={recebida:"⚖️ Encaminhada à Corregedoria",info_solicitada:"❓ Info. solicitada (Corregedoria)",
    pad_aberto:"📁 PAD aberto",arquivada_sem_pad:"🗄 Arquivada s/ PAD",devolvida:"↩️ Devolvida",nao_encaminhada:"🚫 Não encaminhada"};

  el.innerHTML=filtrados.map(o=>{
    const stClass=o.status==="aberta"?"aberta":o.status==="andamento"?"andamento":"encerrada";
    const stLabel=o.status==="aberta"?"🔴 Aberta":o.status==="andamento"?"🟡 Em Andamento":"🟢 Encerrada";
    const pendente=!o.statusCorregedoria;
    return`<div class="hist-item oc-${stClass}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <div class="hist-tipo" style="margin:0">🚨 ${esc(o.num)}</div>
        <span class="oc-badge ${stClass}">${stLabel}</span>
      </div>
      <div class="hist-data">📅 ${esc(o.data)} ${o.hora?"· "+esc(o.hora):""} · ${esc(o.tipo)}</div>
      <div class="hist-usuario">📍 ${esc(o.local)}</div>
      <div class="hist-corpo">${o.envolvidos?"Envolvidos: "+esc(o.envolvidos)+"\n":""}${o.servidor?"Servidor: "+esc(o.servidor)+"\n":""}${esc(o.desc)}\nRegistrado por: ${esc(o.registradoPor)}\nPrioridade: ${esc(o.prioridade||"Média")}</div>
      <div style="font-size:.7rem;margin-top:4px;color:${pendente?"#fbbf24":"#7dcea0"}">${pendente?"⏳ Aguardando decisão do Comando":decLabel[o.statusCorregedoria]||o.statusCorregedoria}</div>
      <label class="campo-label" style="margin-top:8px">Status da ocorrência</label>
      <select style="margin:0" onchange="alterarStatusOC('${o.id}',this.value)">
        <option value="aberta"    ${o.status==="aberta"?"selected":""}>🔴 Aberta</option>
        <option value="andamento" ${o.status==="andamento"?"selected":""}>🟡 Em Andamento</option>
        <option value="encerrada" ${o.status==="encerrada"?"selected":""}>🟢 Encerrada</option>
      </select>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
        ${pendente?`
          <button class="btn btn-sm btn-perigo" onclick="acaoComandoOC('${o.id}','encaminhar')">⚖️ Corregedoria</button>
          <button class="btn btn-sm btn-cinza" onclick="acaoComandoOC('${o.id}','nao_encaminhar')">🚫 Não encaminhar</button>`:""}
      </div>
    </div>`;
  }).join("");
}
window.renderOcorrenciasComando=renderOcorrenciasComando;

export async function acaoComandoOC(id,decisao){
  const lista=window._ocCache||carregarOC();
  const o=lista.find(x=>x.id===id);
  if(!o)return alerta("Ocorrência não encontrada.","erro");

  try{
    const snap=await getDocs(query(collection(db,COL_OC),where("id","==",id)));
    if(snap.empty)return alerta("Registro não sincronizado com o Firebase ainda. Tente novamente em instantes.","erro");
    const fbId=snap.docs[0].id;

    if(decisao==="encaminhar"){
      if(!confirm(`Encaminhar a ocorrência ${o.num} para a Corregedoria? Um protocolo será gerado.`))return;
      const protocolo=gerarProtocoloCorregedoria();
      await updateDoc(doc(db,COL_OC,fbId),{
        statusCorregedoria:"recebida",protocoloCorregedoria:protocolo,
        origemCorregedoria:"Inspetoria",dataEnvioCorregedoria:agora(),
        decididoPorComando:usuarioLogado?.nome||"",decididoComandoEm:serverTimestamp()
      });
      o.statusCorregedoria="recebida";o.protocoloCorregedoria=protocolo;
      await registrarHistoricoOcorrencia(fbId,"Comando encaminhou a ocorrência à Corregedoria",null,"recebida",`Protocolo: ${protocolo}`);
      await registrarAuditoria(`Comando encaminhou ocorrência ${o.num} à Corregedoria`,`Protocolo: ${protocolo}`);
      alerta(`Ocorrência encaminhada! Protocolo: ${protocolo}`,"ok");
      atualizarBadgeCorregedoria();
    }else{
      const obs=prompt("Motivo de não encaminhar à Corregedoria (opcional):")||"";
      await updateDoc(doc(db,COL_OC,fbId),{
        statusCorregedoria:"nao_encaminhada",justificativaComando:obs,
        decididoPorComando:usuarioLogado?.nome||"",decididoComandoEm:serverTimestamp()
      });
      o.statusCorregedoria="nao_encaminhada";
      await registrarHistoricoOcorrencia(fbId,"Comando decidiu não encaminhar à Corregedoria",null,"nao_encaminhada",obs);
      await registrarAuditoria(`Comando decidiu não encaminhar ocorrência ${o.num}`,obs);
      alerta("Decisão registrada: não encaminhada.","ok");
    }
    salvarOC(lista);
    renderOcorrenciasComando();
    atualizarBadgeCmdOc();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.acaoComandoOC=acaoComandoOC;

export async function atualizarBadgeCmdOc(){
  if(!usuarioLogado)return;
  try{
    const snap=await getDocs(query(collection(db,COL_OC)));
    const pendentes=snap.docs.filter(d=>!d.data().statusCorregedoria).length;
    const badge=document.getElementById("badge-cmd-oc");
    if(badge)badge.textContent=pendentes;
  }catch(e){}
}

export function compartilharOC(id){
  const o=(window._ocCache||carregarOC()).find(x=>x.id===id);
  if(!o)return;
  const tel=prompt("WhatsApp (DDD+número):");if(!tel)return;
  const txt=`🚨 *OCORRÊNCIA ${o.num}*\n*Status:* ${o.status.toUpperCase()}\n*Tipo:* ${o.tipo}\n*Local:* ${o.local}\n*Data:* ${o.data} ${o.hora||""}\n${o.envolvidos?"*Envolvidos:* "+o.envolvidos+"\n":""}${o.desc?"\n"+o.desc+"\n":""}\n*Polícia Municipal de Caruaru*`;
  window.open(`https://wa.me/55${tel.replace(/\D/g,"")}?text=${encodeURIComponent(txt)}`,"_blank");
}
window.compartilharOC=compartilharOC;

export function iniciarBoletim(){
  const hoje=new Date().toISOString().slice(0,10);
  if(!v("boletim-data"))document.getElementById("boletim-data").value=hoje;
}

export async function gerarBoletim(){
  const data=v("boletim-data");
  if(!data)return alerta("Selecione a data.","erro");
  await gerarBoletimData(data,"boletim-conteudo");
  document.getElementById("boletim-acoes").style.display="grid";
}
window.gerarBoletim=gerarBoletim;

export async function gerarBoletimData(data,elId){
  const el=document.getElementById(elId);
  if(!el)return;
  el.innerHTML='<p class="hist-vazio">Gerando boletim...</p>';

  let html=`<div style="background:rgba(201,168,76,.08);border:1px solid rgba(201,168,76,.3);border-radius:8px;padding:12px;margin-bottom:10px">
    <div style="font-family:'Oswald',sans-serif;font-size:.8rem;letter-spacing:2px;color:var(--dourado)">📰 BOLETIM DIÁRIO — ${data.split("-").reverse().join("/")}</div>
    <div style="font-size:.7rem;color:var(--cinza);margin-top:2px">Polícia Municipal de Caruaru · Gerado em ${agora()}</div>
  </div>`;

  // Plantão do dia
  try{
    const snap=await getDocs(query(collection(db,COL_PLANTAO),where("data","==",data)));
    const docs=snap.docs.map(d=>d.data());
    const p=docs.filter(d=>d.status==="presente").length;
    const a=docs.filter(d=>d.status==="ausente").length;
    const at=docs.filter(d=>d.status==="atrasado").length;
    html+=`<div class="hist-item" style="margin-bottom:8px">
      <div class="hist-tipo">📋 Plantão do Dia</div>
      <div class="hist-corpo">✅ Presentes: ${p} · ❌ Ausentes: ${a} · ⏰ Atrasados: ${at}\nTotal: ${docs.length} registro(s)</div>
    </div>`;
  }catch(e){}

  // Ocorrências do dia
  const ocDia=(window._ocCache||carregarOC()).filter(o=>o.data===data);
  if(ocDia.length){
    html+=`<div class="hist-item" style="margin-bottom:8px">
      <div class="hist-tipo">🚨 Ocorrências (${ocDia.length})</div>
      <div class="hist-corpo">${ocDia.map(o=>`• ${o.num} — ${o.tipo} — ${o.local} [${o.status}]`).join("\n")}</div>
    </div>`;
  }

  // Fiscalizações do dia
  try{
    const snap=await getDocs(query(collection(db,COL_FISC),where("data","==",data)));
    if(!snap.empty){
      html+=`<div class="hist-item" style="margin-bottom:8px">
        <div class="hist-tipo">🔍 Fiscalizações (${snap.size})</div>
        <div class="hist-corpo">${snap.docs.map(d=>`• ${d.data().local} — ${d.data().servidor}`).join("\n")}</div>
      </div>`;
    }
  }catch(e){}

  // O.S abertas
  try{
    const snap=await getDocs(query(collection(db,COL_OS),where("statusOS","==","ativa")));
    if(!snap.empty){
      html+=`<div class="hist-item">
        <div class="hist-tipo">📄 O.S Abertas (${snap.size})</div>
        <div class="hist-corpo">${snap.docs.map(d=>`• O.S ${d.data().numero} — ${d.data().servidor}`).join("\n")}</div>
      </div>`;
    }
  }catch(e){}

  el.innerHTML=html;
  window._boletimData=data;
}

export function exportarBoletimWA(){_exportarBoletimWAData(window._boletimData||new Date().toISOString().slice(0,10));}
window.exportarBoletimWA=exportarBoletimWA;

export function _exportarBoletimWAData(data){
  const el=document.getElementById("boletim-conteudo")||document.getElementById("dash-boletim");
  const txt=`📰 *BOLETIM DIÁRIO — ${(data||"").split("-").reverse().join("/")}*\n*Polícia Municipal de Caruaru*\n\n`+
    (el?.innerText||"").replace(/\n+/g,"\n");
  const tel=prompt("WhatsApp (DDD+número):");if(!tel)return;
  window.open(`https://wa.me/55${tel.replace(/\D/g,"")}?text=${encodeURIComponent(txt)}`,"_blank");
}

export function iniciarRelatorios(){
  const m=new Date().getMonth()+1;
  const a=new Date().getFullYear();
  document.getElementById("rel-mes").value=m;
  document.getElementById("rel-ano").value=a;
  document.getElementById("relatorio-conteudo").innerHTML='<p class="hist-vazio">Selecione um relatório acima.</p>';
}

export function reGerarRelatorioAtual(){ if(_relatorioAtual)gerarRelatorio(_relatorioAtual); }
window.reGerarRelatorioAtual=reGerarRelatorioAtual;

export async function gerarRelatorio(tipo){
  _relatorioAtual=tipo;
  const mes=v("rel-mes"),ano=v("rel-ano");
  const srvQ=(v("rel-servidor")||"").toLowerCase();
  const el=document.getElementById("relatorio-conteudo");
  el.innerHTML='<p class="hist-vazio">Gerando...</p>';
  const meses=["","Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const prefixo=`${meses[Number(mes)]} ${ano}${srvQ?` · Servidor: ${v("rel-servidor")}`:""}`;

  if(tipo==="presenca"||tipo==="geral"){
    var mapaPresenca={},textoPresenca="";
    try{
      const snap=await getDocs(query(collection(db,COL_PLANTAO)));
      const docs=snap.docs.map(d=>d.data()).filter(d=>d.data?.startsWith(`${ano}-${String(mes).padStart(2,"0")}`))
        .filter(d=>!srvQ||d.servidorNome?.toLowerCase().includes(srvQ));
      docs.forEach(d=>{
        const k=d.servidorNome||"desconhecido";
        if(!mapaPresenca[k])mapaPresenca[k]={p:0,a:0,at:0};
        if(d.status==="presente")mapaPresenca[k].p++;
        else if(d.status==="ausente")mapaPresenca[k].a++;
        else mapaPresenca[k].at++;
      });
      textoPresenca=Object.entries(mapaPresenca).map(([n,vv])=>`${n}: Presentes:${vv.p} Ausentes:${vv.a} Atrasados:${vv.at}`).join("\n")||"Sem registros.";
    }catch(e){textoPresenca="Erro: "+e.message;}
    if(tipo==="presenca"){
      let html=`<div class="hist-item"><div class="hist-tipo">✅ Presença — ${prefixo}</div><div class="hist-corpo">`;
      Object.entries(mapaPresenca).forEach(([n,vv])=>{html+=`${n}: ✅${vv.p} ❌${vv.a} ⏰${vv.at}\n`;});
      html+=`</div></div>`;
      el.innerHTML=Object.keys(mapaPresenca).length?html:'<p class="hist-vazio">Sem registros.</p>';
      _relatorioTexto=`✅ *RELATÓRIO DE PRESENÇA — ${prefixo}*\n`+textoPresenca;
      return;
    }
    // segue para o geral acumulando essa seção
    var _geralPresenca=`✅ *PRESENÇA*\n${textoPresenca}`;
  }
  if(tipo==="ocorrencias"||tipo==="geral"){
    const oc=(window._ocCache||carregarOC()).filter(o=>o.data?.startsWith(`${ano}-${String(mes).padStart(2,"0")}`))
      .filter(o=>!srvQ||o.servidor?.toLowerCase().includes(srvQ)||o.envolvidos?.toLowerCase().includes(srvQ));
    const txtOc=oc.length?oc.map(o=>`${o.num} · ${o.tipo} · ${o.local} [${o.status}]`).join("\n"):"Sem ocorrências.";
    if(tipo==="ocorrencias"){
      el.innerHTML=oc.length?`<div class="hist-item"><div class="hist-tipo">🚨 Ocorrências — ${prefixo} (${oc.length})</div><div class="hist-corpo">${txtOc}</div></div>`:'<p class="hist-vazio">Sem ocorrências.</p>';
      _relatorioTexto=`🚨 *OCORRÊNCIAS — ${prefixo}*\n`+txtOc;
      return;
    }
    var _geralOc=`🚨 *OCORRÊNCIAS* (${oc.length})\n${txtOc}`;
  }
  if(tipo==="os"||tipo==="geral"){
    var txtOs="Sem O.S.",qtdOs=0;
    try{
      const snap=await getDocs(query(collection(db,COL_OS)));
      const docs=snap.docs.map(d=>d.data()).filter(d=>d.dataInicio?.startsWith(`${ano}-${String(mes).padStart(2,"0")}`))
        .filter(d=>!srvQ||d.servidor?.toLowerCase().includes(srvQ));
      qtdOs=docs.length;
      txtOs=docs.length?docs.map(d=>`O.S ${d.numero} · ${d.servidor} · ${d.statusOS||"ativa"}`).join("\n"):"Sem O.S.";
    }catch(e){txtOs="Erro: "+e.message;}
    if(tipo==="os"){
      el.innerHTML=qtdOs?`<div class="hist-item"><div class="hist-tipo">📄 O.S — ${prefixo} (${qtdOs})</div><div class="hist-corpo">${txtOs}</div></div>`:'<p class="hist-vazio">Sem O.S.</p>';
      _relatorioTexto=`📄 *ORDENS DE SERVIÇO — ${prefixo}*\n`+txtOs;
      return;
    }
    var _geralOs=`📄 *ORDENS DE SERVIÇO* (${qtdOs})\n${txtOs}`;
  }
  if(tipo==="horas"||tipo==="geral"){
    let bh=[];
    try{
      const snapBh=await getDocs(collection(db,COL_BH));
      bh=snapBh.docs.map(d=>d.data())
        .filter(l=>l.data?.startsWith(`${ano}-${String(mes).padStart(2,"0")}`))
        .filter(l=>!srvQ||l.srvNome?.toLowerCase().includes(srvQ));
    }catch(e){}
    const txtBh=bh.length?bh.map(l=>`${l.srvNome} · ${l.tipo} · ${l.qtd}h${l.obs?" ("+l.obs+")":""}`).join("\n"):"Sem lançamentos.";
    if(tipo==="horas"){
      el.innerHTML=bh.length?`<div class="hist-item"><div class="hist-tipo">⏱ Banco de Horas — ${prefixo}</div><div class="hist-corpo">${txtBh}</div></div>`:'<p class="hist-vazio">Sem lançamentos.</p>';
      _relatorioTexto=`⏱ *BANCO DE HORAS — ${prefixo}*\n`+txtBh;
      return;
    }
    var _geralHoras=`⏱ *BANCO DE HORAS*\n${txtBh}`;
  }
  if(tipo==="geral"){
    const secoes=[_geralPresenca,_geralOc,_geralOs,_geralHoras];
    el.innerHTML=`<div class="hist-item"><div class="hist-tipo">📊 Relatório Geral do Administrativo — ${prefixo}</div>`+
      secoes.map(s=>`<div class="hist-corpo" style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.08)">${s.replace(/\*/g,"")}</div>`).join("")+
      `</div>`;
    _relatorioTexto=`📊 *RELATÓRIO GERAL DO ADMINISTRATIVO — ${prefixo}*\n\n`+secoes.join("\n\n");
  }
}
window.gerarRelatorio=gerarRelatorio;

export function exportarRelatorioWA(){
  if(!_relatorioTexto)return alerta("Gere um relatório primeiro.","aviso");
  const tel=prompt("WhatsApp (DDD+número):");if(!tel)return;
  const txt=_relatorioTexto+`\n\nGerado em: ${agora()}\nPolícia Municipal de Caruaru`;
  window.open(`https://wa.me/55${tel.replace(/\D/g,"")}?text=${encodeURIComponent(txt)}`,"_blank");
}
window.exportarRelatorioWA=exportarRelatorioWA;

export async function enviarOcorrenciaParaCorregedoria(ocorrencia){
  const num=`PAD-${new Date().getFullYear()}/${Date.now().toString().slice(-4)}`;
  try{
    const padDoc=await addDoc(collection(db,COL_PAD),{
      numero:num,
      data:ocorrencia.data||new Date().toISOString().slice(0,10),
      servidor:ocorrencia.envolvidos||"A identificar",
      origem:"Inspetoria",
      responsavel:"",
      desc:`Ocorrência registrada automaticamente pela Inspetoria:\n\nNº: ${ocorrencia.num}\nTipo: ${ocorrencia.tipo}\nLocal: ${ocorrencia.local}\n\n${ocorrencia.desc||""}`,
      status:"recebido",
      fotos:[],
      registradoPor:usuarioLogado?.nome||"Sistema",
      registradoEmail:usuarioLogado?.email||"",
      ocorrenciaOrigem:ocorrencia.id||"",
      criadoEm:serverTimestamp()
    });
    await registrarAuditoria(`Ocorrência enviada para Corregedoria: ${num}`,`Origem: ${ocorrencia.num}`);
    alerta(`Ocorrência enviada para Corregedoria como ${num}!`,"ok");
    return num;
  }catch(err){console.warn("Corregedoria:",err.message);}
}
window.enviarOcorrenciaParaCorregedoria=enviarOcorrenciaParaCorregedoria;

export async function carregarCentralAdministrativa(){
  document.getElementById("cadm-data").textContent=`📅 ${agora()}`;
  let ativos=0,inativos=0,vtrDisp=0,armasAcaut=0,coletesDisp=0,padPend=0,diasEscala=0,
      horasExtrasMes=0,emFerias=0,emLicenca=0,qtdOc=0,qtdOs=0,pendencias=0;
  const alertas=[];
  const mesAtual=new Date().toISOString().slice(0,7);

  try{
    const snap=await getDocs(collection(db,COL_SERV));
    const servs=snap.docs.map(d=>d.data());
    ativos=servs.filter(s=>s.ativo!==false).length;
    inativos=servs.filter(s=>s.ativo===false).length;
  }catch(e){}

  try{ await carregarViaturasCache(); vtrDisp=_viaturasCache.filter(v=>v.situacao==="disponivel").length; }catch(e){}

  try{
    const snap=await getDocs(collection(db,COL_ARMAS_IND));
    armasAcaut=snap.docs.filter(d=>!!d.data().acautelamento).length;
  }catch(e){}

  try{
    const snap=await getDocs(collection(db,COL_COLETES));
    const coletes=snap.docs.map(d=>d.data());
    coletesDisp=coletes.filter(c=>c.situacao==="Reserva"||c.situacao==="Disponível").length;
    coletes.forEach(c=>{
      const d=diasParaVencer(c.dataValidade);
      if(d!==null&&d<=30)alertas.push(d<0?`🔴 Colete vencido (patr. ${c.patrimonio||"—"})`:`🟡 Colete vence em ${d} dia(s) (patr. ${c.patrimonio||"—"})`);
    });
  }catch(e){}

  let padsData=[];
  try{
    const snap=await getDocs(collection(db,COL_PAD));
    padsData=snap.docs.map(d=>d.data());
    padPend=padsData.filter(p=>p.status!=="arquivado").length;
    padsData.filter(p=>p.status!=="arquivado"&&p.prazo).forEach(p=>{
      const d=diasParaVencer(p.prazo);
      if(d!==null&&d<=7)alertas.push(d<0?`🔴 PAD ${p.numero} com prazo vencido`:`🟡 PAD ${p.numero} vence em ${d} dia(s)`);
    });
  }catch(e){}

  try{
    const snapEsc=await getDoc(doc(db,COL_ESCALA_MENSAL,mesAtual));
    diasEscala=snapEsc.exists()?Object.keys(snapEsc.data().dias||{}).length:0;
  }catch(e){}

  // Banco de Horas — total de horas extras lançadas no mês corrente (só aprovadas)
  try{
    const snap=await getDocs(collection(db,COL_BH));
    horasExtrasMes=snap.docs.map(d=>d.data())
      .filter(l=>l.tipo==="extra"&&(!l.status||l.status==="aprovada")&&l.data?.startsWith(mesAtual))
      .reduce((s,l)=>s+Number(l.qtd||0),0);
  }catch(e){}

  // Servidores em férias/licença — com base na marcação mais recente no Plantão do mês corrente
  try{
    const snap=await getDocs(collection(db,COL_PLANTAO));
    const regsMes=snap.docs.map(d=>d.data()).filter(r=>r.data?.startsWith(mesAtual));
    const feriasSet=new Set(regsMes.filter(r=>r.marcacao==="Férias").map(r=>r.servidorNome));
    const licencaSet=new Set(regsMes.filter(r=>MARCACOES_LICENCA.includes(r.marcacao)).map(r=>r.servidorNome));
    emFerias=feriasSet.size;
    emLicenca=licencaSet.size;
  }catch(e){}

  // Ocorrências e Ordens de Serviço
  try{ qtdOc=(window._ocCache||carregarOC()).length; }catch(e){}
  let osPendentes=0;
  try{
    const snap=await getDocs(collection(db,COL_OS));
    const osDocs=snap.docs.map(d=>d.data());
    qtdOs=osDocs.length;
    osPendentes=osDocs.filter(o=>o.statusComando==="pendente").length;
  }catch(e){}

  // Pendências gerais: PADs em aberto + O.S aguardando decisão do Comando + ocorrências aguardando decisão
  let ocPendentes=0;
  try{ ocPendentes=(window._ocCache||carregarOC()).filter(o=>!o.statusCorregedoria&&o.status!=="encerrada").length; }catch(e){}
  pendencias=padPend+osPendentes+ocPendentes;

  document.getElementById("cadm-ativos").textContent=ativos;
  document.getElementById("cadm-inativos").textContent=inativos;
  document.getElementById("cadm-horas-extras").textContent=`${horasExtrasMes}h`;
  document.getElementById("cadm-ferias").textContent=emFerias;
  document.getElementById("cadm-licenca").textContent=emLicenca;
  document.getElementById("cadm-oc").textContent=qtdOc;
  document.getElementById("cadm-os").textContent=qtdOs;
  document.getElementById("cadm-pendencias").textContent=pendencias;
  document.getElementById("cadm-vtr").textContent=vtrDisp;
  document.getElementById("cadm-armas").textContent=armasAcaut;
  document.getElementById("cadm-coletes").textContent=coletesDisp;
  document.getElementById("cadm-pad").textContent=padPend;
  document.getElementById("cadm-escalas").textContent=diasEscala;

  const elA=document.getElementById("cadm-alertas");
  elA.innerHTML=alertas.length?alertas.map(a=>`<div class="sit-alerta ${a.startsWith("🔴")?"critico":"importante"}">${a}</div>`).join("")
    :'<div class="sit-alerta info">🟢 Nenhum alerta no momento.</div>';
}
window.carregarCentralAdministrativa=carregarCentralAdministrativa;

