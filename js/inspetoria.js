import { addDoc, collection, deleteDoc, doc, getDocs, query, serverTimestamp, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { COL_FISC, COL_OS, COL_SERV, COL_USUARIOS, FISC_MAP, alerta, db, enviarNotificacao, esc, ir, registrarAuditoria, usuarioLogado, v } from "./core.js";

export function iniciarFiscTela(id){
  const local=FISC_MAP[id],histId="hist-"+id,el=document.getElementById(id);
  const hoje=new Date().toISOString().slice(0,10);
  el.innerHTML=`
    <button class="btn btn-voltar no-print" onclick="ir('fiscalizacao')">← Voltar</button>
    <div class="secao-titulo">🔍 ${local}</div>
    <label class="campo-label">Inspetor responsável</label>
    <input type="text" id="fisc-srv-${id}" readonly style="opacity:.85" value="${usuarioLogado?.nome||""}">
    <label class="campo-label">Jornada</label>
    <select id="fisc-jornada-${id}">
      <option value="Ordinário">☀️ Ordinário</option>
      <option value="Extraordinário">⚡ Extraordinário</option>
      <option value="Compensando">🔄 Compensando</option>
    </select>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div><label class="campo-label">Data</label><input type="date" id="fisc-data-${id}" value="${hoje}"></div>
      <div><label class="campo-label">Hora Início</label><input type="time" id="fisc-hora-${id}"></div>
    </div>
    <label class="campo-label">Hora Término</label>
    <input type="time" id="fisc-horafim-${id}">
    <label class="campo-label">Observação</label>
    <textarea id="fisc-obs-${id}" placeholder="Ocorrências, situação encontrada..."></textarea>
    <button class="btn btn-full btn-dourado" style="margin-top:10px" onclick="registrarFisc('${id}','${local}')">💾 Registrar Fiscalização</button>
    <button class="btn btn-full btn-cinza" style="margin-top:6px;font-size:.78rem" onclick="ir('${histId}')">📋 Ver Histórico</button>`;
}

export async function registrarFisc(tela,local){
  const srv  = v(`fisc-srv-${tela}`);
  const data = v(`fisc-data-${tela}`);
  const hora = v(`fisc-hora-${tela}`);
  const horafim = v(`fisc-horafim-${tela}`);
  const jornada = v(`fisc-jornada-${tela}`)||"Ordinário";
  const obs  = v(`fisc-obs-${tela}`);
  if(!srv||!data||!hora)return alerta("Preencha inspetor, data e hora início.","erro");
  try{
    await addDoc(collection(db,COL_FISC),{
      local,servidor:srv,data,hora,horafim,jornada,obs,
      statusComando:"pendente",
      supervisorNome:usuarioLogado?.nome||"",
      supervisorEmail:usuarioLogado?.email||"",
      criadoEm:serverTimestamp()
    });
    await registrarAuditoria(`Fiscalização registrada: ${local}`,`Inspetor: ${srv} | Jornada: ${jornada} | ${data} ${hora}–${horafim||"?"}`);
    alerta(`Fiscalização — ${local} registrada!`,"ok");
    [`fisc-obs-${tela}`,`fisc-hora-${tela}`,`fisc-horafim-${tela}`]
      .forEach(id=>{const el=document.getElementById(id);if(el)el.value="";});
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.registrarFisc=registrarFisc;

export async function renderHistFisc(histId){
  const tela=histId.replace("hist-",""),local=FISC_MAP[tela],el=document.getElementById(histId);
  el.innerHTML=`
    <button class="btn btn-voltar no-print" onclick="ir('${tela}')">← Voltar</button>
    <div class="secao-titulo">📋 Histórico — ${local}</div>
    <div class="hist-contador" id="cnt-${histId}"></div>
    <div id="lista-${histId}" class="hist-scroll"><p class="hist-vazio">Carregando...</p></div>
    <button class="btn btn-full btn-cinza" style="margin-top:10px" onclick="window.print()">🖨 Imprimir</button>`;
  try{
    const snap=await getDocs(query(collection(db,COL_FISC),where("local","==",local)));
    const docs=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.criadoEm?.seconds||0)-(a.criadoEm?.seconds||0));
    document.getElementById(`cnt-${histId}`).textContent=docs.length?`${docs.length} registro(s)`:"";
    document.getElementById(`lista-${histId}`).innerHTML=!docs.length
      ?'<p class="hist-vazio">Nenhum registro.</p>'
      :docs.map(d=>{const r=d;return`<div class="hist-item">
          <div class="hist-tipo">🔍 ${esc(r.local)}</div>
          <div class="hist-data">📅 ${r.data} · ${r.hora}${r.horafim?" – "+r.horafim:""}</div>
          <div class="hist-usuario">👮 ${esc(r.servidor)}</div>
          <div class="hist-corpo">${esc(r.obs)||"Sem observações"}\nSupervisor: ${esc(r.supervisorNome)}</div>
        </div>`;}).join("");
  }catch(err){document.getElementById(`lista-${histId}`).innerHTML=`<p class="hist-vazio">Erro: ${err.message}</p>`;}
}

export function toggleDestinoOS(p){
  const destino=v(`os-${p}-notif`);
  document.getElementById(`os-${p}-modulo-alvo`).style.display=destino==="modulo"?"block":"none";
  document.getElementById(`os-${p}-servidor-alvo`).style.display=destino==="outro_servidor"?"block":"none";
}
window.toggleDestinoOS=toggleDestinoOS;

export async function registrarOS(tipo){
  const p=tipo==="temporaria"?"temp":"perm";
  const num=v(`os-${p}-num`),srv=v(`os-${p}-servidor`),mat=v(`os-${p}-mat`),
        ini=v(`os-${p}-inicio`),desc=v(`os-${p}-desc`);
  const fim=tipo==="temporaria"?v("os-temp-fim"):"indeterminado";
  if(!num||!srv||!ini)return alerta("Preencha Nº, servidor e data início.","erro");
  try{
    await addDoc(collection(db,COL_OS),{
      tipo,numero:num,servidor:srv,matricula:mat,dataInicio:ini,dataFim:fim,descricao:desc,
      statusOS:"ativa", // ativa | concluida | cancelada
      statusComando:"pendente",
      supervisorNome:usuarioLogado?.nome||"",supervisorEmail:usuarioLogado?.email||"",
      criadoEm:serverTimestamp()
    });
    alerta(`O.S ${num} registrada com sucesso!`,"ok");
    const destino=v(`os-${p}-notif`)||"nenhum";
    const moduloAlvo=v(`os-${p}-modulo-alvo`),servidorAlvo=v(`os-${p}-servidor-alvo`);
    await notificarOS(destino,tipo,num,srv,ini,fim,desc,moduloAlvo,servidorAlvo);
    ["num","servidor","mat","inicio","fim","desc","servidor-alvo"].forEach(c=>{const el=document.getElementById(`os-${p}-${c}`);if(el)el.value="";});
    // vai direto para o histórico após registrar
    ir(`hist-os-${tipo}`);
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.registrarOS=registrarOS;

export async function notificarOS(destino,tipo,numero,srv,ini,fim,desc,moduloAlvo,servidorAlvo){
  if(destino==="nenhum")return;
  const ic=tipo==="temporaria"?"⏳":"♾";
  const titulo=`${ic} Nova O.S — ${numero}`;
  const corpo=`Servidor: ${srv}\nPeríodo: ${ini}${fim&&fim!=="indeterminado"?" a "+fim:""}\n${desc?"Descrição: "+desc+"\n":""}Emitido por: ${usuarioLogado?.nome||""}`;
  try{
    if(destino==="todos"){
      const snap=await getDocs(query(collection(db,COL_USUARIOS),where("status","==","aprovado")));
      const enviados=new Set();
      for(const d of snap.docs){
        const u=d.data();
        if(u.email&&!enviados.has(u.email)){enviados.add(u.email);await enviarNotificacao(u.email,titulo,corpo,"meupainel");}
      }
      alerta("Notificação enviada a todos os servidores.","ok");

    }else if(destino==="modulo"){
      if(!moduloAlvo)return alerta("Selecione o módulo de destino.","erro");
      const snap=await getDocs(query(collection(db,COL_USUARIOS),where("status","==","aprovado")));
      const enviados=new Set();
      let count=0;
      for(const d of snap.docs){
        const u=d.data();
        const temAcesso=!(moduloAlvo in (u.permissoes||{}))||u.permissoes[moduloAlvo]!==false;
        if(u.email&&temAcesso&&!enviados.has(u.email)){enviados.add(u.email);await enviarNotificacao(u.email,titulo,corpo,moduloAlvo);count++;}
      }
      alerta(`Notificação enviada a ${count} servidor(es) do módulo selecionado.`,"ok");

    }else if(destino==="outro_servidor"){
      if(!servidorAlvo)return alerta("Informe o nome do servidor a notificar.","erro");
      let email=null;
      const uSnap=await getDocs(query(collection(db,COL_USUARIOS),where("status","==","aprovado")));
      const match=uSnap.docs.find(d=>d.data().nome?.toLowerCase().includes(servidorAlvo.toLowerCase()));
      if(match)email=match.data().email;
      if(!email){
        const sSnap=await getDocs(collection(db,COL_SERV));
        const matchS=sSnap.docs.find(d=>d.data().nome?.toLowerCase().includes(servidorAlvo.toLowerCase()));
        if(matchS)email=matchS.data().email;
      }
      if(email){await enviarNotificacao(email,titulo,corpo,"meupainel");alerta(`Notificação enviada a ${servidorAlvo}.`,"ok");}
      else alerta("Servidor não encontrado ou sem e-mail cadastrado.","aviso");

    }else if(destino==="servidor"){
      let email=null;
      const sSnap=await getDocs(query(collection(db,COL_SERV),where("nome","==",srv)));
      if(!sSnap.empty)email=sSnap.docs[0].data().email;
      if(!email){
        const uSnap=await getDocs(query(collection(db,COL_USUARIOS),where("status","==","aprovado")));
        const match=uSnap.docs.find(d=>d.data().nome?.toLowerCase()===srv.toLowerCase());
        if(match)email=match.data().email;
      }
      if(email){await enviarNotificacao(email,titulo,corpo,"meupainel");alerta(`Notificação enviada a ${srv}.`,"ok");}
      else alerta("Servidor sem e-mail cadastrado — notificação não enviada.","aviso");
    }
  }catch(e){console.warn("notificarOS:",e.message);}
}

export async function renderHistOS(tipo){
  const lista=document.getElementById(`lista-os-${tipo}`),cont=document.getElementById(`contador-os-${tipo}`);
  lista.innerHTML='<p class="hist-vazio">Carregando...</p>';

  // barra de seleção para exclusão
  const barraId=`os-sel-bar-${tipo}`;
  let barra=document.getElementById(barraId);
  if(!barra){
    barra=document.createElement("div");
    barra.id=barraId;
    barra.style.cssText="display:none;background:rgba(192,57,43,.15);border:1px solid rgba(192,57,43,.4);border-radius:8px;padding:10px 12px;margin-bottom:10px;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap";
    lista.parentNode.insertBefore(barra,lista);
  }
  barra.innerHTML=`
    <span id="os-sel-cnt-${tipo}" style="font-size:.8rem;color:#f1948a;font-family:'Oswald',sans-serif;letter-spacing:1px">0 selecionada(s)</span>
    <div style="display:flex;gap:6px">
      <button class="btn btn-sm btn-perigo" onclick="excluirOSSelecionadas('${tipo}')">🗑 Excluir</button>
      <button class="btn btn-sm btn-cinza"  onclick="desmarcarOS('${tipo}')">✕ Cancelar</button>
    </div>`;

  const osSelecionadas=new Set();
  window[`osSel_${tipo}`]=osSelecionadas;

  try{
    const snap=await getDocs(query(collection(db,COL_OS),where("tipo","==",tipo)));
    const docs=snap.docs.map(d=>({id:d.id,...d.data()}))
      .sort((a,b)=>(b.criadoEm?.seconds||0)-(a.criadoEm?.seconds||0));
    cont.textContent=docs.length?`${docs.length} O.S registrada(s)`:"";

    // busca usuários aprovados para select
    let usuariosOpts='<option value="">Selecione usuário...</option>';
    let usuariosWA=[];
    try{
      const uSnap=await getDocs(query(collection(db,COL_USUARIOS),where("status","==","aprovado")));
      uSnap.docs.forEach(d=>{
        const u=d.data();
        usuariosOpts+=`<option value="${u.email}" data-nome="${u.nome}">${u.nome}</option>`;
        usuariosWA.push({nome:u.nome,email:u.email});
      });
    }catch(e){}

    // busca servidores do plantão (têm número de telefone eventualmente)
    let srvOpts='<option value="">Selecione servidor...</option>';
    try{
      const sSnap=await getDocs(collection(db,COL_SERV));
      sSnap.docs.forEach(d=>{
        const s=d.data();
        if(s.telefone)srvOpts+=`<option value="${s.telefone}" data-nome="${esc(s.nome)}">${esc(s.nome)} — ${s.telefone}</option>`;
      });
    }catch(e){}

    lista.innerHTML=docs.length?docs.map(d=>{
      const ic=tipo==="temporaria"?"⏳":"♾";
      const sColor=d.statusOS==="concluida"?"#7dcea0":d.statusOS==="cancelada"?"#f1948a":"#e8c96b";
      const sLabel=d.statusOS==="concluida"?"✅ Concluída":d.statusOS==="cancelada"?"❌ Cancelada":"🟡 Ativa";
      const descEsc=(d.descricao||"").replace(/'/g,"\\'");
      return`<div class="hist-item" id="os-card-${d.id}" style="position:relative">
        <!-- CHECKBOX SELEÇÃO -->
        <div style="display:flex;align-items:flex-start;gap:8px">
          <input type="checkbox" class="os-chk" data-id="${d.id}"
            style="width:18px;height:18px;accent-color:#c0392b;flex-shrink:0;margin-top:3px;cursor:pointer"
            onchange="toggleOSSel('${tipo}','${d.id}',this.checked)">
          <div style="flex:1">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <div class="hist-tipo" style="margin:0">${ic} O.S ${d.numero}</div>
              <span style="font-size:.68rem;font-family:'Oswald',sans-serif;letter-spacing:1px;color:${sColor}">${sLabel}</span>
            </div>
            <div class="hist-data">📅 Início: ${d.dataInicio} · Fim: ${d.dataFim||"indeterminado"}</div>
            <div class="hist-usuario">👮 ${esc(d.servidor)} · Mat: ${esc(d.matricula)||"—"}</div>
            <div class="hist-corpo" style="margin-bottom:8px">${esc(d.descricao)||"Sem descrição"}\nSupervisor: ${esc(d.supervisorNome)}</div>

            <!-- STATUS -->
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;margin-bottom:8px">
              <button class="btn btn-sm btn-verde"  onclick="alterarStatusOS('${d.id}','concluida','${tipo}')">✅ Concluir</button>
              <button class="btn btn-sm btn-perigo" onclick="alterarStatusOS('${d.id}','cancelada','${tipo}')">❌ Cancelar</button>
              <button class="btn btn-sm" style="background:rgba(30,100,200,.3);border-color:rgba(30,100,200,.5);color:#90c2fa;font-size:.62rem"
                onclick="alterarStatusOS('${d.id}','ativa','${tipo}')">🔄 Reativar</button>
            </div>

            <!-- ENVIO -->
            <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:10px">
              <div style="font-family:'Oswald',sans-serif;font-size:.68rem;letter-spacing:2px;color:var(--cinza);margin-bottom:8px">📤 ENVIAR O.S</div>

              <!-- WHATSAPP APENAS -->
              <div>
                <div style="font-size:.65rem;color:var(--cinza);margin-bottom:4px;font-family:'Oswald',sans-serif;letter-spacing:1px">📱 ENVIAR VIA WHATSAPP</div>
                <input type="tel" id="os-wa-${d.id}" placeholder="DDD + número (ex: 81999887766)"
                  style="margin:0 0 5px;font-size:.82rem">
                <button class="btn btn-full btn-sm" style="background:linear-gradient(135deg,#25d366,#128c7e);border-color:#25d366;color:#fff"
                  onclick="enviarOSWhatsApp('${d.id}','${d.numero}','${d.servidor}','${d.dataInicio}','${d.dataFim||"indeterminado"}','${tipo}','${descEsc}')">
                  💬 Enviar pelo WhatsApp
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>`;}).join("")
    :'<p class="hist-vazio">Nenhuma O.S registrada ainda.</p>';

    // eventos checkbox
    lista.querySelectorAll(".os-chk").forEach(chk=>{
      chk.addEventListener("change",()=>{});// já tem onchange inline
    });

  }catch(err){lista.innerHTML=`<p class="hist-vazio">Erro: ${err.message}</p>`;}
}

export function toggleOSSel(tipo,id,checked){
  const sel=window[`osSel_${tipo}`];if(!sel)return;
  if(checked)sel.add(id);else sel.delete(id);
  const n=sel.size;
  const barra=document.getElementById(`os-sel-bar-${tipo}`);
  if(barra)barra.style.display=n>0?"flex":"none";
  const cnt=document.getElementById(`os-sel-cnt-${tipo}`);
  if(cnt)cnt.textContent=`${n} selecionada(s)`;
}
window.toggleOSSel=toggleOSSel;

export function desmarcarOS(tipo){
  const sel=window[`osSel_${tipo}`];if(sel)sel.clear();
  document.querySelectorAll(".os-chk").forEach(c=>c.checked=false);
  const barra=document.getElementById(`os-sel-bar-${tipo}`);
  if(barra)barra.style.display="none";
}
window.desmarcarOS=desmarcarOS;

export async function excluirOSSelecionadas(tipo){
  const sel=window[`osSel_${tipo}`];
  if(!sel||!sel.size)return;
  if(!confirm(`Excluir ${sel.size} O.S permanentemente?`))return;
  try{
    for(const id of sel)await deleteDoc(doc(db,COL_OS,id));
    alerta(`${sel.size} O.S excluída(s).`,"aviso");
    renderHistOS(tipo);
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.excluirOSSelecionadas=excluirOSSelecionadas;

export async function enviarOSWhatsApp(id,numero,servidor,dataInicio,dataFim,tipo,desc){
  const tel=(document.getElementById(`os-wa-${id}`)?.value||"").replace(/\D/g,"");
  if(!tel||tel.length<10)return alerta("Digite um número de WhatsApp válido com DDD.","erro");
  const ic=tipo==="temporaria"?"⏳":"♾";
  const txt=
    `${ic} *ORDEM DE SERVIÇO — ${tipo.toUpperCase()}*\n\n`+
    `*Nº:* ${numero}\n`+
    `*Servidor:* ${servidor}\n`+
    `*Período:* ${dataInicio} a ${dataFim}\n`+
    (desc?`*Descrição:* ${desc}\n`:"")+
    `\n*Emitido por:* ${usuarioLogado?.nome||""}\n`+
    `*Polícia Municipal de Caruaru*`;
  window.open(`https://wa.me/55${tel}?text=${encodeURIComponent(txt)}`,"_blank");

  // tenta enviar notificação in-app para o usuário que tem esse número
  try{
    const sSnap=await getDocs(query(collection(db,COL_SERV),where("telefone","==",tel)));
    if(!sSnap.empty){
      const srv=sSnap.docs[0].data();
      if(srv.email){
        await enviarNotificacao(srv.email,`${ic} Nova O.S — ${numero}`,
          `Servidor: ${servidor}\nPeríodo: ${dataInicio} a ${dataFim}\n${desc?"Descrição: "+desc+"\n":""}Emitido por: ${usuarioLogado?.nome||""}`,"inspetoria");
      }
    }
    // também tenta por e-mail do usuário cadastrado que tem o mesmo nome
    const uSnap=await getDocs(query(collection(db,COL_USUARIOS),where("status","==","aprovado")));
    uSnap.docs.forEach(async d=>{
      const u=d.data();
      if(u.nome?.toLowerCase()===servidor.toLowerCase()&&u.email){
        await enviarNotificacao(u.email,`${ic} Nova O.S — ${numero}`,
          `Período: ${dataInicio} a ${dataFim}\n${desc?"Descrição: "+desc+"\n":""}Emitido por: ${usuarioLogado?.nome||""}`,"inspetoria");
      }
    });
  }catch(e){}
}
window.enviarOSWhatsApp=enviarOSWhatsApp;

