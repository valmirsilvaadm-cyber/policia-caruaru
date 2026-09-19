import { addDoc, collection, deleteDoc, deleteField, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { COL_ARMAS_IND, COL_COLETES, COL_FOTOS, COL_OS, COL_PAD, COL_PLANTAO, COL_SERV, COL_TIMELINE, GRUPOS_LIMPEZA, _fotosCache, adminAutenticado, agora, alerta, db, esc, fichaAtualId, fichaFotoBase64, fotoAtual, fotosSelecionadas, ir, registrarAuditoria, servidoresCache, todosServidoresAdminCache, usuarioLogado, v } from "./core.js";
import { carregarOC } from "./ocorrencias.js";

export async function cadastrarServidor(){
  const nome=v("adm-srv-nome"),mat=v("adm-srv-mat"),cargo=v("adm-srv-cargo"),
        email=v("adm-srv-email"),tel=v("adm-srv-tel").replace(/\D/g,"");
  if(!nome||!mat)return alerta("Preencha nome e matrícula.","erro");
  try{
    const dup=await getDocs(query(collection(db,COL_SERV),where("matricula","==",mat)));
    if(!dup.empty)return alerta("Matrícula já cadastrada.","erro");
    await addDoc(collection(db,COL_SERV),{nome,matricula:mat,cargo,email,telefone:tel,ativo:true,criadoEm:serverTimestamp()});
    alerta("Servidor cadastrado!","ok");
    ["adm-srv-nome","adm-srv-mat","adm-srv-cargo","adm-srv-email","adm-srv-tel"].forEach(id=>document.getElementById(id).value="");
    carregarServidoresAdmin();servidoresCache=[];
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.cadastrarServidor=cadastrarServidor;

export async function carregarServidoresAdmin(){
  const lista=document.getElementById("admin-servidores-lista");
  const cont=document.getElementById("cnt-servidores");
  lista.innerHTML='<p class="hist-vazio">Carregando...</p>';
  try{
    const snap=await getDocs(query(collection(db,COL_SERV),orderBy("nome")));
    cont.textContent=snap.size?`${snap.size} servidor(es)`:"";
    if(snap.empty){lista.innerHTML='<p class="hist-vazio">Nenhum servidor.</p>';return;}
    lista.innerHTML=snap.docs.map(d=>{const s=d.data(),id=d.id;
      return`<div class="hist-item">
        <div class="hist-tipo">${esc(s.nome)}</div>
        <div class="hist-data">Mat: ${esc(s.matricula)}${s.cargo?" · "+s.cargo:""}${s.email?"\n📧 "+s.email:""}${s.telefone?"\n📱 "+s.telefone:""}</div>
        <div style="margin-top:6px"><button class="btn btn-sm btn-perigo" data-del="${id}">🗑 Remover</button></div>
      </div>`;}).join("");
    lista.querySelectorAll("[data-del]").forEach(btn=>{
      btn.addEventListener("click",async()=>{
        if(!confirm("Remover servidor?"))return;
        await deleteDoc(doc(db,COL_SERV,btn.dataset.del));
        alerta("Servidor removido.","aviso");carregarServidoresAdmin();servidoresCache=[];
      });
    });
  }catch(err){lista.innerHTML=`<p class="hist-vazio">Erro: ${err.message}</p>`;}
}

export function filtrarServidores(){
  const q=(v("filtro-servidor-nome")||"").toLowerCase();
  renderServidoresAdmin(q?todosServidoresAdminCache.filter(s=>
    s.nome?.toLowerCase().includes(q)||s.matricula?.toLowerCase().includes(q)):todosServidoresAdminCache);
}
window.filtrarServidores=filtrarServidores;

export function renderServidoresAdmin(docs){
  const lista=document.getElementById("admin-servidores-lista");
  const cont=document.getElementById("cnt-servidores");
  cont.textContent=docs.length?`${docs.length} servidor(es)`:"";
  lista.innerHTML=docs.length?docs.map(s=>`
    <div class="hist-item">
      <div class="hist-tipo">${esc(s.nome)}</div>
      <div class="hist-data">Mat: ${esc(s.matricula)}${s.cargo?" · "+s.cargo:""}${s.email?"\n📧 "+s.email:""}${s.telefone?"\n📱 "+s.telefone:""}</div>
      <div style="margin-top:6px"><button class="btn btn-sm btn-perigo" data-del="${s.id}">🗑 Remover</button></div>
    </div>`).join("")
  :'<p class="hist-vazio">Nenhum servidor.</p>';
  lista.querySelectorAll("[data-del]").forEach(btn=>{
    btn.addEventListener("click",async()=>{
      if(!confirm("Remover servidor?"))return;
      await deleteDoc(doc(db,COL_SERV,btn.dataset.del));
      alerta("Removido.","aviso");carregarServidoresAdmin();servidoresCache=[];
    });
  });
}

export async function carregarFotosCache(){
  try{
    const snap = await getDocs(collection(db, COL_FOTOS));
    _fotosCache = snap.docs.map(d=>({id:d.id,...d.data()}))
      .sort((a,b)=>(b.criadoEm?.seconds||0)-(a.criadoEm?.seconds||0));
  }catch(e){_fotosCache=[];}
  return _fotosCache;
}

export function iniciarFotos(){
  document.getElementById("foto-preview-area").style.display="none";
  document.getElementById("foto-input").value="";
  fotoAtual=null; fotosSelecionadas.clear();
  atualizarToolbarFotos();
  renderFotos();
}

export async function processarFotos(input){
  const file=input.files[0]; if(!file)return;
  try{
    const dataUrl=await comprimirImagem(file);
    fotoAtual={dataUrl, nome:file.name};
    document.getElementById("foto-preview-img").src=dataUrl;
    document.getElementById("foto-preview-area").style.display="block";
    document.getElementById("foto-titulo").value="";
  }catch(err){alerta(err.message,"erro");input.value="";}
}
window.processarFotos=processarFotos;

export async function salvarFoto(){
  if(!fotoAtual)return;
  const titulo=v("foto-titulo")||"Sem título";
  const modulo=v("foto-modulo")||"Geral";
  try{
    await addDoc(collection(db,COL_FOTOS),{
      dataUrl: fotoAtual.dataUrl,
      titulo, modulo,
      usuario: usuarioLogado?.nome||"",
      email:   usuarioLogado?.email||"",
      data:    agora(),
      criadoEm: serverTimestamp()
    });
    alerta("Foto salva!","ok");
    cancelarFoto();
    await renderFotos();
  }catch(err){alerta("Erro ao salvar foto: "+err.message,"erro");}
}
window.salvarFoto=salvarFoto;

export function cancelarFoto(){
  fotoAtual=null;
  document.getElementById("foto-preview-area").style.display="none";
  document.getElementById("foto-input").value="";
}
window.cancelarFoto=cancelarFoto;

export async function renderFotos(){
  const q   =(v("foto-filtro")||"").toLowerCase();
  const mod =(v("foto-filtro-modulo")||"");
  const grid=document.getElementById("foto-grid");
  grid.innerHTML='<p class="hist-vazio" style="grid-column:1/-1">Carregando...</p>';
  await carregarFotosCache();
  let fotos=_fotosCache;
  // usuário comum vê só as próprias
  if(!_ehAdmin()) fotos=fotos.filter(f=>f.email===usuarioLogado?.email);
  if(q)   fotos=fotos.filter(f=>f.titulo?.toLowerCase().includes(q)||f.modulo?.toLowerCase().includes(q));
  if(mod) fotos=fotos.filter(f=>f.modulo===mod);

  document.getElementById("foto-contador").textContent=fotos.length?`${fotos.length} foto(s)`:"";
  if(!fotos.length){ grid.innerHTML='<p class="hist-vazio" style="grid-column:1/-1">Nenhuma foto.</p>'; return; }
  grid.innerHTML=fotos.map(f=>{
    const sel=fotosSelecionadas.has(f.id);
    return`<div class="foto-card${sel?" selecionada":""}" data-id="${f.id}">
      <div class="foto-check">${sel?"✓":""}</div>
      <img src="${f.dataUrl}" alt="${esc(f.titulo)}" loading="lazy">
      <div class="foto-info">
        <div class="foto-titulo">${esc(f.titulo)}</div>
        <div class="foto-data">${esc(f.modulo)} · ${esc(f.data)}</div>
      </div>
    </div>`;
  }).join("");
  grid.querySelectorAll(".foto-card").forEach(card=>{
    card.addEventListener("click",()=>toggleFotoSel(card.dataset.id));
  });
}
window.renderFotos=renderFotos;

export function _ehAdmin(){
  // Espelha exatamente a função souAdmin() das Regras do Firestore:
  // conta na coleção "admins" OU está aprovado com a permissão "tecnologia"
  // (que no servidor já equivale a poder de Administrador). Antes esse
  // checador só olhava adminAutenticado, então quem só tinha acesso ao
  // módulo Tecnologia via permissão via era barrado na UI mesmo podendo
  // fazer a ação no banco — agora os dois lados batem.
  const temPermTecnologia = usuarioLogado?.status==="aprovado" &&
    usuarioLogado?.permissoes?.tecnologia!==false;
  return adminAutenticado===true || temPermTecnologia;
}

export function toggleFotoSel(id){
  if(fotosSelecionadas.has(id)) fotosSelecionadas.delete(id);
  else fotosSelecionadas.add(id);
  atualizarToolbarFotos();
  renderFotos();
}

export function atualizarToolbarFotos(){
  const n=fotosSelecionadas.size;
  const tb=document.getElementById("foto-toolbar");
  const cnt=document.getElementById("foto-sel-cnt");
  tb.classList.toggle("visivel",n>0);
  if(cnt)cnt.textContent=`${n} selecionada(s)`;
}

export function desmarcarFotos(){
  fotosSelecionadas.clear(); atualizarToolbarFotos(); renderFotos();
}
window.desmarcarFotos=desmarcarFotos;

export async function excluirFotosSelecionadas(){
  if(!fotosSelecionadas.size)return;
  if(!confirm(`Excluir ${fotosSelecionadas.size} foto(s) permanentemente?`))return;
  try{
    for(const id of fotosSelecionadas){await deleteDoc(doc(db,COL_FOTOS,id));}
    fotosSelecionadas.clear();
    alerta("Foto(s) excluída(s).","aviso"); await renderFotos(); atualizarToolbarFotos();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.excluirFotosSelecionadas=excluirFotosSelecionadas;

export function compartilharFotos(){
  const fotos=_fotosCache.filter(f=>fotosSelecionadas.has(f.id));
  if(!fotos.length)return;
  const tel=prompt("Digite o número WhatsApp (DDD+número):");
  if(!tel)return;
  const txt=`📷 *Banco de Fotos — Polícia Municipal de Caruaru*\n\n`+
    fotos.map(f=>`📌 ${f.titulo} | ${f.modulo} | ${f.data}`).join("\n")+
    `\n\nEnviado por: ${usuarioLogado?.nome||""}`;
  window.open(`https://wa.me/55${tel.replace(/\D/g,"")}?text=${encodeURIComponent(txt)}`,"_blank");
}
window.compartilharFotos=compartilharFotos;

export function iniciarFichaServidor(){
  document.getElementById("ficha-busca").value="";
  document.getElementById("ficha-lista").innerHTML='<p class="hist-vazio">Digite nome ou matrícula para buscar.</p>';
  if(!servidoresCache.length)carregarSrvCacheLocal();
}

export async function carregarSrvCacheLocal(){
  try{
    const snap=await getDocs(query(collection(db,COL_SERV),where("ativo","==",true)));
    servidoresCache=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.nome.localeCompare(b.nome));
  }catch(e){}
}

export async function buscarFichaServidor(){
  const q=v("ficha-busca").toLowerCase();
  if(!q)return;
  if(!servidoresCache.length)await carregarSrvCacheLocal();
  const encontrados=servidoresCache.filter(s=>s.nome?.toLowerCase().includes(q)||s.matricula?.toLowerCase().includes(q));
  const lista=document.getElementById("ficha-lista");
  if(!encontrados.length){lista.innerHTML='<p class="hist-vazio">Servidor não encontrado.</p>';return;}
  lista.innerHTML=encontrados.map(s=>`
    <div class="hist-item" style="cursor:pointer" onclick="abrirFicha('${s.id}')">
      <div class="hist-tipo">👤 ${esc(s.nome)}</div>
      <div class="hist-data">Mat: ${esc(s.matricula)}${s.cargo?" · "+esc(s.cargo):""}</div>
      <div class="hist-corpo" style="font-size:.72rem">${esc(s.email)}${s.telefone?" · "+esc(s.telefone):""}</div>
    </div>`).join("");
}
window.buscarFichaServidor=buscarFichaServidor;

export function toggleCadastroServidorFicha(){
  const el=document.getElementById("ficha-cadastro-form");
  el.style.display=el.style.display==="none"?"block":"none";
}
window.toggleCadastroServidorFicha=toggleCadastroServidorFicha;

export async function cadastrarServidorFicha(){
  const nome=v("fs-cad-nome"),mat=v("fs-cad-mat"),cargo=v("fs-cad-cargo"),
        email=v("fs-cad-email"),tel=v("fs-cad-tel").replace(/\D/g,"");
  if(!nome||!mat)return alerta("Preencha nome e matrícula.","erro");
  try{
    const dup=await getDocs(query(collection(db,COL_SERV),where("matricula","==",mat)));
    if(!dup.empty)return alerta("Matrícula já cadastrada.","erro");
    await addDoc(collection(db,COL_SERV),{nome,matricula:mat,cargo,email,telefone:tel,ativo:true,criadoEm:serverTimestamp()});
    await registrarAuditoria("Servidor cadastrado (Ficha do Servidor)",`${nome} — Mat: ${mat}`);
    alerta("Servidor cadastrado!","ok");
    ["fs-cad-nome","fs-cad-mat","fs-cad-cargo","fs-cad-email","fs-cad-tel"].forEach(id=>document.getElementById(id).value="");
    document.getElementById("ficha-cadastro-form").style.display="none";
    servidoresCache=[];
    document.getElementById("ficha-busca").value=mat;
    buscarFichaServidor();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.cadastrarServidorFicha=cadastrarServidorFicha;

export function comprimirImagem(file, maxDim=1280, qualidadeInicial=0.75){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error("Não foi possível ler o arquivo de imagem."));
    reader.onload=e=>{
      const img=new Image();
      img.onerror=()=>reject(new Error("Arquivo de imagem inválido."));
      img.onload=()=>{
        let {width,height}=img;
        if(width>maxDim||height>maxDim){
          const escala=maxDim/Math.max(width,height);
          width=Math.round(width*escala);height=Math.round(height*escala);
        }
        const canvas=document.createElement("canvas");
        canvas.width=width;canvas.height=height;
        canvas.getContext("2d").drawImage(img,0,0,width,height);
        let qualidade=qualidadeInicial,dataUrl=canvas.toDataURL("image/jpeg",qualidade);
        // reduz qualidade até caber com folga no limite de 1MB por documento do Firestore
        while(dataUrl.length>700*1024&&qualidade>0.3){
          qualidade-=0.1;
          dataUrl=canvas.toDataURL("image/jpeg",qualidade);
        }
        if(dataUrl.length>800*1024){
          reject(new Error("Não foi possível comprimir a imagem o suficiente. Tente uma foto menor ou com menos detalhe."));
          return;
        }
        resolve(dataUrl);
      };
      img.src=e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export async function prevFichaFoto(ev){
  const file=ev.target.files[0];
  if(!file)return;
  const img=document.getElementById("fd-foto-preview");
  try{
    fichaFotoBase64=await comprimirImagem(file);
    img.src=fichaFotoBase64;img.style.display="block";
  }catch(err){
    alerta(err.message,"erro");
    ev.target.value="";
  }
}
window.prevFichaFoto=prevFichaFoto;

export async function abrirFicha(srvId){
  const srv=servidoresCache.find(s=>s.id===srvId);
  if(!srv)return;
  fichaAtualId=srvId;fichaFotoBase64=srv.foto||null;
  ir("ficha-individual");
  document.getElementById("ficha-header").innerHTML=`
    ${srv.foto?`<img src="${srv.foto}" style="width:52px;height:52px;border-radius:8px;object-fit:cover;border:1px solid rgba(201,168,76,.4)">`:""}
    <div>
      <div style="font-family:'Oswald',sans-serif;font-size:1.1rem;letter-spacing:2px;color:var(--dourado)">${esc(srv.nome)}</div>
      <div style="font-size:.75rem;color:var(--cinza);margin-top:4px">Mat: ${esc(srv.matricula)} · ${esc(srv.cargo)}</div>
      ${srv.email?`<div style="font-size:.72rem;color:var(--cinza)">📧 ${esc(srv.email)}</div>`:""}
      ${srv.telefone?`<div style="font-size:.72rem;color:var(--cinza)">📱 ${esc(srv.telefone)}</div>`:""}
    </div>`;

  // Dados Pessoais — popula campos editáveis
  const img=document.getElementById("fd-foto-preview");
  if(srv.foto){img.src=srv.foto;img.style.display="block";}else{img.style.display="none";img.src="";}
  document.getElementById("fd-foto-input").value="";
  document.getElementById("fd-nome").value=srv.nome||"";
  document.getElementById("fd-matricula").value=srv.matricula||"";
  // CPF/RG agora ficam numa subcoleção com leitura restrita
  // (Admin, Administrativo, ou o próprio servidor). Se o usuário atual
  // não tiver permissão, o campo fica em branco com um aviso — não é erro.
  const camposSensiveis=document.getElementById("fd-cpf-aviso");
  if(camposSensiveis)camposSensiveis.textContent="";
  document.getElementById("fd-cpf").value="";
  document.getElementById("fd-rg").value="";
  document.getElementById("fd-cpf").disabled=true;
  document.getElementById("fd-rg").disabled=true;
  carregarDadosSensiveisServidor(srvId).then(dados=>{
    if(dados){
      document.getElementById("fd-cpf").value=dados.cpf||"";
      document.getElementById("fd-rg").value=dados.rg||"";
    } else if(camposSensiveis){
      camposSensiveis.textContent="🔒 Acesso restrito — só Administrador/Administrativo ou o próprio servidor veem CPF/RG.";
    }
    document.getElementById("fd-cpf").disabled=false;
    document.getElementById("fd-rg").disabled=false;
  });
  document.getElementById("fd-nascimento").value=srv.nascimento||"";
  document.getElementById("fd-admissao").value=srv.admissao||"";
  document.getElementById("fd-telefone").value=srv.telefone||"";
  document.getElementById("fd-email").value=srv.email||"";
  document.getElementById("fd-endereco").value=srv.endereco||"";
  document.getElementById("fd-cargo").value=srv.cargo||"";
  document.getElementById("fd-funcao").value=srv.funcao||"";
  document.getElementById("fd-lotacao").value=srv.lotacao||"";
  document.getElementById("fd-unidade").value=srv.unidade||"";
  document.getElementById("fd-situacao").value=srv.situacao||"Ativo";
  document.getElementById("tl-titulo").value="";
  document.getElementById("tl-desc").value="";
  document.getElementById("tl-data").value=new Date().toISOString().slice(0,10);

  // Plantões
  let plantoesDocs=[];
  const plt=document.getElementById("ficha-plantoes");
  plt.innerHTML='<p class="hist-vazio">Carregando...</p>';
  try{
    const snap=await getDocs(query(collection(db,COL_PLANTAO),where("servidorId","==",srvId)));
    plantoesDocs=snap.docs.map(d=>d.data()).sort((a,b)=>b.data?.localeCompare?.(a.data)||0);
    plt.innerHTML=plantoesDocs.length?plantoesDocs.slice(0,20).map(r=>{
      const ic=r.status==="presente"?"✅":r.status==="ausente"?"❌":"⏰";
      return`<div class="hist-item" style="padding:7px 10px;margin-bottom:5px">
        <div style="font-size:.78rem">${ic} ${r.data} · ${r.jornada||""} · Entrada: ${r.entrada||"—"}</div>
        ${r.obs?`<div style="font-size:.7rem;color:var(--cinza)">${r.obs}</div>`:""}
      </div>`;}).join(""):'<p class="hist-vazio">Nenhum plantão registrado.</p>';
  }catch(e){plt.innerHTML='<p class="hist-vazio">Erro ao carregar.</p>';}

  // O.S
  let osDocs=[];
  const os=document.getElementById("ficha-os");
  os.innerHTML='<p class="hist-vazio">Carregando...</p>';
  try{
    const snap=await getDocs(query(collection(db,COL_OS),where("servidor","==",srv.nome)));
    osDocs=snap.docs.map(d=>d.data());
    os.innerHTML=osDocs.length?osDocs.map(r=>`
      <div class="hist-item" style="padding:7px 10px;margin-bottom:5px">
        <div style="font-size:.78rem">📄 O.S ${esc(r.numero)} · ${r.dataInicio} · <span style="color:${r.statusOS==="ativa"?"#fbbf24":r.statusOS==="concluida"?"#7dcea0":"#f1948a"}">${esc(r.statusOS)||"ativa"}</span></div>
        ${r.descricao?`<div style="font-size:.7rem;color:var(--cinza)">${esc(r.descricao.substring(0,60))}</div>`:""}
      </div>`).join(""):'<p class="hist-vazio">Nenhuma O.S.</p>';
  }catch(e){os.innerHTML='<p class="hist-vazio">Erro ao carregar.</p>';}

  // Ocorrências
  const oc=document.getElementById("ficha-ocorrencias");
  const ocLista=(window._ocCache||carregarOC()).filter(o=>o.servidor?.includes(srv.nome)||o.envolvidos?.includes(srv.nome));
  oc.innerHTML=ocLista.length?ocLista.map(o=>`
    <div class="hist-item" style="padding:7px 10px;margin-bottom:5px">
      <div style="font-size:.78rem">🚨 ${o.num} · ${o.data} · ${o.tipo}</div>
      <div style="font-size:.7rem;color:var(--cinza)">${o.local}</div>
    </div>`).join(""):'<p class="hist-vazio">Nenhuma ocorrência.</p>';

  // Equipamentos Acautelados (Armaria)
  const eq=document.getElementById("ficha-equipamentos");
  eq.innerHTML='<p class="hist-vazio">Carregando...</p>';
  try{
    const [armasSnap,coletesSnap]=await Promise.all([
      getDocs(query(collection(db,COL_ARMAS_IND),where("acautelamento.matricula","==",srv.matricula))),
      getDocs(query(collection(db,COL_COLETES),where("distribuicaoAtual.servidorMatricula","==",srv.matricula)))
    ]);
    const itens=[
      ...armasSnap.docs.map(d=>{const a=d.data();return`<span class="ic-img ic-arma"></span> ${a.tipo||""} ${a.marca||""} ${a.modelo||""} · Série: ${a.numeroSerie||"—"} · Desde: ${a.acautelamento?.dataEntrega||"—"}`;}),
      ...coletesSnap.docs.map(d=>{const c=d.data();return`<span class="ic-img ic-coletes"></span> Colete · Patr: ${c.patrimonio||"—"} · Série: ${c.numeroSerie||"—"} · Desde: ${c.distribuicaoAtual?.dataEntrega||"—"}`;})
    ];
    eq.innerHTML=itens.length?itens.map(t=>`<div class="hist-item" style="padding:7px 10px;margin-bottom:5px;font-size:.78rem">${t}</div>`).join(""):'<p class="hist-vazio">Nenhum equipamento acautelado no momento.</p>';
  }catch(e){eq.innerHTML='<p class="hist-vazio">Erro ao carregar equipamentos.</p>';}

  // Corregedoria (PADs em que é parte)
  const cor=document.getElementById("ficha-corregedoria");
  cor.innerHTML='<p class="hist-vazio">Carregando...</p>';
  try{
    const snapPad=await getDocs(query(collection(db,COL_PAD),where("servidor","==",srv.nome)));
    const pads=snapPad.docs.map(d=>d.data()).sort((a,b)=>(b.data||"").localeCompare(a.data||""));
    const labelStatus={recebido:"📥 Recebido",analise:"🔍 Em Análise",aberto:"📂 Aberto",arquivado:"🗄 Arquivado"};
    cor.innerHTML=pads.length?pads.map(p=>`
      <div class="hist-item" style="padding:7px 10px;margin-bottom:5px">
        <div style="font-size:.78rem">⚖️ ${p.numero} · ${p.data} · ${labelStatus[p.status]||p.status}</div>
        <div style="font-size:.7rem;color:var(--cinza)">${p.origem||""}</div>
      </div>`).join(""):'<p class="hist-vazio">Nenhum PAD registrado.</p>';
  }catch(e){cor.innerHTML='<p class="hist-vazio">Erro ao carregar.</p>';}

  // Linha do Tempo consolidada
  await renderTimelineGeral(srv,plantoesDocs,osDocs,ocLista);
}
window.abrirFicha=abrirFicha;

export async function salvarDadosPessoais(){
  if(!fichaAtualId)return alerta("Nenhum servidor selecionado.","erro");
  const cpf=v("fd-cpf"),rg=v("fd-rg");
  const dados={
    nome:v("fd-nome"),matricula:v("fd-matricula"),
    nascimento:v("fd-nascimento"),admissao:v("fd-admissao"),telefone:v("fd-telefone"),
    email:v("fd-email"),endereco:v("fd-endereco"),cargo:v("fd-cargo"),funcao:v("fd-funcao"),
    lotacao:v("fd-lotacao"),unidade:v("fd-unidade"),situacao:v("fd-situacao"),
    // limpa CPF/RG do documento principal (legível por qualquer aprovado) —
    // eles agora só existem na subcoleção dados_sensiveis, de leitura restrita.
    cpf:deleteField(),rg:deleteField()
  };
  if(fichaFotoBase64)dados.foto=fichaFotoBase64;
  if(!dados.nome||!dados.matricula)return alerta("Nome e matrícula são obrigatórios.","erro");
  try{
    await updateDoc(doc(db,COL_SERV,fichaAtualId),dados);
    await setDoc(doc(db,COL_SERV,fichaAtualId,"dados_sensiveis","dados"),
      {cpf,rg,email:dados.email},{merge:true});
    const idx=servidoresCache.findIndex(s=>s.id===fichaAtualId);
    if(idx>-1){servidoresCache[idx]={...servidoresCache[idx],...dados};delete servidoresCache[idx].cpf;delete servidoresCache[idx].rg;}
    await registrarAuditoria(`Dados pessoais atualizados: ${dados.nome}`,`Matrícula: ${dados.matricula}`,
      {modulo:"📁 Administrativo",registro:dados.matricula});
    alerta("Dados pessoais salvos!","ok");
    abrirFicha(fichaAtualId);
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.salvarDadosPessoais=salvarDadosPessoais;

export async function carregarDadosSensiveisServidor(srvId){
  try{
    const snap=await getDoc(doc(db,COL_SERV,srvId,"dados_sensiveis","dados"));
    return snap.exists()?snap.data():null;
  }catch(e){return null;} // permission-denied cai aqui — tratado como "sem acesso", não como erro
}

export function iniciarTecLimpeza(){
  document.getElementById("limpeza-grupos-lista").innerHTML=GRUPOS_LIMPEZA.map(g=>`
    <label class="hist-item" style="display:flex;align-items:flex-start;gap:10px;cursor:pointer">
      <input type="checkbox" class="limpeza-check" data-grupo="${g.id}" style="width:18px;height:18px;flex-shrink:0;margin-top:2px">
      <span style="flex:1">
        <div class="hist-tipo" style="margin:0">${g.label}</div>
        ${g.aviso?`<div style="font-size:.65rem;color:#f1948a;margin-top:2px">${g.aviso}</div>`:""}
      </span>
    </label>`).join("");
}

export function marcarTodosGruposLimpeza(valor){
  document.querySelectorAll(".limpeza-check").forEach(c=>c.checked=valor);
}
window.marcarTodosGruposLimpeza=marcarTodosGruposLimpeza;

export async function executarLimpezaSelecionada(){
  if(!_ehAdmin())return alerta("Apenas o Administrador pode limpar dados.","erro");
  const idsMarcados=[...document.querySelectorAll(".limpeza-check:checked")].map(c=>c.dataset.grupo);
  if(!idsMarcados.length)return alerta("Selecione ao menos uma área para limpar.","erro");
  const grupos=GRUPOS_LIMPEZA.filter(g=>idsMarcados.includes(g.id));

  alerta("Contando registros...","aviso");
  const contagemPorGrupo=[];
  for(const g of grupos){
    let total=0;
    for(const col of g.cols)total+=(await getDocs(collection(db,col))).size;
    contagemPorGrupo.push({g,total});
  }
  const resumo=contagemPorGrupo.map(({g,total})=>`${g.label}: ${total} registro(s)`).join("\n");
  if(!confirm(`Isso vai APAGAR PERMANENTEMENTE:\n\n${resumo}\n\n`+
    "As telas e funções continuam existindo, só os dados somem. Essa ação não pode ser desfeita. Continuar?"))return;
  if(!confirm("Tem certeza mesmo? Essa é a confirmação final."))return;

  try{
    const relatorio=[];
    for(const {g} of contagemPorGrupo){
      let apagados=0;
      for(const col of g.cols){
        const snap=await getDocs(collection(db,col));
        for(const d of snap.docs){
          if(g.subSensivel){ // ficha funcional: também apaga a subcoleção restrita de CPF/RG
            try{await deleteDoc(doc(db,col,d.id,"dados_sensiveis","dados"));}catch(e){}
          }
          await deleteDoc(doc(db,col,d.id));
          apagados++;
        }
      }
      if(g.zeraContador)await setDoc(doc(db,g.zeraContador,"contador"),{ultimo:0});
      relatorio.push(`${g.label}: ${apagados}`);
    }
    // Grava o log DEPOIS de apagar — se "Log de Auditoria" foi um dos grupos
    // marcados, este é o único registro que sobra, documentando a limpeza.
    await registrarAuditoria("Limpeza de dados de teste",relatorio.join(" · "),
      {modulo:"💻 Tecnologia",resultado:"Limpeza administrativa"});
    alerta("Limpeza concluída!\n"+relatorio.join(" · "),"ok");
    marcarTodosGruposLimpeza(false);
  }catch(err){alerta("Erro na limpeza: "+err.message,"erro");}
}
window.executarLimpezaSelecionada=executarLimpezaSelecionada;

export async function migrarCpfRgRestrito(){
  if(!_ehAdmin())return alerta("Apenas o Administrador pode rodar essa migração.","erro");
  if(!confirm("Isso vai mover CPF e RG de todos os servidores para uma área de leitura restrita "+
    "e removê-los do documento principal (hoje visível a qualquer usuário aprovado). "+
    "É uma operação única. Continuar?"))return;
  try{
    const snap=await getDocs(collection(db,COL_SERV));
    let migrados=0,semDados=0;
    for(const d of snap.docs){
      const srv=d.data();
      if(srv.cpf===undefined&&srv.rg===undefined){semDados++;continue;}
      await setDoc(doc(db,COL_SERV,d.id,"dados_sensiveis","dados"),
        {cpf:srv.cpf||"",rg:srv.rg||"",email:srv.email||""},{merge:true});
      await updateDoc(doc(db,COL_SERV,d.id),{cpf:deleteField(),rg:deleteField()});
      migrados++;
    }
    await registrarAuditoria("Migração CPF/RG para acesso restrito",
      `${migrados} servidor(es) migrado(s), ${semDados} já sem CPF/RG no documento principal.`,
      {modulo:"💻 Tecnologia",resultado:"Migração administrativa"});
    alerta(`Migração concluída: ${migrados} servidor(es) atualizado(s).`,"ok");
  }catch(err){alerta("Erro na migração: "+err.message,"erro");}
}
window.migrarCpfRgRestrito=migrarCpfRgRestrito;

export async function adicionarEventoTimeline(){
  if(!fichaAtualId)return alerta("Nenhum servidor selecionado.","erro");
  const titulo=v("tl-titulo"),desc=v("tl-desc"),data=v("tl-data")||new Date().toISOString().slice(0,10);
  if(!titulo)return alerta("Informe um título para o evento.","erro");
  try{
    await addDoc(collection(db,COL_TIMELINE),{
      servidorId:fichaAtualId,data,
      hora:new Date().toTimeString().slice(0,5),
      titulo,descricao:desc,
      usuarioResponsavel:usuarioLogado?.nome||"Sistema",
      criadoEm:serverTimestamp()
    });
    await registrarAuditoria(`Evento adicionado à timeline: ${titulo}`,`Servidor: ${v("fd-nome")}`);
    document.getElementById("tl-titulo").value="";
    document.getElementById("tl-desc").value="";
    alerta("Evento adicionado à linha do tempo!","ok");
    const srv=servidoresCache.find(s=>s.id===fichaAtualId);
    // recarrega apenas a timeline sem refazer toda a ficha
    const plt=(await getDocs(query(collection(db,COL_PLANTAO),where("servidorId","==",fichaAtualId)))).docs.map(d=>d.data());
    const oss=(await getDocs(query(collection(db,COL_OS),where("servidor","==",srv.nome)))).docs.map(d=>d.data());
    const ocs=(window._ocCache||carregarOC()).filter(o=>o.servidor?.includes(srv.nome)||o.envolvidos?.includes(srv.nome));
    await renderTimelineGeral(srv,plt,oss,ocs);
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.adicionarEventoTimeline=adicionarEventoTimeline;

export async function renderTimelineGeral(srv,plantoesDocs,osDocs,ocLista){
  const el=document.getElementById("ficha-timeline");
  if(!el)return;
  el.innerHTML='<p class="hist-vazio">Carregando...</p>';
  try{
    const eventos=[];
    if(srv.admissao)eventos.push({data:srv.admissao,hora:"00:00",icone:"🎖",titulo:"Admissão",corpo:`Ingresso na corporação como ${srv.cargo||"servidor"}.`,usuario:"Sistema"});
    (plantoesDocs||[]).forEach(r=>eventos.push({data:r.data,hora:r.entrada||"00:00",icone:"🕐",titulo:"Plantão",corpo:`${r.jornada||""} · Status: ${r.status||"—"}${r.obs?" · "+r.obs:""}`,usuario:r.supervisorNome||"—"}));
    (osDocs||[]).forEach(r=>eventos.push({data:r.dataInicio,hora:"00:00",icone:"📄",titulo:`Ordem de Serviço ${r.numero||""}`,corpo:r.descricao||"Sem descrição",usuario:r.supervisorNome||"—"}));
    (ocLista||[]).forEach(o=>eventos.push({data:o.data,hora:o.hora||"00:00",icone:"🚨",titulo:`Ocorrência ${o.num||""} — ${o.tipo||""}`,corpo:`${o.local||""}${o.desc?" — "+o.desc:""}`,usuario:o.registradoPor||"—"}));
    try{
      const snap=await getDocs(query(collection(db,COL_TIMELINE),where("servidorId","==",fichaAtualId)));
      snap.docs.forEach(d=>{const r=d.data();eventos.push({data:r.data,hora:r.hora||"00:00",icone:"📌",titulo:r.titulo,corpo:r.descricao||"",usuario:r.usuarioResponsavel||"—"});});
    }catch(e){}
    eventos.sort((a,b)=>(b.data||"").localeCompare(a.data||"")||(b.hora||"").localeCompare(a.hora||""));
    el.innerHTML=!eventos.length?'<p class="hist-vazio">Nenhum evento registrado ainda.</p>'
      :eventos.map(e=>`
        <div class="hist-item" style="padding:8px 10px;margin-bottom:6px">
          <div style="font-size:.78rem">${e.icone} <strong>${esc(e.titulo)}</strong></div>
          <div style="font-size:.7rem;color:var(--cinza)">📅 ${e.data||"—"}${e.hora&&e.hora!=="00:00"?" · 🕐 "+esc(e.hora):""} · 👤 ${esc(e.usuario)}</div>
          ${e.corpo?`<div style="font-size:.72rem;margin-top:3px">${esc(e.corpo)}</div>`:""}
        </div>`).join("");
  }catch(err){el.innerHTML=`<p class="hist-vazio">Erro: ${err.message}</p>`;}
}

export async function renderArquivos(){
  const q=(v("arq-filtro")||"").toLowerCase();
  const mod=v("arq-filtro-modulo");
  const el=document.getElementById("arquivos-lista");
  el.innerHTML='<p class="hist-vazio">Carregando...</p>';
  await carregarFotosCache();
  let lista=_fotosCache;
  if(q)lista=lista.filter(f=>f.titulo?.toLowerCase().includes(q));
  if(mod)lista=lista.filter(f=>f.modulo===mod);
  const cnt=document.getElementById("arq-contador");
  if(cnt)cnt.textContent=lista.length?`${lista.length} arquivo(s)`:"";
  el.innerHTML=lista.length?lista.map(f=>`
    <div class="hist-item">
      <img src="${f.dataUrl}" style="width:100%;max-height:160px;object-fit:cover;border-radius:6px;margin-bottom:6px">
      <div class="hist-tipo">${esc(f.titulo)}</div>
      <div class="hist-data">📁 ${esc(f.modulo)} · 👤 ${esc(f.usuario)||"—"} · 📅 ${esc(f.data)}</div>
      <div style="display:flex;gap:6px;margin-top:6px">
        <a class="btn btn-sm btn-cinza" href="${f.dataUrl}" download="${esc(f.titulo)}">⬇ Baixar</a>
        <button class="btn btn-sm btn-perigo" onclick="excluirArquivoGerenciador('${f.id}')">🗑 Excluir</button>
      </div>
    </div>`).join(""):'<p class="hist-vazio">Nenhum arquivo encontrado.</p>';
}
window.renderArquivos=renderArquivos;

export async function excluirArquivoGerenciador(id){
  if(!confirm("Excluir este arquivo?"))return;
  try{
    await deleteDoc(doc(db,COL_FOTOS,id));
    await renderArquivos();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.excluirArquivoGerenciador=excluirArquivoGerenciador;

