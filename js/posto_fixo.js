import { addDoc, collection, doc, getDoc, getDocs, orderBy, query, runTransaction, serverTimestamp, updateDoc, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { _ehAdmin, comprimirImagem } from "./administrativo.js";
import { CD_TIPOS, COL_PAD, COL_POSTOS, COL_POSTO_OPS, COL_POSTO_SEQ, COL_SERV, STATUS_POSTO_LABEL, _meuPostoAtual, _meuPostoOperacaoPendente, _meuPostoReceber, _postoEquipTemp, _postoOpsCache, _postosCache, _recebTemp, _srvAtivosCache, _verifTemp, agora, alerta, db, enviarNotificacao, esc, normalizarMatricula, registrarAuditoria, tsData, tsStr, usuarioLogado, v } from "./core.js";
import { gerarNumeroPAD } from "./pad.js";

export async function carregarServidoresAtivosPosto(){
  if(_srvAtivosCache.length)return _srvAtivosCache;
  try{
    const snap=await getDocs(query(collection(db,COL_SERV),where("ativo","==",true)));
    _srvAtivosCache=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.nome||"").localeCompare(b.nome||""));
  }catch(e){_srvAtivosCache=[];}
  return _srvAtivosCache;
}

export function abrirNovoPosto(){
  const form=document.getElementById("posto-cadastro-form");
  if(!_ehAdmin()){alerta("Apenas o Administrador pode cadastrar postos e equipamentos.","erro");return;}
  form.style.display=form.style.display==="none"?"block":"none";
  _postoEquipTemp=[];renderEquipPostoTemp();
  document.getElementById("posto-nome").value="";document.getElementById("posto-local").value="";
}
window.abrirNovoPosto=abrirNovoPosto;

export function adicionarEquipamentoPosto(){
  const tipo=v("posto-equip-tipo"),ident=v("posto-equip-id"),qtd=parseInt(v("posto-equip-qtd")||"0",10);
  if(!qtd||qtd<1)return alerta("Informe a quantidade prevista.","erro");
  _postoEquipTemp.push({tipo,identificacao:ident,quantidadePrevista:qtd});
  document.getElementById("posto-equip-id").value="";document.getElementById("posto-equip-qtd").value="";
  renderEquipPostoTemp();
}
window.adicionarEquipamentoPosto=adicionarEquipamentoPosto;

export function removerEquipamentoPostoTemp(i){_postoEquipTemp.splice(i,1);renderEquipPostoTemp();}
window.removerEquipamentoPostoTemp=removerEquipamentoPostoTemp;

export function renderEquipPostoTemp(){
  const el=document.getElementById("posto-equip-lista");
  el.innerHTML=_postoEquipTemp.length?_postoEquipTemp.map((e,i)=>
    `<div class="hist-item" style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px">
      <span style="font-size:.78rem">${esc(e.tipo)}${e.identificacao?" · "+esc(e.identificacao):""} — ${e.quantidadePrevista} un.</span>
      <button class="btn btn-sm btn-perigo" onclick="removerEquipamentoPostoTemp(${i})">✕</button>
    </div>`).join(""):'<p class="hist-vazio">Nenhum equipamento adicionado.</p>';
}

export async function salvarPosto(){
  if(!_ehAdmin())return alerta("Apenas o Administrador pode cadastrar postos.","erro");
  const nome=v("posto-nome"),local=v("posto-local");
  if(!nome||!local)return alerta("Preencha nome e local do posto.","erro");
  if(!_postoEquipTemp.length)return alerta("Adicione ao menos um equipamento esperado.","erro");
  try{
    await addDoc(collection(db,COL_POSTOS),{
      nome,local,ativo:true,equipamentos:_postoEquipTemp,
      responsavelMatricula:"",responsavelNome:"",proximoMatricula:"",proximoNome:"",
      status:"disponivel",operacaoAtualId:null,
      criadoPor:usuarioLogado?.nome||"",criadoEm:serverTimestamp()
    });
    await registrarAuditoria("Posto fixo cadastrado",`${nome} — ${local}`,{modulo:"🏛 Inspetoria",registro:nome});
    alerta("Posto cadastrado!","ok");
    document.getElementById("posto-cadastro-form").style.display="none";
    _postoEquipTemp=[];
    await carregarPostos();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.salvarPosto=salvarPosto;

export async function carregarPostos(){
  const lista=document.getElementById("postos-lista");
  if(lista)lista.innerHTML='<p class="hist-vazio">Carregando...</p>';
  try{
    const snap=await getDocs(query(collection(db,COL_POSTOS),orderBy("nome")));
    _postosCache=snap.docs.map(d=>({id:d.id,...d.data()}));
    await carregarServidoresAtivosPosto();
    renderPostosLista();
  }catch(err){if(lista)lista.innerHTML=`<p class="hist-vazio">Erro: ${err.message}</p>`;}
}

export function renderPostosLista(){
  const lista=document.getElementById("postos-lista");
  if(!lista)return;
  if(!_postosCache.length){lista.innerHTML='<p class="hist-vazio">Nenhum posto cadastrado.</p>';return;}
  lista.innerHTML=_postosCache.map(p=>{
    const st=STATUS_POSTO_LABEL[p.status]||["⚪",p.status];
    return `<div class="hist-item">
      <div class="hist-tipo">${esc(p.nome)}</div>
      <div class="hist-data">📍 ${esc(p.local)}</div>
      <div class="hist-corpo">${st[0]} ${st[1]}</div>
      <div class="hist-usuario">Responsável: ${esc(p.responsavelNome)||"—"} · Próximo: ${esc(p.proximoNome)||"—"}</div>
      <div class="hist-corpo" style="font-size:.68rem;margin-top:4px">Equipamentos: ${(p.equipamentos||[]).map(e=>`${esc(e.tipo)} (${e.quantidadePrevista})`).join(", ")||"—"}</div>
      <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-sm btn-cinza" onclick="abrirModalPostoEscala('${p.id}')">👮 Definir Escala</button>
      </div>
    </div>`;
  }).join("");
}

export async function abrirModalPostoEscala(id){
  const p=_postosCache.find(x=>x.id===id);if(!p)return;
  document.getElementById("posto-escala-id").value=id;
  await carregarServidoresAtivosPosto();
  const opts='<option value="">Selecione...</option>'+_srvAtivosCache.map(s=>
    `<option value="${esc(s.matricula)}" data-nome="${esc(s.nome)}">${esc(s.nome)} — ${esc(s.matricula)}</option>`).join("");
  const selResp=document.getElementById("posto-escala-resp"),selProx=document.getElementById("posto-escala-prox");
  selResp.innerHTML=opts;selProx.innerHTML=opts;
  selResp.value=p.responsavelMatricula||"";selProx.value=p.proximoMatricula||"";
  document.getElementById("modal-posto-escala").classList.add("aberto");
}
window.abrirModalPostoEscala=abrirModalPostoEscala;

export function fecharModalPostoEscala(){document.getElementById("modal-posto-escala").classList.remove("aberto");}
window.fecharModalPostoEscala=fecharModalPostoEscala;

export async function salvarEscalaPosto(){
  const id=v("posto-escala-id");
  const selResp=document.getElementById("posto-escala-resp"),selProx=document.getElementById("posto-escala-prox");
  const respMat=selResp.value,respNome=selResp.selectedOptions[0]?.dataset.nome||"";
  const proxMat=selProx.value,proxNome=selProx.selectedOptions[0]?.dataset.nome||"";
  if(!respMat)return alerta("Selecione o responsável atual.","erro");
  try{
    const ref=doc(db,COL_POSTOS,id);
    const atual=(await getDoc(ref)).data();
    const novoStatus=(atual.status==="disponivel")?"em_servico":atual.status;
    await updateDoc(ref,{responsavelMatricula:respMat,responsavelNome:respNome,
      proximoMatricula:proxMat,proximoNome:proxNome,status:novoStatus});
    await registrarAuditoria("Escala do posto definida",`Responsável: ${respNome} · Próximo: ${proxNome||"—"}`,
      {modulo:"🏛 Inspetoria",registro:id});
    alerta("Escala do posto atualizada.","ok");
    fecharModalPostoEscala();await carregarPostos();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.salvarEscalaPosto=salvarEscalaPosto;

export function iniciarInspPostos(){carregarPostos();document.getElementById("posto-cadastro-form").style.display="none";}

export async function carregarOperacoesPosto(){
  const snap=await getDocs(query(collection(db,COL_POSTO_OPS),orderBy("criadoEm","desc")));
  _postoOpsCache=snap.docs.map(d=>({id:d.id,...d.data()}));
  return _postoOpsCache;
}

export async function iniciarInspPassagens(){
  const lista=document.getElementById("passagens-lista");
  if(lista)lista.innerHTML='<p class="hist-vazio">Carregando...</p>';
  await carregarPostos();await carregarOperacoesPosto();
  preencherFiltroPostoPassagens();atualizarIndicadoresPassagens();renderPassagensPosto();
  const pend=_postoOpsCache.filter(o=>o.statusOperacao==="aguardando_recebimento").length;
  const badge=document.getElementById("badge-insp-passagens");
  if(badge){badge.textContent=pend;badge.style.display=pend>0?"inline-flex":"none";}
}

export function preencherFiltroPostoPassagens(){
  const sel=document.getElementById("ip-filtro-posto");
  if(sel)sel.innerHTML='<option value="">Todos</option>'+_postosCache.map(p=>`<option value="${p.id}">${esc(p.nome)}</option>`).join("");
}

export function atualizarIndicadoresPassagens(){
  const hoje=new Date().toLocaleDateString("pt-BR");
  const set=(id,val)=>{const el=document.getElementById(id);if(el)el.textContent=val;};
  set("ip-total-postos",_postosCache.length);
  set("ip-em-servico",_postosCache.filter(p=>p.status==="em_servico").length);
  set("ip-hoje",_postoOpsCache.filter(o=>tsStr(o.criadoEm).startsWith(hoje)).length);
  set("ip-pendentes",_postoOpsCache.filter(o=>o.statusOperacao==="aguardando_recebimento").length);
  set("ip-com-pendencia",_postosCache.filter(p=>p.status==="com_pendencia").length);
  set("ip-com-divergencia",_postosCache.filter(p=>p.status==="com_divergencia").length);
}

export function renderPassagensPosto(){
  const data=v("ip-filtro-data"),postoId=v("ip-filtro-posto"),situacao=v("ip-filtro-situacao");
  const ops=_postoOpsCache.filter(o=>
    (!data||tsData(o.criadoEm)===data)&&(!postoId||o.postoId===postoId)&&(!situacao||o.statusOperacao===situacao));
  const lista=document.getElementById("passagens-lista");
  const sitLabel={aguardando_recebimento:"⏳ Aguardando Recebimento",recebido:"🟢 Recebido",
    recebido_pendencia:"🟡 Recebido com Pendência",recebido_divergencia:"🔴 Recebido com Divergência"};
  lista.innerHTML=ops.length?ops.map(o=>`<div class="hist-item">
      <div class="hist-tipo">${esc(o.numero)} — ${esc(o.postoNome)}</div>
      <div class="hist-data">🕐 ${tsStr(o.criadoEm)}</div>
      <div class="hist-corpo">Entregante: ${esc(o.entreganteNome)} · Recebedor: ${esc(o.recebedorNome)||"—"}</div>
      <div class="hist-corpo">${sitLabel[o.statusOperacao]||esc(o.statusOperacao)} · Verificação: ${esc(o.resultadoVerificacao)||"—"}</div>
      ${o.divergencias?.length?`<div class="hist-corpo" style="color:#f1948a">⚠ ${o.divergencias.length} divergência(s)</div>`:""}
    </div>`).join(""):'<p class="hist-vazio">Nenhuma passagem encontrada.</p>';
}
window.renderPassagensPosto=renderPassagensPosto;

export async function iniciarPostoFixo(){
  const app=document.getElementById("posto-fixo-app");
  app.innerHTML='<p class="hist-vazio">Carregando...</p>';
  if(!usuarioLogado?.matricula){app.innerHTML='<p class="hist-vazio">Sua matrícula não está cadastrada — fale com o Administrativo.</p>';return;}
  try{
    const minhaMat=normalizarMatricula(usuarioLogado.matricula);
    const snap=await getDocs(collection(db,COL_POSTOS));
    const postos=snap.docs.map(d=>({id:d.id,...d.data()}));
    _meuPostoAtual=postos.find(p=>normalizarMatricula(p.responsavelMatricula)===minhaMat)||null;
    _meuPostoReceber=postos.find(p=>normalizarMatricula(p.proximoMatricula)===minhaMat&&p.status==="aguardando_recebimento")||null;
    _meuPostoOperacaoPendente=null;
    if(_meuPostoReceber?.operacaoAtualId){
      const opSnap=await getDoc(doc(db,COL_POSTO_OPS,_meuPostoReceber.operacaoAtualId));
      if(opSnap.exists())_meuPostoOperacaoPendente={id:opSnap.id,...opSnap.data()};
    }
    const badge=document.getElementById("badge-mp-posto");
    if(badge){const n=_meuPostoReceber?1:0;badge.textContent=n;badge.style.display=n>0?"inline-flex":"none";}
    renderPostoFixoHome();
  }catch(err){app.innerHTML=`<p class="hist-vazio">Erro: ${err.message}</p>`;}
}

export function renderPostoFixoHome(){
  const app=document.getElementById("posto-fixo-app");
  _verifTemp=null;_recebTemp=null;
  let html="";
  if(_meuPostoReceber&&_meuPostoOperacaoPendente){
    const op=_meuPostoOperacaoPendente;
    html+=`<div class="hist-item" style="border-left:3px solid #f1c40f">
      <div class="hist-tipo">🔔 Nova Passagem de Posto</div>
      <div class="hist-corpo">Posto: ${esc(_meuPostoReceber.nome)}\nLocal: ${esc(_meuPostoReceber.local)}\nEntregante: ${esc(op.entreganteNome)}\nData: ${tsStr(op.criadoEm)}\nResultado da verificação: ${esc(op.resultadoVerificacao)}</div>
      <button class="btn btn-full" style="margin-top:8px;background:rgba(46,204,113,.25);border-color:rgba(46,204,113,.6);color:#7dcea0"
        onclick="renderRecebimentoPosto()">🟢 RECEBER POSTO</button>
    </div>`;
  }
  if(_meuPostoAtual){
    const p=_meuPostoAtual,st=STATUS_POSTO_LABEL[p.status]||["⚪",p.status];
    html+=`<div class="hist-item">
      <div class="hist-tipo">${esc(p.nome)}</div>
      <div class="hist-data">📍 ${esc(p.local)}</div>
      <div class="hist-corpo">${st[0]} ${st[1]}</div>`;
    if(p.status==="em_servico"||p.status==="disponivel")
      html+=`<button class="btn btn-full btn-dourado" style="margin-top:8px" onclick="iniciarVerificacaoPosto()">🛡️ Iniciar Verificação de Posto</button>`;
    else if(p.status==="aguardando_recebimento")
      html+=`<p style="font-size:.72rem;color:var(--cinza);margin-top:6px">Aguardando ${p.proximoNome||"o próximo policial"} confirmar o recebimento.</p>`;
    html+="</div>";
  }
  if(!html)html='<p class="hist-vazio">Você não está vinculado a nenhum posto fixo no momento. Fale com a Inspetoria.</p>';
  app.innerHTML=html;
}

export function iniciarVerificacaoPosto(){
  const p=_meuPostoAtual;if(!p)return;
  _verifTemp={equipamentos:(p.equipamentos||[]).map(e=>({...e,encontrado:e.quantidadePrevista,situacao:"REGULAR"})),
    alteracaoAmbiente:false,tiposAlteracao:[],descricaoAmbiente:"",observacoesAmbiente:"",fotosAmbiente:[],providenciasAmbiente:""};
  renderVerificacaoPosto();
}
window.iniciarVerificacaoPosto=iniciarVerificacaoPosto;

export function renderVerificacaoPosto(){
  const p=_meuPostoAtual,t=_verifTemp,app=document.getElementById("posto-fixo-app");
  const equipHtml=t.equipamentos.map((e,i)=>`
    <div class="hist-item">
      <div class="hist-tipo">${esc(e.tipo)}${e.identificacao?" · "+esc(e.identificacao):""}</div>
      <div class="hist-data">Previsto: ${e.quantidadePrevista}</div>
      <label class="campo-label">Quantidade encontrada</label>
      <input type="number" min="0" value="${e.encontrado}" oninput="atualizarEquipVerif(${i},'encontrado',this.value)">
      <label class="campo-label">Situação</label>
      <select onchange="atualizarEquipVerif(${i},'situacao',this.value)">
        ${["REGULAR","DANIFICADA","AUSENTE","DIVERGENTE"].map(s=>`<option value="${s}" ${e.situacao===s?"selected":""}>${s}</option>`).join("")}
      </select>
    </div>`).join("");
  app.innerHTML=`
    <button class="btn btn-cinza btn-sm" style="margin-bottom:10px" onclick="renderPostoFixoHome()">← Cancelar</button>
    <div class="secao-titulo" style="font-size:.9rem">${esc(p.nome)} — Verificação</div>
    <div class="hist-corpo" style="margin-bottom:10px">📍 ${esc(p.local)}\n👮 ${esc(usuarioLogado.nome)} · Mat: ${esc(usuarioLogado.matricula)}\n🕐 ${agora()}</div>
    <div class="secao-titulo" style="font-size:.85rem">Equipamentos</div>
    ${equipHtml}
    <div class="secao-titulo" style="font-size:.85rem;margin-top:14px">Ambiente</div>
    <label class="campo-label">Houve alteração no ambiente?</label>
    <select onchange="toggleAlteracaoAmbiente(this.value)">
      <option value="nao" ${!t.alteracaoAmbiente?"selected":""}>NÃO</option>
      <option value="sim" ${t.alteracaoAmbiente?"selected":""}>SIM</option>
    </select>
    <div id="posto-alt-detalhe" style="display:${t.alteracaoAmbiente?"block":"none"}">
      <label class="campo-label">Tipo de alteração</label>
      <select multiple size="4" onchange="atualizarTiposAlteracao(this)">
        ${["Porta/janela","Mobiliário","Iluminação","Instalação elétrica","Equipamento","Danos ao patrimônio","Sinais de violação","Limpeza/organização","Outro"]
          .map(x=>`<option value="${x}" ${t.tiposAlteracao.includes(x)?"selected":""}>${x}</option>`).join("")}
      </select>
      <label class="campo-label">Descrição detalhada</label>
      <textarea oninput="_verifTemp.descricaoAmbiente=this.value">${t.descricaoAmbiente}</textarea>
      <label class="campo-label">Observações</label>
      <textarea oninput="_verifTemp.observacoesAmbiente=this.value">${t.observacoesAmbiente}</textarea>
      <label class="campo-label">Providências adotadas</label>
      <textarea oninput="_verifTemp.providenciasAmbiente=this.value">${t.providenciasAmbiente}</textarea>
      <button class="btn btn-cinza btn-sm" style="margin-top:6px" onclick="document.getElementById('posto-foto-input').click()">📷 Anexar Foto</button>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
        ${t.fotosAmbiente.map(f=>`<img src="${f}" style="width:56px;height:56px;object-fit:cover;border-radius:6px">`).join("")}
      </div>
    </div>
    <button class="btn btn-full btn-dourado" style="margin-top:14px" onclick="calcularResultadoEPassar()">🔄 PASSAR O POSTO</button>
  `;
}

export function atualizarEquipVerif(i,campo,val){_verifTemp.equipamentos[i][campo]=campo==="encontrado"?parseInt(val||"0",10):val;}
window.atualizarEquipVerif=atualizarEquipVerif;

export function toggleAlteracaoAmbiente(val){_verifTemp.alteracaoAmbiente=val==="sim";renderVerificacaoPosto();}
window.toggleAlteracaoAmbiente=toggleAlteracaoAmbiente;

export function atualizarTiposAlteracao(sel){_verifTemp.tiposAlteracao=[...sel.selectedOptions].map(o=>o.value);}
window.atualizarTiposAlteracao=atualizarTiposAlteracao;

export async function processarFotoPosto(input){
  const file=input.files[0];if(!file)return;
  try{
    const dataUrl=await comprimirImagem(file);
    _verifTemp.fotosAmbiente.push(dataUrl);
    renderVerificacaoPosto();
  }catch(err){alerta(err.message,"erro");}
  input.value="";
}
window.processarFotoPosto=processarFotoPosto;

export function calcularResultadoPosto(){
  const t=_verifTemp;
  const algumProblema=t.equipamentos.some(e=>e.situacao!=="REGULAR"||e.encontrado!==e.quantidadePrevista);
  if(!algumProblema&&!t.alteracaoAmbiente)return"regular";
  const grave=t.equipamentos.some(e=>e.situacao==="AUSENTE"||e.situacao==="DIVERGENTE")||
    (t.alteracaoAmbiente&&["Danos ao patrimônio","Sinais de violação"].some(x=>t.tiposAlteracao.includes(x)));
  return grave?"irregularidade":"pendencia";
}

export async function calcularResultadoEPassar(){
  const t=_verifTemp,p=_meuPostoAtual;
  const resultado=calcularResultadoPosto();
  let descricaoIrregularidade="";
  if(resultado==="irregularidade"){
    descricaoIrregularidade=prompt("Foi encontrada uma irregularidade. Descreva antes de continuar:")||"";
    if(!descricaoIrregularidade.trim())return alerta("Descrição obrigatória para irregularidade.","erro");
  }
  const label={regular:"🟢 POSTO REGULAR",pendencia:"🟡 POSTO COM PENDÊNCIA",irregularidade:"🔴 IRREGULARIDADE ENCONTRADA"}[resultado];
  if(!confirm(`Resultado da verificação: ${label}\n\nConfirmar passagem do posto? Ao confirmar, você declara que realizou a conferência dos equipamentos e das condições do posto conforme as informações registradas.`))return;
  try{
    let opId=null,numeroGerado=null,proxMatSnap="";
    await runTransaction(db,async(trx)=>{
      const postoRef=doc(db,COL_POSTOS,p.id);
      const postoSnap=await trx.get(postoRef);
      const dp=postoSnap.data();
      if(!dp||(dp.status!=="em_servico"&&dp.status!=="disponivel"))
        throw new Error("Este posto já está em processo de passagem/recebimento.");
      if(normalizarMatricula(dp.responsavelMatricula)!==normalizarMatricula(usuarioLogado.matricula))
        throw new Error("Você não é o responsável atual deste posto.");
      const seqRef=doc(db,COL_POSTO_SEQ,"contador");
      const seqSnap=await trx.get(seqRef);
      const ultimo=(seqSnap.exists()?seqSnap.data().ultimo:0)+1;
      const numero=`PF-${new Date().getFullYear()}-${String(ultimo).padStart(6,"0")}`;
      const opRef=doc(collection(db,COL_POSTO_OPS));
      trx.set(opRef,{
        numero,postoId:p.id,postoNome:p.nome,local:p.local,
        entreganteMatricula:usuarioLogado.matricula,entreganteNome:usuarioLogado.nome,
        recebedorMatricula:dp.proximoMatricula||"",recebedorNome:dp.proximoNome||"",
        equipamentosVerificados:t.equipamentos,
        alteracaoAmbiente:{houve:t.alteracaoAmbiente,tipos:t.tiposAlteracao,descricao:t.descricaoAmbiente,
          observacoes:t.observacoesAmbiente,fotos:t.fotosAmbiente,providencias:t.providenciasAmbiente},
        resultadoVerificacao:resultado,descricaoIrregularidade,
        statusOperacao:"aguardando_recebimento",
        confirmacaoEntregante:{nome:usuarioLogado.nome,matricula:usuarioLogado.matricula,email:usuarioLogado.email,hora:agora()},
        recebimento:null,divergencias:[],
        criadoPor:usuarioLogado.email,criadoEm:serverTimestamp()
      });
      trx.set(seqRef,{ultimo});
      trx.update(postoRef,{status:"aguardando_recebimento",operacaoAtualId:opRef.id});
      opId=opRef.id;numeroGerado=numero;proxMatSnap=dp.proximoMatricula||"";
    });
    await registrarAuditoria("Passagem de posto registrada",`${p.nome} — ${numeroGerado} — resultado: ${label}`,
      {modulo:"👮 Policial Municipal",registro:numeroGerado,resultado:label});
    if(proxMatSnap){
      const proxSnap=await getDocs(query(collection(db,COL_SERV),where("matricula","==",proxMatSnap)));
      const prox=proxSnap.docs[0]?.data();
      if(prox?.email)await enviarNotificacao(prox.email,"🔔 Passagem de Posto",
        `O ${p.nome} foi passado e está aguardando seu recebimento.`,"meupainel");
    }
    alerta("Posto passado com sucesso!","ok");
    await iniciarPostoFixo();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.calcularResultadoEPassar=calcularResultadoEPassar;

export function renderRecebimentoPosto(){
  const op=_meuPostoOperacaoPendente,p=_meuPostoReceber,app=document.getElementById("posto-fixo-app");
  if(!_recebTemp)_recebTemp={itens:op.equipamentosVerificados.map(e=>({...e,entregue:e.encontrado,encontrado:e.encontrado,situacao:e.situacao}))};
  const t=_recebTemp;
  const itensHtml=t.itens.map((e,i)=>`
    <div class="hist-item">
      <div class="hist-tipo">${esc(e.tipo)}${e.identificacao?" · "+esc(e.identificacao):""}</div>
      <div class="hist-data">Entregue: ${e.entregue}</div>
      <label class="campo-label">Encontrado</label>
      <input type="number" min="0" value="${e.encontrado}" oninput="atualizarEquipRecebimento(${i},'encontrado',this.value)">
      <label class="campo-label">Situação</label>
      <select onchange="atualizarEquipRecebimento(${i},'situacao',this.value)">
        ${["REGULAR","DANIFICADA","AUSENTE","DIVERGENTE"].map(s=>`<option value="${s}" ${e.situacao===s?"selected":""}>${s}</option>`).join("")}
      </select>
    </div>`).join("");
  const ambienteResumo=op.alteracaoAmbiente?.houve
    ?`Alteração: ${(op.alteracaoAmbiente.tipos||[]).join(", ")} — ${esc(op.alteracaoAmbiente.descricao)}`
    :"Sem alteração registrada";
  app.innerHTML=`
    <button class="btn btn-cinza btn-sm" style="margin-bottom:10px" onclick="_recebTemp=null;renderPostoFixoHome()">← Cancelar</button>
    <div class="secao-titulo" style="font-size:.9rem">${esc(op.numero)} — Recebimento</div>
    <div class="hist-corpo" style="margin-bottom:10px">📍 ${esc(op.local)}\nEntregante: ${esc(op.entreganteNome)}\nAmbiente: ${ambienteResumo}</div>
    ${itensHtml}
    <div style="display:flex;gap:8px;margin-top:14px">
      <button class="btn btn-full" style="background:rgba(46,204,113,.25);border-color:rgba(46,204,113,.6);color:#7dcea0" onclick="confirmarRecebimentoPosto()">🟢 RECEBER POSTO</button>
    </div>
  `;
}
window.renderRecebimentoPosto=renderRecebimentoPosto;

export function atualizarEquipRecebimento(i,campo,val){_recebTemp.itens[i][campo]=campo==="encontrado"?parseInt(val||"0",10):val;}
window.atualizarEquipRecebimento=atualizarEquipRecebimento;

export async function confirmarRecebimentoPosto(){
  const t=_recebTemp,op=_meuPostoOperacaoPendente,p=_meuPostoReceber;
  const divergentes=t.itens.filter(e=>e.encontrado!==e.entregue||e.situacao!=="REGULAR");
  let divergencias=[];
  if(divergentes.length){
    if(!confirm(`Há ${divergentes.length} diferença(s) entre o entregue e o encontrado. Registrar divergência para cada item?`))return;
    for(const d of divergentes){
      const desc=prompt(`Divergência em ${d.tipo}${d.identificacao?" ("+d.identificacao+")":""}\nInformado: ${d.entregue} · Encontrado: ${d.encontrado}\nDescreva:`)||"";
      const providencia=prompt("Providência adotada:")||"";
      divergencias.push({item:d.tipo,identificacao:d.identificacao||"",quantidadeInformada:d.entregue,
        quantidadeEncontrada:d.encontrado,tipoDivergencia:d.situacao,descricao:desc,providencia});
    }
  }
  const statusFinal=divergencias.length?"recebido_divergencia":"recebido";
  const declaracao=statusFinal==="recebido"
    ?"Declaro que conferi o posto, os equipamentos e as condições registradas na passagem e estou assumindo o posto."
    :"Declaro que conferi o posto e estou assumindo o posto, com as divergências registradas acima.";
  if(!confirm(declaracao+"\n\nConfirmar recebimento?"))return;
  try{
    await runTransaction(db,async(trx)=>{
      const postoRef=doc(db,COL_POSTOS,p.id),opRef=doc(db,COL_POSTO_OPS,op.id);
      const postoSnap=await trx.get(postoRef);
      if(postoSnap.data()?.status!=="aguardando_recebimento")
        throw new Error("Este posto não está mais aguardando recebimento.");
      trx.update(opRef,{
        statusOperacao:statusFinal,
        recebimento:{itens:t.itens,horaRecebimento:agora(),
          confirmacaoRecebedor:{nome:usuarioLogado.nome,matricula:usuarioLogado.matricula,email:usuarioLogado.email,hora:agora()}},
        divergencias
      });
      trx.update(postoRef,{
        status:divergencias.length?"com_divergencia":"em_servico",
        responsavelMatricula:usuarioLogado.matricula,responsavelNome:usuarioLogado.nome,
        proximoMatricula:"",proximoNome:"",operacaoAtualId:opRef.id
      });
    });
    await registrarAuditoria("Recebimento de posto confirmado",`${p.nome} — ${op.numero} — situação: ${statusFinal}`,
      {modulo:"👮 Policial Municipal",registro:op.numero,resultado:statusFinal});
    const entregSnap=await getDocs(query(collection(db,COL_SERV),where("matricula","==",op.entreganteMatricula)));
    const entreg=entregSnap.docs[0]?.data();
    if(entreg?.email)await enviarNotificacao(entreg.email,
      divergencias.length?"⚠️ Divergência na Passagem":"✅ Posto Recebido",
      divergencias.length?`Foi registrada uma divergência no ${p.nome}.`:`O ${p.nome} foi assumido com sucesso.`,"meupainel");
    if(divergencias.length)await enviarNotificacao("inspetoria@sistema.local",
      "⚠️ Divergência na Passagem de Posto",`${p.nome} — ${op.numero} recebido com divergência.`,"inspetoria");
    alerta(divergencias.length?"Recebimento registrado com divergência.":"Posto recebido com sucesso!","ok");
    await iniciarPostoFixo();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.confirmarRecebimentoPosto=confirmarRecebimentoPosto;

export async function renderDecisao(tipo){
  const cfg=CD_TIPOS[tipo];
  const lista=document.getElementById(`decisao-lista-${tipo}`);
  const cnt=document.getElementById(`decisao-cnt-${tipo}`);
  if(!lista||!cfg)return;
  lista.innerHTML='<p class="hist-vazio">Carregando...</p>';
  try{
    const snap=await getDocs(query(collection(db,cfg.col),where("statusComando","==","pendente")));
    const docs=snap.docs.map(d=>({_docId:d.id,...d.data()}))
      .sort((a,b)=>(b.criadoEm?.seconds||0)-(a.criadoEm?.seconds||0));
    window._decisaoCache[tipo]=docs;
    if(cnt)cnt.textContent=docs.length?`${docs.length} pendente(s)`:"";
    const badge=document.getElementById(`badge-decisao-${tipo}`);
    if(badge)badge.textContent=docs.length;
    lista.innerHTML=!docs.length?'<p class="hist-vazio">Nenhum item pendente. ✅</p>'
      :docs.map(r=>`
        <div class="hist-item">
          <div class="hist-tipo">${cfg.titulo(r)}</div>
          <div class="hist-data">${cfg.linha1(r)}</div>
          <div class="hist-usuario">${cfg.linha2(r)}</div>
          <div class="hist-corpo">${cfg.corpo(r)}</div>
          <div style="display:flex;gap:6px;margin-top:8px">
            <button class="btn btn-sm btn-perigo" style="flex:1" onclick="encaminharDecisao('${tipo}','${r._docId}')">⚖️ Corregedoria</button>
            <button class="btn btn-sm btn-cinza" style="flex:1" onclick="arquivarDecisao('${tipo}','${r._docId}')">🗄 Arquivar</button>
          </div>
        </div>`).join("");
  }catch(err){lista.innerHTML=`<p class="hist-vazio">Erro: ${err.message}</p>`;}
}

export async function encaminharDecisao(tipo,docId){
  const cfg=CD_TIPOS[tipo];
  const r=(window._decisaoCache[tipo]||[]).find(x=>x._docId===docId);
  if(!r)return alerta("Registro não encontrado, atualize a lista.","erro");
  if(!confirm(`Encaminhar este(a) ${cfg.label.toLowerCase()} à Corregedoria? Um novo PAD será aberto.`))return;
  const num=gerarNumeroPAD();
  try{
    await addDoc(collection(db,COL_PAD),{
      numero:num,
      data:cfg.dataPad(r),
      servidor:cfg.servidorPad(r),
      origem:cfg.origemLabel,
      responsavel:"",
      desc:cfg.descPad(r)+`\n\nDecisão do Comando: encaminhado por ${usuarioLogado?.nome||"—"}.`,
      status:"recebido",
      fotos:[],
      registradoPor:usuarioLogado?.nome||"Sistema",
      registradoEmail:usuarioLogado?.email||"",
      criadoEm:serverTimestamp()
    });
    await updateDoc(doc(db,cfg.col,docId),{
      statusComando:"encaminhado",decididoPor:usuarioLogado?.nome||"",
      decididoEm:serverTimestamp(),padGerado:num
    });
    await registrarAuditoria(`Comando encaminhou ${cfg.label} à Corregedoria: ${num}`,`Origem: ${cfg.origemLabel}`);
    alerta(`Encaminhado à Corregedoria como ${num}!`,"ok");
    renderDecisao(tipo);
    atualizarBadgeDecisaoTotal();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.encaminharDecisao=encaminharDecisao;

export async function arquivarDecisao(tipo,docId){
  const cfg=CD_TIPOS[tipo];
  const just=prompt("Justificativa do arquivamento (obrigatória):");
  if(!just||!just.trim())return alerta("Arquivamento cancelado: justificativa é obrigatória.","erro");
  try{
    await updateDoc(doc(db,cfg.col,docId),{
      statusComando:"arquivado",justificativaComando:just.trim(),
      decididoPor:usuarioLogado?.nome||"",decididoEm:serverTimestamp()
    });
    await registrarAuditoria(`Comando arquivou ${cfg.label}`,`Justificativa: ${just.trim()}`);
    alerta("Registro arquivado.","ok");
    renderDecisao(tipo);
    atualizarBadgeDecisaoTotal();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.arquivarDecisao=arquivarDecisao;

export async function atualizarBadgeDecisaoTotal(){
  let total=0;
  for(const tipo of Object.keys(CD_TIPOS)){
    try{
      const snap=await getDocs(query(collection(db,CD_TIPOS[tipo].col),where("statusComando","==","pendente")));
      total+=snap.size;
      const b=document.getElementById(`badge-decisao-${tipo}`);
      if(b)b.textContent=snap.size;
    }catch(e){}
  }
  const badge=document.getElementById("badge-decisao");
  if(badge)badge.textContent=total;
}

