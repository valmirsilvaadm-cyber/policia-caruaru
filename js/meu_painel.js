import { collection, doc, getDocs, onSnapshot, query, serverTimestamp, updateDoc, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { carregarDadosSensiveisServidor } from "./administrativo.js";
import { COL_ARMAS_IND, COL_BH, COL_COLETES, COL_NOTIF, COL_PERMUTAS, COL_PLANTAO, COL_SERV, _plantaoAssuncaoAtual, _unsubAssuncaoPlantao, alerta, atualizarSireneMeuPainel, auth, db, esc, normalizarMatricula, registrarAuditoria, usuarioLogado } from "./core.js";
import { carregarOC } from "./ocorrencias.js";
import { calcularSaldoBH } from "./plantao.js";

export function iniciarAssuncaoPlantaoServidor(){
  const box=document.getElementById("map-status-box");
  const btn=document.getElementById("btn-assumir-plantao");
  const hint=document.getElementById("map-hint");
  if(!usuarioLogado||!usuarioLogado.matricula){
    box.innerHTML='<p class="hist-vazio">Não foi possível identificar sua matrícula.</p>';
    return;
  }
  const hoje=new Date().toISOString().slice(0,10);
  box.innerHTML='<p class="hist-vazio">Carregando plantão de hoje...</p>';

  // Antes, comparava servidorMat==matrícula direto no Firestore (where exato). Qualquer
  // diferença de formatação (espaço, maiúscula, zero à esquerda) entre a matrícula
  // digitada no cadastro do usuário e a digitada no efetivo da Inspetoria fazia a busca
  // não encontrar nada — e o botão nunca liberava mesmo com o inspetor autorizando certo.
  // Agora busca todos os plantões de hoje e compara a matrícula de forma tolerante.
  const minhaMat=normalizarMatricula(usuarioLogado.matricula);
  const qRef=query(collection(db,COL_PLANTAO),where("data","==",hoje));

  if(_unsubAssuncaoPlantao)_unsubAssuncaoPlantao();
  _unsubAssuncaoPlantao=onSnapshot(qRef,(snap)=>{
    const docsHoje=snap.docs.map(d=>({id:d.id,...d.data()}))
      .filter(p=>normalizarMatricula(p.servidorMat)===minhaMat);
    if(!docsHoje.length){
      _plantaoAssuncaoAtual=null;
      box.innerHTML='<p class="hist-vazio">Nenhum plantão registrado para você hoje.</p>';
      setBotaoAssuncao("bloqueado","Aguardando registro de presença pelo inspetor.");
      return;
    }
    // pega o plantão mais recente do dia (caso haja mais de um registro)
    const docs=docsHoje.sort((a,b)=>(b.criadoEm?.seconds||0)-(a.criadoEm?.seconds||0));
    const p=docs[0];
    _plantaoAssuncaoAtual=p;

    box.innerHTML=`<div class="hist-item" style="border-left-color:var(--dourado)">
      <div class="hist-tipo">📋 Plantão Nº ${p.numeroPlantao||"—"}</div>
      <div class="hist-data">📅 ${p.data} · ${p.jornada||"—"} · ${p.unidade||"—"}</div>
      <div class="hist-corpo">Entrada: ${p.entrada||"—"} · Inspetor: ${p.inspetor||p.supervisorNome||"—"}</div>
    </div>`;

    if(p.confirmadoPeloServidor){
      setBotaoAssuncao("assumido",
        `✅ Plantão assumido por você em ${p.confirmadoEm?.toDate?p.confirmadoEm.toDate().toLocaleString("pt-BR"):"—"}.`);
    }else if(p.autorizadoAssuncao){
      setBotaoAssuncao("liberado",
        `🔓 Autorizado por ${p.autorizadoPor||"—"}. Toque no botão para confirmar.`);
    }else{
      setBotaoAssuncao("bloqueado","Aguardando autorização do inspetor.");
    }
  },(err)=>{
    box.innerHTML=`<p class="hist-vazio">Erro ao carregar: ${err.message}</p>`;
  });
}

export function setBotaoAssuncao(estado,mensagem){
  const btn=document.getElementById("btn-assumir-plantao");
  const hint=document.getElementById("map-hint");
  if(!btn)return;
  btn.classList.remove("liberado","assumido");
  if(estado==="liberado"){
    btn.disabled=false;btn.style.cursor="pointer";
    btn.classList.add("liberado");
    btn.innerHTML="✅ Assumir Plantão";
  }else if(estado==="assumido"){
    btn.disabled=true;
    btn.classList.add("assumido");
    btn.innerHTML="🎖 Plantão Assumido";
  }else{
    btn.disabled=true;btn.style.cursor="not-allowed";
    btn.innerHTML="🔒 Assumir Plantão";
  }
  if(hint)hint.textContent=mensagem||"";
}

export async function confirmarAssuncaoPlantao(){
  const p=_plantaoAssuncaoAtual;
  if(!p)return alerta("Nenhum plantão carregado.","erro");
  if(!p.autorizadoAssuncao)return alerta("Aguarde a autorização do inspetor.","aviso");
  if(p.confirmadoPeloServidor)return alerta("Este plantão já foi confirmado.","aviso");
  if(!auth.currentUser)return alerta("Sessão inválida — faça login novamente.","erro");
  if(!confirm(`Confirmar assunção do Plantão Nº ${p.numeroPlantao}?\n\nEssa ação registra seu nome, horário e não poderá ser desfeita.`))return;

  const btn=document.getElementById("btn-assumir-plantao");
  btn.disabled=true;btn.innerHTML="Confirmando...";
  try{
    await updateDoc(doc(db,COL_PLANTAO,p.id),{
      confirmadoPeloServidor:true,
      confirmadoUid:auth.currentUser.uid,
      confirmadoNome:usuarioLogado.nome||"",
      confirmadoEm:serverTimestamp(),
      statusAssuncao:"Plantão Assumido"
    });
    await registrarAuditoria("Servidor confirmou assunção de plantão",
      `Plantão Nº ${p.numeroPlantao} · Servidor: ${usuarioLogado.nome} (Mat: ${usuarioLogado.matricula}) · UID: ${auth.currentUser.uid} · Autorizado por: ${p.autorizadoPor||"—"}`);
    alerta("Plantão assumido com sucesso!","ok");
    // o botão será atualizado automaticamente pelo listener em tempo real (onSnapshot)
  }catch(err){
    alerta("Erro ao confirmar: "+err.message,"erro");
    setBotaoAssuncao("liberado","🔓 Toque no botão para confirmar.");
  }
}
window.confirmarAssuncaoPlantao=confirmarAssuncaoPlantao;

export async function iniciarMeuPainel(){
  if(!usuarioLogado)return;
  const set=(id,txt)=>{const el=document.getElementById(id);if(el)el.textContent=txt;};
  set("mp-nome",usuarioLogado.nome||"—");
  set("mp-matricula",usuarioLogado.matricula||"—");

  // localizar registro correspondente na coleção de servidores (roster/ficha)
  let srv=null;
  try{
    const snap=await getDocs(query(collection(db,COL_SERV),where("matricula","==",usuarioLogado.matricula)));
    if(!snap.empty)srv={...snap.docs[0].data(),_id:snap.docs[0].id};
  }catch(e){}

  const fotoEl=document.getElementById("mp-foto");
  if(srv){
    set("mp-cargo",srv.cargo||"—");
    set("mp-lotacao",srv.lotacao||srv.unidade||"—");
    set("mp-situacao",srv.situacao||"Ativo");
    if(srv.foto){fotoEl.src=srv.foto;fotoEl.style.display="block";}else fotoEl.style.display="none";
  }else{
    set("mp-cargo","—");set("mp-lotacao","—");set("mp-situacao","—");
    fotoEl.style.display="none";
  }

  // ── Escala / Plantões ──
  let plantoes=[];
  try{
    const snap=await getDocs(query(collection(db,COL_PLANTAO),where("servidorMat","==",usuarioLogado.matricula)));
    plantoes=snap.docs.map(d=>d.data()).sort((a,b)=>(b.data||"").localeCompare(a.data||""));
  }catch(e){}
  const hoje=new Date().toISOString().slice(0,10);
  const proximo=plantoes.filter(p=>p.data>=hoje).sort((a,b)=>(a.data||"").localeCompare(b.data||""))[0];
  set("mp-proximo-plantao",proximo?`${proximo.data} · ${proximo.jornada||""}`:"Sem plantão futuro");
  const elPlt=document.getElementById("mp-plantoes");
  elPlt.innerHTML=plantoes.length?plantoes.slice(0,25).map(p=>{
    const ic=p.status==="presente"?"✅":p.status==="ausente"?"❌":"⏰";
    return`<div class="hist-item" style="padding:7px 10px;margin-bottom:5px">
      <div style="font-size:.78rem">${ic} ${p.data} · ${p.jornada||""} · Entrada: ${p.entrada||"—"} · Saída: ${p.saida||"—"}</div>
      ${p.obs?`<div style="font-size:.7rem;color:var(--cinza)">${p.obs}</div>`:""}
    </div>`;}).join(""):'<p class="hist-vazio">Nenhum plantão registrado.</p>';

  // ── Banco de Horas (agora sincronizado entre dispositivos) ──
  let bh=[];
  try{
    const snapBh=await getDocs(query(collection(db,COL_BH),where("srvMat","==",usuarioLogado.matricula)));
    bh=snapBh.docs.map(d=>d.data());
    if(!bh.length){
      // fallback por nome, para lançamentos antigos sem matrícula vinculada
      const snapBh2=await getDocs(query(collection(db,COL_BH),where("srvNome","==",usuarioLogado.nome)));
      bh=snapBh2.docs.map(d=>d.data());
    }
  }catch(e){}
  bh.sort((a,b)=>(b.data||"").localeCompare(a.data||""));
  const saldo=calcularSaldoBH(bh);
  set("mp-bh-saldo",`${saldo>=0?"+":""}${saldo}h`);
  const elBh=document.getElementById("mp-banco-horas");
  const iconeTipoBh={extra:"➕",compensar:"➖",falta:"❌",atestado:"🏥"};
  elBh.innerHTML=bh.length?bh.slice(0,20).map(l=>`<div class="hist-item" style="padding:7px 10px;margin-bottom:5px">
    <div style="font-size:.78rem">${iconeTipoBh[l.tipo]||""} ${l.data||""} · ${l.tipo} · ${l.qtd}h${l.obs?" — "+l.obs:""}</div>
  </div>`).join(""):'<p class="hist-vazio">Nenhum lançamento registrado.</p>';

  // ── Equipamentos acautelados (armas + coletes) ──
  let armasMinhas=[],coletesMinhas=[];
  try{
    const snapA=await getDocs(query(collection(db,COL_ARMAS_IND),where("acautelamento.matricula","==",usuarioLogado.matricula)));
    armasMinhas=snapA.docs.map(d=>d.data());
  }catch(e){}
  try{
    const snapC=await getDocs(query(collection(db,COL_COLETES),where("distribuicaoAtual.servidorMatricula","==",usuarioLogado.matricula)));
    coletesMinhas=snapC.docs.map(d=>d.data());
  }catch(e){}
  const elEq=document.getElementById("mp-equipamentos");
  let eqHtml="";
  armasMinhas.forEach(a=>{eqHtml+=`<div class="hist-item" style="padding:7px 10px;margin-bottom:5px">
    <div style="font-size:.78rem"><span class="ic-img ic-arma"></span> ${a.tipo||""} ${a.marca||""} ${a.modelo||""} · Patr: ${a.patrimonio||"—"}</div>
    <div style="font-size:.7rem;color:var(--cinza)">Entrega: ${a.acautelamento?.dataEntrega||"—"} · Carregadores: ${a.acautelamento?.qtdCarregadores??"—"} · Munições: ${a.acautelamento?.qtdMunicoes??"—"}</div>
  </div>`;});
  coletesMinhas.forEach(c=>{eqHtml+=`<div class="hist-item" style="padding:7px 10px;margin-bottom:5px">
    <div style="font-size:.78rem"><span class="ic-img ic-coletes"></span> Colete ${c.marca||""} ${c.modelo||""} · Patr: ${c.patrimonio||"—"}</div>
    <div style="font-size:.7rem;color:var(--cinza)">Entrega: ${c.distribuicaoAtual?.dataEntrega||"—"}${c.dataValidade?" · Validade: "+c.dataValidade:""}</div>
  </div>`;});
  elEq.innerHTML=eqHtml||'<p class="hist-vazio">Nenhum equipamento sob sua responsabilidade no momento.</p>';

  // ── Minhas ocorrências (registradas por mim ou me envolvendo) ──
  const ocLista=(window._ocCache||carregarOC()).filter(o=>
    o.registradoPor===usuarioLogado.nome||o.servidor?.includes(usuarioLogado.nome)||o.envolvidos?.includes(usuarioLogado.nome));
  set("mp-oc-pendentes",ocLista.filter(o=>o.status!=="encerrada").length);
  const elOc=document.getElementById("mp-ocorrencias");
  elOc.innerHTML=ocLista.length?ocLista.slice(0,20).map(o=>`<div class="hist-item" style="padding:7px 10px;margin-bottom:5px">
    <div style="font-size:.78rem">🚨 ${o.num||""} · ${o.tipo||""} · <strong>${o.status||"—"}</strong></div>
    <div style="font-size:.7rem;color:var(--cinza)">${o.data||""} · ${o.local||""}</div>
  </div>`).join(""):'<p class="hist-vazio">Nenhuma ocorrência relacionada a você.</p>';

  // ── Notificações ──
  try{
    const snapN=await getDocs(query(collection(db,COL_NOTIF),where("destEmail","==",usuarioLogado.email)));
    const naoLidasN=snapN.docs.filter(d=>!d.data().lida).length;
    set("mp-notif",naoLidasN);
    atualizarSireneMeuPainel(naoLidasN);
  }catch(e){set("mp-notif","0");}

  // ── Ficha funcional (somente leitura) ──
  const elFicha=document.getElementById("mp-ficha");
  if(srv){
    const dadosSensiveis=await carregarDadosSensiveisServidor(srv.id);
    elFicha.innerHTML=`
      <div class="hist-corpo">
        CPF: ${esc(dadosSensiveis?.cpf)||"—"}\nRG: ${esc(dadosSensiveis?.rg)||"—"}\nNascimento: ${srv.nascimento||"—"}\nAdmissão: ${srv.admissao||"—"}
        \nTelefone: ${esc(srv.telefone)||"—"}\nE-mail: ${esc(srv.email)||"—"}\nEndereço: ${esc(srv.endereco)||"—"}
        \nFunção: ${esc(srv.funcao)||"—"}\nUnidade: ${esc(srv.unidade)||"—"}
      </div>`;
  }else{
    elFicha.innerHTML='<p class="hist-vazio">Ficha funcional ainda não vinculada. Contate o Administrativo.</p>';
  }

  // badge de permutas pendentes (aguardando minha resposta)
  try{
    const minhaMat=normalizarMatricula(usuarioLogado.matricula);
    const snapPerm=await getDocs(query(collection(db,COL_PERMUTAS),where("status","==","aguardando_servidor")));
    const pendentes=snapPerm.docs.filter(d=>normalizarMatricula(d.data().destinatarioMat)===minhaMat).length;
    const badgePerm=document.getElementById("badge-mp-permuta");
    if(badgePerm)badgePerm.textContent=pendentes;
  }catch(e){}
}

