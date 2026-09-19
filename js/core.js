import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, getFirestore, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { createUserWithEmailAndPassword, getAuth, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { _ehAdmin, carregarServidoresAdmin, iniciarFichaServidor, iniciarFotos, iniciarTecLimpeza, renderArquivos } from "./administrativo.js";
import { atualizarBadge, atualizarDashboardArmaria, carregarArmasInd, carregarColetes, carregarMunicoesCache, carregarViaturasCache, diasParaVencer, iniciarAcautelarArmas, iniciarRecebimentoArmas, renderHistorico, renderMunicoes } from "./armaria.js";
import { iniciarFiscTela, renderHistFisc, renderHistOS } from "./inspetoria.js";
import { iniciarAssuncaoPlantaoServidor, iniciarMeuPainel } from "./meu_painel.js";
import { atualizarBadgeCmdOc, carregarCentralAdministrativa, carregarDashboard, carregarOC, iniciarBoletim, iniciarOcData, iniciarOcorrenciasPlantao, iniciarRelatorios, renderOcorrenciasComando } from "./ocorrencias.js";
import { atualizarBadgeCorregedoria, carregarInteligenciaDisciplinar, carregarOcorrencias, iniciarPADTela, renderCaixaEntradaCorregedoria } from "./pad.js";
import { carregarDashboardPatrimonio, carregarTecIntegracoes, carregarTecMonitoramento, carregarTecnologia, iniciarInventario, iniciarTecDispositivos, iniciarTecSeguranca, renderBens } from "./patrimonio.js";
import { atualizarBadgeHorasExtrasAdmin, atualizarBadgePermutasAdmin, carregarBancoHoras, carregarDashboardCorregedoria, carregarDashboardHorasExtras, carregarDashboardSecretario, carregarPlantaoAdmin, carregarSrvSelectBH, iniciarAusenciaPlantao, iniciarEscala, iniciarForaEscala, iniciarLancarHoraExtraordinaria, iniciarPermutaServidor, iniciarPlantao, iniciarSaidaPlantao, renderAnaliseHorasExtras, renderEquipesLancadas, renderHistStatus, renderPermutasAdmin, toggleOrigemHoraBH } from "./plantao.js";
import { atualizarBadgeDecisaoTotal, iniciarInspPassagens, iniciarInspPostos, iniciarPostoFixo, renderDecisao } from "./posto_fixo.js";
import { iniciarChamados, renderErros, renderViaturas } from "./tecnologia.js";

export const firebaseConfig = {
  apiKey:"AIzaSyCIW7CeYfeEYBxfjxPdCvRvu3IkWIKvcd8",
  authDomain:"policia-caruaru.firebaseapp.com",
  projectId:"policia-caruaru",
  storageBucket:"policia-caruaru.firebasestorage.app",
  messagingSenderId:"929007613716",
  appId:"1:929007613716:web:11009e8a2dce37dc503401"
};

export const app=initializeApp(firebaseConfig);

export const db=getFirestore(app);

export const auth=getAuth(app);

export let adminAutenticado=false;

export const COL_USUARIOS="usuarios";

export const COL_AUDITORIA="auditoria";

export const COL_PLANTAO="plantao";

export const COL_SERV="servidores_plantao";

export const COL_FISC="fiscalizacao";

export const COL_OS="ordens_servico";

export const COL_NOTIF="notificacoes";

export const COL_LOG="log_acessos";

export const TIMEOUT_MS=10*60*1000;

export async function hashSenha(senha){
  const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(senha));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

export let _timeoutSessao=null;

export let _avisoTimeout=null;

export function resetarTimeout(){
  clearTimeout(_timeoutSessao);
  clearTimeout(_avisoTimeout);
  if(!usuarioLogado)return;
  // aviso 1 minuto antes
  _avisoTimeout=setTimeout(()=>{
    alerta("⚠️ Sessão expira em 1 minuto por inatividade.","aviso");
  }, TIMEOUT_MS - 60000);
  // logout automático
  _timeoutSessao=setTimeout(()=>{
    alerta("🔒 Sessão encerrada por inatividade.","aviso");
    setTimeout(()=>sairPorTimeoutComLog(),2000);
  }, TIMEOUT_MS);
}

export function sairPorTimeout(){
  usuarioLogado=null;
  try{signOut(auth);}catch(e){}
  if(notifInterval){clearInterval(notifInterval);notifInterval=null;}
  clearTimeout(_timeoutSessao);
  clearTimeout(_avisoTimeout);
  // volta ao menu e mostra tela de login
  TELAS.forEach(t=>document.getElementById(t)?.classList.remove("ativa"));
  document.getElementById("menu").style.display="block";
  atualizarBadge();atualizarMenu();
  ir("login");
}

export function registrarAtividade(){
  if(usuarioLogado)resetarTimeout();
}

export async function registrarLog(tipo, detalhes=""){
  if(!usuarioLogado)return;
  try{
    // tenta obter info do dispositivo
    const dispositivo=`${navigator.platform||"desconhecido"} — ${navigator.userAgent.substring(0,60)}`;
    await addDoc(collection(db,COL_LOG),{
      usuarioId:    usuarioLogado.id||"",
      usuarioNome:  usuarioLogado.nome||"",
      usuarioEmail: usuarioLogado.email||"",
      matricula:    usuarioLogado.matricula||"",
      tipo,         // "login" | "logout" | "timeout" | "tentativa_falha"
      detalhes,
      dispositivo,
      hora:         agora(),
      criadoEm:     serverTimestamp()
    });
  }catch(e){ console.warn("Log:",e.message); }
}

export const PERMISSOES=["checklist","historico","inspetoria","administrativo","videomonitor","inteligencia","comando","patrimonio","tecnologia","fotos","escala","dashboard","corregedoria","meupainel","secretario"];

export const FISC_MAP={
  "fisc-prefeitura":"Prefeitura","fisc-rendeiras":"Rendeiras","fisc-marco":"Marco Zero",
  "fisc-saldanha":"Saldanha da Gama","fisc-po":"Patrulhamento (P.O)","fisc-pv":"Patrulhamento Viatura (P.V)",
  "fisc-pinheirao":"Pinheirão"
};

export let usuarioLogado=null,contadorArmas=0,todosRegistros=[],servidoresCache=[],
    _postosCache=[],_postoEquipTemp=[],_postoOpsCache=[],_srvAtivosCache=[],
    _meuPostoAtual=null,_meuPostoReceber=null,_meuPostoOperacaoPendente=null,
    _verifTemp=null,_recebTemp=null,
    plantaoStatusAtual=null,servidorSelecionado=null,
    registrosPlantaoLocal={},auditoriaSelecionados=new Set(),
    editandoId=null, // id do doc sendo editado
    _unsubAssuncaoPlantao=null, _plantaoAssuncaoAtual=null, // listener em tempo real (servidor)
    _sessaoIniciadaEm=0;

export let plantaoNumeroAtual="",equipamentosEntreguesCount=0,
    _geoPlantao=null,_atrasoModalAtual={atrasado:false,minutos:0};

export const TELAS=["cadastro","login","checklist","armas","municoes","viaturas","historico",
  "admin","inspetoria","plantao","plantao-fora-escala","saida-plantao","ausencia-plantao","hist-presentes","hist-ausentes","hist-atrasados",
  "fiscalizacao","fisc-prefeitura","fisc-rendeiras","fisc-marco","fisc-saldanha","fisc-po","fisc-pv","fisc-pinheirao",
  "hist-fisc-prefeitura","hist-fisc-rendeiras","hist-fisc-marco","hist-fisc-saldanha","hist-fisc-po","hist-fisc-pv","hist-fisc-pinheirao",
  "ordem-servico","os-temporaria","os-permanente","hist-os-temporaria","hist-os-permanente",
  "administrativo","videomonitor","inteligencia","comando","patrimonio","tecnologia",
  "editar-usuario","editar-servidor","editar-plantao-reg","fotos","escala",
  "dashboard","ocorrencias","ficha-servidor","ficha-individual","banco-horas","boletim","relatorios",
  "corregedoria","corregedoria-pads","pad-recebido","pad-analise","pad-aberto","pad-arquivado",
  "armas-gestao","acautelar-armas","recebimento-armas","municoes-gestao","viaturas-gestao","dashboard-comando","coletes-gestao","dashboard-armaria",
  "central-decisao","decisao-os","decisao-fisc","cmd-ocorrencia","meu-painel","plantao-ocorrencias","corregedoria-ia","pesquisa-global",
  "patrimonio-bens","patrimonio-inventario","chamados-tecnicos",
  "tec-perfis","tec-config","tec-arquivos","tec-erros","tec-seguranca","tec-dispositivos","tec-monitoramento","tec-integracoes","tec-backup",
  "mp-assumir-plantao","mp-permuta","administrativo-permutas",
  "lancar-hora-extraordinaria","analise-horas-extras","dashboard-horas-extras","equipes-lancadas",
  "secretario","secretario-equipe-detalhe","corregedoria-pesquisa","mp-plantoes-mes","mp-banco-horas-detalhe",
  "tec-auditoria","insp-postos","insp-passagens","mp-posto-fixo","tec-limpeza"];

export function ir(id){
  // encerra o listener em tempo real da Assunção de Plantão ao sair da tela
  if(id!=="mp-assumir-plantao"&&typeof _unsubAssuncaoPlantao==="function"){
    _unsubAssuncaoPlantao();_unsubAssuncaoPlantao=null;
  }
  if(MODULO_POR_SECAO[id]) MODULO_ATUAL=id; // memoriza o módulo de nível 1 para a auditoria
  TELAS.forEach(t=>document.getElementById(t)?.classList.remove("ativa"));
  document.getElementById("menu").style.display="none";
  document.getElementById(id)?.classList.add("ativa");
  if(id==="historico")       renderHistorico();
  if(id==="armas")           ir("armas-gestao"); // redireciona para gestão
  if(id==="armas-gestao")    {carregarArmasInd();carregarSrvSelectBH();}
  if(id==="acautelar-armas") iniciarAcautelarArmas();
  if(id==="recebimento-armas") iniciarRecebimentoArmas();
  if(id==="coletes-gestao")  carregarColetes();
  if(id==="dashboard-armaria") atualizarDashboardArmaria();
  if(id==="municoes")        ir("municoes-gestao");
  if(id==="municoes-gestao") renderMunicoes();
  if(id==="viaturas")        ir("viaturas-gestao");
  if(id==="viaturas-gestao") renderViaturas();
  if(id==="admin")           {carregarAdmin();carregarServidoresAdmin();}
  if(id==="tec-auditoria")   carregarAuditoria();
  if(id==="tec-limpeza")     iniciarTecLimpeza();
  if(id==="plantao")         iniciarPlantao();
  if(id==="plantao-fora-escala") iniciarForaEscala();
  if(id==="saida-plantao")   iniciarSaidaPlantao();
  if(id==="ausencia-plantao") iniciarAusenciaPlantao();
  if(id==="hist-presentes")  renderHistStatus("presente");
  if(id==="hist-ausentes")   renderHistStatus("ausente");
  if(id==="hist-atrasados")  renderHistStatus("atrasado");
  if(Object.keys(FISC_MAP).includes(id)) iniciarFiscTela(id);
  if(id.startsWith("hist-fisc-")) renderHistFisc(id);
  if(id==="fotos")           iniciarFotos();
  if(id==="escala")          iniciarEscala();
  if(id==="dashboard")       carregarDashboard();
  if(id==="ocorrencias")     {carregarOcorrencias();iniciarOcData();}
  if(id==="ficha-servidor")  iniciarFichaServidor();
  if(id==="banco-horas")     {carregarBancoHoras();carregarSrvSelectBH();toggleOrigemHoraBH();atualizarBadgeHorasExtrasAdmin();}
  if(id==="boletim")         iniciarBoletim();
  if(id==="relatorios")      iniciarRelatorios();
  if(["pad-recebido","pad-analise","pad-aberto","pad-arquivado"].includes(id)) iniciarPADTela(id);
  if(id==="dashboard-comando") carregarDashboardComando();
  if(id==="comando") carregarSalaSituacao();
  if(id==="hist-os-temporaria") renderHistOS("temporaria");
  if(id==="hist-os-permanente") renderHistOS("permanente");
  if(id==="comando"||id==="central-decisao") atualizarBadgeDecisaoTotal();
  if(id==="decisao-os")   renderDecisao("os");
  if(id==="decisao-fisc") renderDecisao("fisc");
  if(id==="corregedoria") {renderCaixaEntradaCorregedoria();carregarAlertasCorregedoria();carregarDashboardCorregedoria();}
  if(id==="corregedoria-pesquisa") document.getElementById("cor-pesq-termo").value="";
  if(id==="cmd-ocorrencia"){ carregarOcorrencias().then(renderOcorrenciasComando); }
  if(id==="meu-painel")     iniciarMeuPainel();
  if(id==="mp-posto-fixo")  iniciarPostoFixo();
  if(id==="insp-postos")    iniciarInspPostos();
  if(id==="insp-passagens") iniciarInspPassagens();
  if(id==="plantao-ocorrencias") iniciarOcorrenciasPlantao();
  if(id==="corregedoria-ia") carregarInteligenciaDisciplinar();
  if(id==="administrativo") {carregarCentralAdministrativa();atualizarBadgePermutasAdmin();}
  if(id==="patrimonio") carregarDashboardPatrimonio();
  if(id==="patrimonio-bens") renderBens();
  if(id==="patrimonio-inventario") iniciarInventario();
  if(id==="tecnologia") carregarTecnologia();
  if(id==="chamados-tecnicos") iniciarChamados();
  if(id==="tec-perfis") renderPerfis();
  if(id==="tec-config") carregarConfigGeral();
  if(id==="tec-arquivos") renderArquivos();
  if(id==="tec-erros") renderErros();
  if(id==="tec-seguranca") iniciarTecSeguranca();
  if(id==="tec-dispositivos") iniciarTecDispositivos();
  if(id==="tec-monitoramento") carregarTecMonitoramento();
  if(id==="tec-integracoes") carregarTecIntegracoes();
  if(id==="tec-backup") document.getElementById("integridade-resultado").innerHTML="";
  if(id==="mp-assumir-plantao") iniciarAssuncaoPlantaoServidor();
  if(id==="mp-permuta") iniciarPermutaServidor();
  if(id==="administrativo-permutas") renderPermutasAdmin();
  if(id==="lancar-hora-extraordinaria") iniciarLancarHoraExtraordinaria();
  if(id==="equipes-lancadas") renderEquipesLancadas();
  if(id==="secretario") carregarDashboardSecretario();
  if(id==="analise-horas-extras") renderAnaliseHorasExtras();
  if(id==="dashboard-horas-extras") carregarDashboardHorasExtras();
}

export function irProtegido(destino,permissao){
  if(!usuarioLogado){alerta("Faça login para acessar esta área.","aviso");
    document.getElementById("aviso-login").style.display="block";return;}
  const perms=usuarioLogado.permissoes||{};
  if(perms[permissao]===false){alerta("Você não tem permissão para esta área.","erro");return;}
  ir(destino);
}

export function voltar(){
  TELAS.forEach(t=>document.getElementById(t)?.classList.remove("ativa"));
  document.getElementById("menu").style.display="block";
  atualizarBadge();atualizarMenu();atualizarBadgeCorregedoria();atualizarBadgeCmdOc();atualizarBadgesHome();
}

window.ir=ir;

window.irProtegido=irProtegido;

window.voltar=voltar;

export function irMeuPainel(){
  irProtegido("meu-painel","meupainel");
}
window.irMeuPainel=irMeuPainel;

export function atualizarMenu(){
  const logado=!!usuarioLogado,perms=usuarioLogado?.permissoes||{};
  const botoes=[
    {id:"btn-secretario",     perm:"secretario"},
    {id:"btn-checklist",      perm:"checklist"},
    {id:"btn-dashboard",      perm:"dashboard"},
    {id:"btn-inspetoria",     perm:"inspetoria"},
    {id:"btn-administrativo", perm:"administrativo"},
    {id:"btn-videomonitor",   perm:"videomonitor"},
    {id:"btn-inteligencia",   perm:"inteligencia"},
    {id:"btn-comando",        perm:"comando"},
    {id:"btn-corregedoria",   perm:"corregedoria"},
    {id:"btn-patrimonio",     perm:"patrimonio"},
    {id:"btn-tecnologia",     perm:"tecnologia"},
    {id:"btn-meupainel",      perm:"meupainel"},
  ];
  botoes.forEach(({id,perm})=>{
    const btn=document.getElementById(id);if(!btn)return;
    const bloqueado=!logado||perms[perm]===false;
    btn.classList.toggle("btn-bloqueado",bloqueado);
  });
  document.getElementById("aviso-login").style.display=logado?"none":"block";
  document.getElementById("btn-sair").style.display=logado?"block":"none";
  document.getElementById("usuario-logado").style.display=logado?"block":"none";
}

export function v(id){return(document.getElementById(id)?.value||"").trim();}

export function esc(valor){
  if(valor===null||valor===undefined)return"";
  return String(valor)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

export function normalizarMatricula(m){return(m??"").toString().trim().toUpperCase().replace(/^0+(?=\d)/,"");}

export function alerta(msg,tipo){
  tipo=tipo||"ok";
  // snackbar discreto: some rápido em sucessos, um pouco mais devagar em erros/avisos
  const el=document.getElementById("alerta-global");
  el.textContent=msg;el.className="alerta-box ativa "+tipo;
  clearTimeout(window._at);
  window._at=setTimeout(()=>el.classList.remove("ativa"),tipo==="ok"?1600:3200);

  // feedback extra: pisca o próprio botão que disparou a ação (verde/vermelho)
  const alvo=document.activeElement;
  if(alvo&&(alvo.tagName==="BUTTON"||alvo.tagName==="A")){
    const classe=tipo==="erro"?"flash-erro":tipo==="ok"?"flash-ok":"";
    if(classe){
      alvo.classList.remove("flash-ok","flash-erro");
      void alvo.offsetWidth;
      alvo.classList.add(classe);
      setTimeout(()=>alvo.classList.remove(classe),650);
    }
  }
}

export function setBtnLoad(id,on,label="Entrar"){
  const b=document.getElementById(id);if(!b)return;
  b.disabled=on;b.textContent=on?"Aguarde...":label;
}

export function tsStr(ts){if(!ts)return"";const d=ts.toDate?ts.toDate():new Date(ts);return d.toLocaleString("pt-BR");}

export function tsData(ts){if(!ts)return"";const d=ts.toDate?ts.toDate():new Date(ts);return d.toISOString().slice(0,10);}

export function agora(){return new Date().toLocaleString("pt-BR");}

export function obterLocalizacao(){
  const box=document.getElementById("mapa-plantao");
  const info=document.getElementById("loc-info");
  if(!box||!info)return;
  box.style.display="block";
  if(!navigator.geolocation){
    info.innerHTML='📍 Geolocalização não suportada neste navegador.';return;
  }
  info.textContent='📍 Obtendo localização...';
  navigator.geolocation.getCurrentPosition(pos=>{
    const lat=pos.coords.latitude.toFixed(6),lng=pos.coords.longitude.toFixed(6);
    _geoPlantao={lat,lng};
    const url=`https://maps.google.com/maps?q=${lat},${lng}&z=16`;
    box.innerHTML=`
      <div style="text-align:center;padding:12px">
        <div style="font-size:.75rem;color:var(--cinza);margin-bottom:8px">📍 Lat: ${lat} · Lng: ${lng}</div>
        <a href="${url}" target="_blank" rel="noopener"
           style="display:inline-block;padding:10px 20px;background:rgba(66,133,244,.2);border:1px solid rgba(66,133,244,.5);
           border-radius:8px;color:#90c2fa;font-family:'Oswald',sans-serif;font-size:.8rem;letter-spacing:1px;
           text-decoration:none;text-transform:uppercase">
          🗺 Abrir no Google Maps
        </a>
        <div style="font-size:.65rem;color:var(--cinza);margin-top:6px">Toque para ver sua localização</div>
      </div>`;
  },err=>{
    box.innerHTML=`<div style="text-align:center;padding:12px;font-size:.75rem;color:var(--cinza)">
      📍 Localização não disponível — verifique as permissões do navegador.</div>`;
  },{enableHighAccuracy:true,timeout:10000});
}

export async function enviarCadastro(){
  const nome=v("nome"),nasc=v("data"),cpf=v("cpf"),mat=v("matricula"),
        email=v("email").toLowerCase(),senha=v("senha");
  if(!nome||!nasc||!cpf||!mat||!email||!senha)return alerta("Preencha todos os campos.","erro");
  if(senha.length<6)return alerta("Senha deve ter no mínimo 6 caracteres.","erro");
  try{
    // Cria a conta de autenticação real no Firebase Authentication.
    // O próprio Firebase Auth já impede e-mails duplicados (erro
    // "auth/email-already-in-use" tratado mais abaixo).
    const cred=await createUserWithEmailAndPassword(auth,email,senha);
    const uid=cred.user.uid;

    // O documento do usuário usa o mesmo ID da conta de autenticação (uid).
    // A senha NÃO é mais armazenada no Firestore — quem guarda isso agora é
    // o Firebase Authentication.
    // IMPORTANTE: precisa ser criado ENQUANTO a pessoa ainda está autenticada
    // (as regras exigem request.auth.uid == userId nesse momento).
    await setDoc(doc(db,COL_USUARIOS,uid),{
      nome,nascimento:nasc,cpf,matricula:mat,email,
      status:"pendente",
      permissoes:{checklist:true,historico:true,inspetoria:true,administrativo:false,videomonitor:false,inteligencia:false,comando:false,patrimonio:false,tecnologia:false,fotos:true,escala:false,dashboard:true,corregedoria:false,meupainel:true},criadoEm:serverTimestamp()
    });

    // createUserWithEmailAndPassword deixou a pessoa "logada" — como o
    // cadastro ainda depende de aprovação do admin, só agora saímos dessa sessão.
    await signOut(auth);

    alerta("Cadastro enviado! Aguarde aprovação do administrador.","ok");
    ["nome","data","cpf","matricula","email","senha"].forEach(id=>document.getElementById(id).value="");
    setTimeout(()=>{window.location.href=`mailto:valmir.silva.adm@hotmail.com?subject=Novo%20cadastro%20pendente&body=`+
      encodeURIComponent(`Novo cadastro:\n\nNome: ${nome}\nE-mail: ${email}\nMatrícula: ${mat}`);},1500);
  }catch(err){
    let msg="Erro: "+err.message+(err.code?` (código: ${err.code})`:"");
    if(err.code==="auth/email-already-in-use")msg="Este e-mail já está cadastrado.";
    else if(err.code==="auth/weak-password")msg="Senha muito curta (mínimo 6 caracteres).";
    else if(err.code==="auth/invalid-email")msg="E-mail inválido.";
    alerta(msg,"erro");
  }
}
window.enviarCadastro=enviarCadastro;

export async function logar(){
  const email=v("loginEmail").toLowerCase(),senha=v("loginSenha");
  if(!email||!senha)return alerta("Preencha e-mail e senha.","erro");
  setBtnLoad("btn-entrar",true);
  try{
    const cred=await signInWithEmailAndPassword(auth,email,senha);
    const uid=cred.user.uid;
    let docSnap=await getDoc(doc(db,COL_USUARIOS,uid));

    // Conta de super-admin (coleção "admins") que nunca teve cadastro em "usuarios"
    // — acontecia com o login secreto antigo, que não passava por aqui. Cria o
    // cadastro na hora, já aprovado e com acesso total, pra não travar o acesso.
    if(!docSnap.exists()){
      try{
        const souAdminSnap=await getDoc(doc(db,"admins",uid));
        if(souAdminSnap.exists()){
          const dadosNovo={
            nome:email.split("@")[0],email,matricula:"",cpf:"",
            status:"aprovado",ativo:true,permissoes:{},
            criadoEm:serverTimestamp(),criadoAutomaticamente:"conta de admin sem cadastro prévio"
          };
          await setDoc(doc(db,COL_USUARIOS,uid),dadosNovo);
          docSnap=await getDoc(doc(db,COL_USUARIOS,uid));
        }
      }catch(e){}
    }

    setBtnLoad("btn-entrar",false);

    if(!docSnap.exists()){
      await signOut(auth);
      return alerta("Cadastro não encontrado. Contate o administrador.","erro");
    }
    const usuario=docSnap.data();
    if(usuario.status==="pendente"){
      await signOut(auth);
      return alerta("Cadastro aguarda aprovação.","aviso");
    }
    if(usuario.status==="rejeitado"){
      await signOut(auth);
      return alerta("Cadastro rejeitado. Contate o administrador.","erro");
    }
    if(usuario.ativo===false){
      await signOut(auth);
      await addDoc(collection(db,COL_LOG),{
        usuarioId:uid,usuarioNome:usuario.nome||"",usuarioEmail:usuario.email||"",matricula:usuario.matricula||"",
        tipo:"tentativa_falha",detalhes:"Tentativa de login em conta desativada pela Tecnologia",
        dispositivo:navigator.userAgent.substring(0,60),hora:agora(),criadoEm:serverTimestamp()
      });
      return alerta("Sua conta foi desativada. Contate a Tecnologia.","erro");
    }

    // Modo de Manutenção: bloqueia usuários comuns, libera administradores
    // (inclui quem tem a permissão "tecnologia", que já equivale a admin).
    const ehAdminOuTecnologia = adminAutenticado ||
      (usuario.status==="aprovado" && usuario.permissoes?.tecnologia!==false);
    if(!ehAdminOuTecnologia){
      const statusManutencao=await verificarModoManutencao();
      if(statusManutencao.bloqueado){
        await signOut(auth);
        return alerta("🛠 "+statusManutencao.mensagem,"aviso");
      }
    }

    usuarioLogado={...usuario,id:uid};
    _sessaoIniciadaEm=Date.now();
    document.getElementById("loginEmail").value="";
    document.getElementById("loginSenha").value="";
    const nome1=usuario.nome.split(" ")[0];
    document.getElementById("usuario-logado").textContent=`✓ ${nome1}`;

    // log de acesso bem-sucedido
    await registrarLog("login",`Login realizado — ${nome1}`);

    // inicia timeout de sessão
    resetarTimeout();

    // inicia verificação periódica de notificações (badges dos módulos)
    iniciarPollingNotif();
    alerta(`Bem-vindo, ${nome1}!`,"ok");
    voltar();
  }catch(err){
    setBtnLoad("btn-entrar",false);
    let msg="E-mail ou senha incorretos.";
    if(err.code==="auth/too-many-requests")msg="Muitas tentativas. Aguarde alguns minutos.";
    else if(err.code==="auth/user-disabled")msg="Conta desativada. Contate o administrador.";
    try{
      await addDoc(collection(db,COL_LOG),{
        usuarioEmail:email,tipo:"tentativa_falha",
        detalhes:err.code||err.message,
        dispositivo:navigator.userAgent.substring(0,60),
        hora:agora(),criadoEm:serverTimestamp()
      });
    }catch(e){}
    alerta(msg,"erro");
  }
}
window.logar=logar;

export async function sair(){
  await registrarLog("logout","Logout manual");
  clearTimeout(_timeoutSessao);
  clearTimeout(_avisoTimeout);
  usuarioLogado=null;
  try{await signOut(auth);}catch(e){}
  if(notifInterval){clearInterval(notifInterval);notifInterval=null;}
  voltar();
}
window.sair=sair;

export function mudarAba(aba){
  ["cadastros","servidores","plantao-admin"].forEach(a=>{
    document.getElementById("tab-"+a)?.classList.remove("ativa");
    document.getElementById("tab-btn-"+a)?.classList.remove("ativa");
  });
  document.getElementById("tab-"+aba)?.classList.add("ativa");
  document.getElementById("tab-btn-"+aba)?.classList.add("ativa");
  if(aba==="plantao-admin")carregarPlantaoAdmin();
  if(aba==="servidores")carregarServidoresAdmin();
}
window.mudarAba=mudarAba;

export async function carregarAdmin(){
  const lista=document.getElementById("admin-lista");
  lista.innerHTML='<p class="hist-vazio">Carregando...</p>';
  try{
    const snap=await getDocs(query(collection(db,COL_USUARIOS),orderBy("criadoEm","desc")));
    if(snap.empty){lista.innerHTML='<p class="hist-vazio">Nenhum cadastro.</p>';return;}
    lista.innerHTML=snap.docs.map(d=>{
      const u=d.data(),id=d.id;
      const sc=u.status==="aprovado"?"status-ok":u.status==="rejeitado"?"status-erro":"status-aviso";
      const sl=u.status==="aprovado"?"✓ Aprovado":u.status==="rejeitado"?"✕ Rejeitado":"⏳ Pendente";
      const perms=u.permissoes||{checklist:true,historico:true,inspetoria:true,administrativo:false,videomonitor:false,inteligencia:false,comando:false};
      const permLabels=PERM_LABELS;
      const permHTML=PERMISSOES.map(p=>`
        <div class="perm-item">
          <input type="checkbox" id="perm-${id}-${p}" ${perms[p]!==false?"checked":""} onchange="salvarPermissao('${id}','${p}',this.checked)">
          <label for="perm-${id}-${p}">${permLabels[p]||p}</label>
        </div>`).join("");
      return`<div class="hist-item">
        <div class="hist-tipo">${esc(u.nome)}</div>
        <div class="hist-data">📧 ${esc(u.email)} · Mat: ${esc(u.matricula)}</div>
        <div class="hist-corpo" style="margin-bottom:6px">CPF: ${esc(u.cpf)}</div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
          <span class="badge ${sc}">${sl}</span>
          ${u.status!=="aprovado"?`<button class="btn btn-sm btn-verde" data-id="${id}" data-acao="aprovar">Aprovar</button>`:""}
          ${u.status!=="rejeitado"?`<button class="btn btn-sm btn-perigo" data-id="${id}" data-acao="rejeitar">Rejeitar</button>`:""}
          <button class="btn btn-sm" style="background:rgba(192,57,43,.3);border-color:rgba(192,57,43,.5);color:#f1948a;font-size:.65rem"
            data-id="${id}" data-acao="remover">🗑 Remover</button>
        </div>
        <div class="perm-box"><div class="perm-titulo">🔑 Permissões</div>${permHTML}</div>
      </div>`;
    }).join("");
    lista.querySelectorAll("[data-acao]").forEach(btn=>{
      btn.addEventListener("click",async()=>{
        const id=btn.dataset.id,acao=btn.dataset.acao;
        if(acao==="remover"){if(!confirm("Remover usuário permanentemente?"))return;
          await deleteDoc(doc(db,COL_USUARIOS,id));alerta("Usuário removido.","aviso");carregarAdmin();return;}
        if(acao==="rejeitar"&&!confirm("Confirmar rejeição?"))return;
        await updateDoc(doc(db,COL_USUARIOS,id),{status:acao==="aprovar"?"aprovado":"rejeitado"});
        alerta(acao==="aprovar"?"Usuário aprovado!":"Usuário rejeitado.",acao==="aprovar"?"ok":"aviso");
        carregarAdmin();
      });
    });
  }catch(err){lista.innerHTML=`<p class="hist-vazio">Erro: ${err.message}</p>`;}
}

export async function salvarPermissao(uid,permissao,valor){
  try{await updateDoc(doc(db,COL_USUARIOS,uid),{[`permissoes.${permissao}`]:valor});
    alerta(`Permissão "${permissao}" ${valor?"liberada":"bloqueada"}.`,valor?"ok":"aviso");}
  catch(err){alerta("Erro: "+err.message,"erro");}
}
window.salvarPermissao=salvarPermissao;

export async function carregarAuditoria(){
  const lista=document.getElementById("auditoria-lista");
  if(!lista)return;
  lista.innerHTML='<p class="hist-vazio">Carregando...</p>';
  try{
    const [snapAcao,snapAcesso]=await Promise.all([
      getDocs(query(collection(db,COL_AUDITORIA),orderBy("criadoEm","desc"))),
      getDocs(query(collection(db,COL_LOG),orderBy("criadoEm","desc")))
    ]);
    const acoes  =snapAcao.docs.map(d=>({id:d.id,_col:COL_AUDITORIA,_origem:"acao",...d.data()}));
    const acessos=snapAcesso.docs.map(d=>({id:d.id,_col:COL_LOG,_origem:"acesso",...d.data()}));
    todosRegistros=[...acoes,...acessos].sort((a,b)=>(b.criadoEm?.seconds||0)-(a.criadoEm?.seconds||0));
    preencherFiltroModuloAuditoria();
    renderAuditoria(todosRegistros);
  }catch(err){lista.innerHTML=`<p class="hist-vazio">Erro: ${err.message}</p>`;}
}

export function preencherFiltroModuloAuditoria(){
  const sel=document.getElementById("filtro-aud-modulo");
  if(!sel||sel.dataset.preenchido)return;
  const mods=Object.values(MODULO_POR_SECAO);
  sel.innerHTML='<option value="">Todos</option>'+mods.map(m=>`<option value="${m}">${m}</option>`).join("");
  sel.dataset.preenchido="1";
}

export function renderAuditoria(registros){
  const lista=document.getElementById("auditoria-lista");
  const cont=document.getElementById("audit-contador");
  cont.textContent=registros.length?`${registros.length} registro(s)`:"";
  auditoriaSelecionados.clear();atualizarBarraSel();
  lista.innerHTML=registros.length
    ?registros.map(r=>{
        if(r._origem==="acesso"){
          const ic=r.tipo==="login"?"✅":r.tipo==="logout"?"🚪":r.tipo==="timeout"?"⏱":"❌";
          return`<div class="hist-item">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <input type="checkbox" class="audit-check" data-id="${r.id}" data-col="${r._col}" onchange="toggleAuditSel('${r.id}',this.checked)">
              <div class="hist-tipo" style="margin:0">${ic} ${esc((r.tipo||"").replace("_"," ").toUpperCase())} · 🔑 Acesso</div>
            </div>
            <div class="hist-data">🕐 ${esc(r.hora)||tsStr(r.criadoEm)}</div>
            <div class="hist-usuario">👮 ${esc(r.usuarioNome)||esc(r.usuarioEmail)||"—"} · ${esc(r.matricula)||"—"}</div>
            <div class="hist-corpo">${esc(r.detalhes)}\n📱 ${esc((r.dispositivo||"").substring(0,55))}</div>
          </div>`;
        }
        return`<div class="hist-item">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <input type="checkbox" class="audit-check" data-id="${r.id}" data-col="${r._col}" onchange="toggleAuditSel('${r.id}',this.checked)">
            <div class="hist-tipo" style="margin:0">${esc(r.tipo)||"Sistema"} · 📋 Ação</div>
          </div>
          <div class="hist-data">🕐 ${tsStr(r.criadoEm)} · 🏷 ${esc(r.modulo)||"—"}</div>
          <div class="hist-usuario">👮 ${esc(r.usuarioNome)} · ${esc(r.matricula)}</div>
          <div class="hist-corpo">${esc(r.dados)}</div>
          <div class="hist-data" style="margin-top:4px">${r.registro?`📎 Registro: ${esc(r.registro)} · `:""}${r.resultado?`Resultado: ${esc(r.resultado)} · `:""}${r.ip?`IP: ${esc(r.ip)}`:""}</div>
        </div>`;
      }).join("")
    :'<p class="hist-vazio">Nenhum registro.</p>';
}

export function filtrarAuditoria(){
  const nome=v("filtro-nome").toLowerCase(),data=v("filtro-data");
  const origem=v("filtro-aud-origem"),modulo=v("filtro-aud-modulo");
  renderAuditoria(todosRegistros.filter(r=>
    (!nome||(r.usuarioNome||r.usuarioEmail||"").toLowerCase().includes(nome))&&
    (!data||tsData(r.criadoEm)===data)&&
    (!origem||r._origem===origem)&&
    (!modulo||r.modulo===modulo)
  ));
}
window.filtrarAuditoria=filtrarAuditoria;

export function limparFiltros(){
  document.getElementById("filtro-nome").value="";document.getElementById("filtro-data").value="";
  const o=document.getElementById("filtro-aud-origem"),m=document.getElementById("filtro-aud-modulo");
  if(o)o.value=""; if(m)m.value="";
  renderAuditoria(todosRegistros);
}
window.limparFiltros=limparFiltros;

export function toggleAuditSel(id,checked){
  if(checked)auditoriaSelecionados.add(id);else auditoriaSelecionados.delete(id);
  atualizarBarraSel();
}
window.toggleAuditSel=toggleAuditSel;

export function atualizarBarraSel(){
  const bar=document.getElementById("audit-sel-bar");
  const cnt=document.getElementById("audit-sel-count");
  const n=auditoriaSelecionados.size;
  bar.classList.toggle("visivel",n>0);
  cnt.textContent=n>0?`${n} selecionado(s)`:"";
}

export function desmarcarTodos(){
  auditoriaSelecionados.clear();atualizarBarraSel();
  document.querySelectorAll(".audit-check").forEach(c=>c.checked=false);
}
window.desmarcarTodos=desmarcarTodos;

export async function removerAuditoriaSelecionados(){
  if(!auditoriaSelecionados.size)return;
  // exclusão de registros de auditoria é restrita ao Administrador autenticado
  if(!_ehAdmin()){alerta("Apenas o Administrador autenticado pode remover registros de auditoria.","erro");return;}
  if(!confirm(`Remover ${auditoriaSelecionados.size} registro(s) de auditoria?`))return;
  try{
    const alvos=[...document.querySelectorAll(".audit-check")].filter(c=>auditoriaSelecionados.has(c.dataset.id));
    for(const chk of alvos)await deleteDoc(doc(db,chk.dataset.col,chk.dataset.id));
    await registrarAuditoria("Exclusão de registro(s) de auditoria",
      `${alvos.length} registro(s) removido(s) pelo Administrador.`,
      {modulo:"💻 Tecnologia",resultado:"Exclusão administrativa"});
    alerta("Registros removidos.","aviso");carregarAuditoria();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.removerAuditoriaSelecionados=removerAuditoriaSelecionados;

export const CATALOGO_EQUIPAMENTOS=["Colete","Pistola","Revólver","Carregadores","Munições","Rádio HT","Spray","Taser","Algemas","Bastão","Câmera Corporal"];

export const MARCACOES_LICENCA=["Licença","Licença Prêmio","Licença Maternidade/Paternidade"];

export let _escalaMesSrvIds=new Set(),_escalaHojeSrvIds=new Set();

export let _srvForaEscalaSelecionado=null,_justificativaForaEscala="";

export const STATUS_INFO={
  presente:{ic:"✅",cor:"#7dcea0",label:"ASSUMIU"},
  ausente:{ic:"❌",cor:"#f1948a",label:"FALTOU"},
  atrasado:{ic:"⏰",cor:"#f0b27a",label:"ATRASOU"},
  dispensa:{ic:"🏳",cor:"#93c5fd",label:"DISPENSA"},
  substituicao:{ic:"🔁",cor:"#d8b4fe",label:"SUBSTITUIÇÃO"}
};

export const JORNADA_PADRAO_HORAS_SAIDA=12;

export const LIMITE_HORAS_EXTRAS_ALERTA=2;

export let saidaServidorSelecionado=null;

export let saidaRegistroAberto=null;

export let ausenciaServidorSelecionado=null;

export const COL_PLANTAO_FECHAMENTO="plantao_fechamentos";

export const CHAVE="pmc_historico";

export let _histArmariaCache=[];

export async function salvarAuditoria(tipo,dados){
  if(!usuarioLogado)return;
  try{await addDoc(collection(db,COL_AUDITORIA),{tipo,dados,
    usuarioNome:usuarioLogado.nome,usuarioEmail:usuarioLogado.email,
    matricula:usuarioLogado.matricula,criadoEm:serverTimestamp()});}
  catch(err){console.warn("Auditoria:",err.message);}
}

export const MENU_BTNS=[
  {id:"btn-checklist",      label:"armaria armas municoes viaturas"},
  {id:"btn-inspetoria",     label:"inspetoria plantao fiscalizacao ordem servico os ocorrencias dashboard resumo boletim"},
  {id:"btn-administrativo", label:"administrativo banco fotos escala plantão ficha horas relatorios boletim"},
  {id:"btn-videomonitor",   label:"video monitoramento"},
  {id:"btn-inteligencia",   label:"inteligencia inteligência"},
  {id:"btn-comando",        label:"comando"},
  {id:"btn-patrimonio",     label:"patrimônio patrimonio"},
  {id:"btn-tecnologia",     label:"tecnologia"},
  {id:"btn-meupainel",      label:"policial municipal meu painel perfil operacional equipamentos acautelados"},
];

export function filtrarMenu(){
  const q=(document.getElementById("home-search")?.value||"").toLowerCase().trim();
  let algumVisivel=false;
  MENU_BTNS.forEach(({id,label})=>{
    const btn=document.getElementById(id);
    if(!btn)return;
    const mostra=!q||label.includes(q);
    btn.style.display=mostra?"":"none";
    if(mostra)algumVisivel=true;
  });
  document.getElementById("home-search-nenhum").style.display=
    (q&&!algumVisivel)?"block":"none";
}
window.filtrarMenu=filtrarMenu;

export let todosUsuariosCache=[];

export function filtrarUsuarios(){
  const q=(v("filtro-usuario-nome")||"").toLowerCase();
  if(!q){renderUsuarios(todosUsuariosCache);return;}
  renderUsuarios(todosUsuariosCache.filter(u=>
    u.nome?.toLowerCase().includes(q)||u.matricula?.toLowerCase().includes(q)));
}
window.filtrarUsuarios=filtrarUsuarios;

export function renderUsuarios(docs){
  const lista=document.getElementById("admin-lista");
  if(!docs.length){lista.innerHTML='<p class="hist-vazio">Nenhum usuário encontrado.</p>';return;}
  lista.innerHTML=docs.map(({id,u})=>{
    const sc=u.status==="aprovado"?"status-ok":u.status==="rejeitado"?"status-erro":"status-aviso";
    const sl=u.status==="aprovado"?"✓ Aprovado":u.status==="rejeitado"?"✕ Rejeitado":"⏳ Pendente";
    const desativado=u.ativo===false;
    const perms=u.permissoes||{};
    const permLabels=PERM_LABELS;
    const permHTML=PERMISSOES.map(p=>`
      <div class="perm-item">
        <input type="checkbox" id="perm-${id}-${p}" ${perms[p]!==false?"checked":""} onchange="salvarPermissao('${id}','${p}',this.checked)">
        <label for="perm-${id}-${p}">${permLabels[p]||p}</label>
      </div>`).join("");
    return`<div class="hist-item">
      <div class="hist-tipo">${esc(u.nome)}${desativado?' <span class="badge status-erro">🔒 Desativado</span>':""}</div>
      <div class="hist-data">📧 ${esc(u.email)} · Mat: ${esc(u.matricula)}</div>
      <div class="hist-corpo" style="margin-bottom:6px">CPF: ${esc(u.cpf)}</div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
        <span class="badge ${sc}">${sl}</span>
        ${u.status!=="aprovado"?`<button class="btn btn-sm btn-verde" data-id="${id}" data-acao="aprovar">Aprovar</button>`:""}
        ${u.status!=="rejeitado"?`<button class="btn btn-sm btn-perigo" data-id="${id}" data-acao="rejeitar">Rejeitar</button>`:""}
        <button class="btn btn-sm" style="background:rgba(192,57,43,.3);border-color:rgba(192,57,43,.5);color:#f1948a;font-size:.65rem"
          data-id="${id}" data-acao="remover">🗑 Remover</button>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
        <button class="btn btn-sm" style="background:${desativado?'rgba(125,206,160,.2)':'rgba(251,191,36,.2)'};border-color:${desativado?'#7dcea0':'#fbbf24'};color:${desativado?'#7dcea0':'#fbbf24'}"
          data-id="${id}" data-nome="${u.nome}" data-acao="${desativado?'ativar':'desativar'}">${desativado?'🔓 Ativar / Desbloquear':'🔒 Desativar'}</button>
        <button class="btn btn-sm btn-cinza" data-email="${u.email}" data-acao="resetsenha">✉️ Redefinir Senha</button>
      </div>
      <div class="perm-box"><div class="perm-titulo">🔑 Permissões</div>${permHTML}</div>
      <div style="margin-top:8px;display:flex;gap:6px;align-items:center">
        <select id="perfil-aplicar-${id}" style="margin:0;flex:1">
          <option value="">Aplicar perfil...</option>
          ${_perfisCache.map(p=>`<option value="${p._id}">${p.nome}</option>`).join("")}
        </select>
        <button class="btn btn-sm btn-dourado" onclick="aplicarPerfilUsuario('${id}',document.getElementById('perfil-aplicar-${id}').value)">Aplicar</button>
      </div>
    </div>`;
  }).join("");
  lista.querySelectorAll("[data-acao]").forEach(btn=>{
    btn.addEventListener("click",async()=>{
      const id=btn.dataset.id,acao=btn.dataset.acao;
      if(acao==="remover"){if(!confirm("Remover usuário?"))return;
        await deleteDoc(doc(db,COL_USUARIOS,id));alerta("Removido.","aviso");carregarAdmin();return;}
      if(acao==="rejeitar"&&!confirm("Rejeitar?"))return;
      if(acao==="resetsenha"){
        if(!btn.dataset.email)return alerta("E-mail não encontrado para este usuário.","erro");
        if(!confirm(`Enviar e-mail de redefinição de senha para ${btn.dataset.email}?`))return;
        try{
          await sendPasswordResetEmail(auth,btn.dataset.email);
          await registrarAuditoria("Solicitou redefinição de senha",`Tecnologia solicitou reset de senha para ${btn.dataset.email}`);
          alerta("E-mail de redefinição enviado!","ok");
        }catch(err){alerta("Erro: "+err.message,"erro");}
        return;
      }
      if(acao==="ativar"||acao==="desativar"){
        const ativo=acao==="ativar";
        if(!confirm(`${ativo?"Ativar/desbloquear":"Desativar"} a conta de ${btn.dataset.nome}?`))return;
        await updateDoc(doc(db,COL_USUARIOS,id),{ativo});
        await registrarAuditoria(ativo?"Ativou conta de usuário":"Desativou conta de usuário",`${btn.dataset.nome} (Tecnologia)`);
        alerta(ativo?"Conta ativada.":"Conta desativada.",ativo?"ok":"aviso");carregarAdmin();return;
      }
      await updateDoc(doc(db,COL_USUARIOS,id),{status:acao==="aprovar"?"aprovado":"rejeitado"});
      alerta(acao==="aprovar"?"Aprovado!":"Rejeitado.",acao==="aprovar"?"ok":"aviso");carregarAdmin();
    });
  });
}

export let todosServidoresAdminCache=[];

export let notifInterval=null;

export let ultimaNotifTs=0;

export function vibrar3x(){
  if(navigator.vibrate)navigator.vibrate([120,80,120,80,120]);
}

export function atualizarSireneMeuPainel(naoLidas){
  const icone=document.getElementById("mp-notif-icone");
  const card=document.getElementById("mp-notif-card");
  if(!icone||!card)return;
  const tem=Number(naoLidas)>0;
  icone.classList.toggle("tem-notif-nova",tem);
  card.classList.toggle("tem-notif-nova",tem);
}

export function toggleNotifPainel(){
  const painel=document.getElementById("mp-notif-painel");
  if(!painel)return;
  painel.classList.toggle("aberto");
  if(painel.classList.contains("aberto"))renderNotificacoes();
}
window.toggleNotifPainel=toggleNotifPainel;

export async function renderNotificacoes(){
  if(!usuarioLogado)return;
  const lista=document.getElementById("mp-notif-lista");
  if(!lista)return;
  lista.innerHTML='<p class="notif-vazio">Carregando...</p>';
  try{
    const snap=await getDocs(query(
      collection(db,COL_NOTIF),where("destEmail","==",usuarioLogado.email)));
    const docs=snap.docs.map(d=>({id:d.id,...d.data()}))
      .sort((a,b)=>(b.criadoEm?.seconds||0)-(a.criadoEm?.seconds||0));
    const naolidas=docs.filter(d=>!d.lida).length;
    const elMpNotif=document.getElementById("mp-notif");
    if(elMpNotif)elMpNotif.textContent=naolidas;
    atualizarSireneMeuPainel(naolidas);
    if(!docs.length){lista.innerHTML='<p class="notif-vazio">Sem notificações.</p>';return;}
    lista.innerHTML=docs.map(d=>{
      const icone=d.titulo?.includes("Plantão")?"👮":
                  d.titulo?.includes("O.S")?"📄":
                  d.titulo?.includes("Cadastro")?"✅":"🚨";
      return`<div class="notif-card ${d.lida?"lida":""}" onclick="marcarLida('${d.id}')">
        ${!d.lida?'<div class="n-ponto"></div>':""}
        <div class="n-icone">${icone}</div>
        <div class="n-titulo">${esc(d.titulo)}</div>
        <div class="n-corpo">${esc(d.corpo)}</div>
        <div class="n-hora">🕐 ${d.criadoEm?.toDate?d.criadoEm.toDate().toLocaleString("pt-BR"):d.hora||""}</div>
      </div>`;}).join("");
  }catch(err){lista.innerHTML=`<p class="notif-vazio">Erro: ${err.message}</p>`;}
}

export async function marcarLida(id){
  try{await updateDoc(doc(db,COL_NOTIF,id),{lida:true});renderNotificacoes();atualizarBadgesHome();}catch(e){}
}
window.marcarLida=marcarLida;

export async function marcarTodasLidas(){
  if(!usuarioLogado)return;
  try{
    const snap=await getDocs(query(collection(db,COL_NOTIF),where("destEmail","==",usuarioLogado.email)));
    const naoLidas=snap.docs.filter(d=>!d.data().lida);
    for(const d of naoLidas)await updateDoc(doc(db,COL_NOTIF,d.id),{lida:true});
    renderNotificacoes();atualizarBadgesHome();alerta("Todas marcadas como lidas.","ok");
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.marcarTodasLidas=marcarTodasLidas;

export async function limparNotificacoes(){
  if(!usuarioLogado)return;
  if(!confirm("Apagar todas as notificações?"))return;
  try{
    const snap=await getDocs(query(collection(db,COL_NOTIF),where("destEmail","==",usuarioLogado.email)));
    for(const d of snap.docs)await deleteDoc(doc(db,COL_NOTIF,d.id));
    renderNotificacoes();atualizarBadgesHome();alerta("Notificações limpas.","aviso");
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.limparNotificacoes=limparNotificacoes;

export async function enviarNotificacao(destEmail,titulo,corpo,modulo=""){
  if(!destEmail)return;
  try{
    await addDoc(collection(db,COL_NOTIF),{
      destEmail,titulo,corpo,lida:false,modulo,
      hora:agora(),criadoEm:serverTimestamp()
    });
  }catch(e){console.warn("Notif:",e.message);}
  atualizarBadgesHome();
}

export const MODULOS_BADGE_HOME=["checklist","inspetoria","administrativo","videomonitor","inteligencia","comando","patrimonio","tecnologia","corregedoria","meupainel"];

export async function atualizarBadgesHome(){
  if(!usuarioLogado)return;
  try{
    // consulta só por destEmail (índice simples) e filtra "não lida" no cliente —
    // evita depender de índice composto, que se ausente falhava silenciosamente
    // e travava a atualização dos badges.
    const snap=await getDocs(query(collection(db,COL_NOTIF),where("destEmail","==",usuarioLogado.email)));
    const contagem={};
    snap.docs.forEach(d=>{
      const n=d.data();
      if(n.lida)return;
      const m=n.modulo;
      if(!m)return;
      contagem[m]=(contagem[m]||0)+1;
    });
    MODULOS_BADGE_HOME.forEach(m=>{
      const badge=document.getElementById(`badge-home-${m}`);
      if(!badge)return;
      const n=contagem[m]||0;
      if(n>0){badge.textContent=n>99?"99+":n;badge.style.display="inline-flex";}
      else badge.style.display="none";
    });
  }catch(e){console.warn("atualizarBadgesHome:",e.message);}
}

window.atualizarBadgesHome=atualizarBadgesHome;

export function iniciarPollingNotif(){
  if(notifInterval)clearInterval(notifInterval);
  verificarNovasNotif();
  notifInterval=setInterval(verificarNovasNotif,30000);
}

export async function verificarNovasNotif(){
  if(!usuarioLogado)return;
  await verificarForcaLogoff();
  if(!usuarioLogado)return; // pode ter sido deslogado agora mesmo pelo check acima
  try{
    const snap=await getDocs(query(collection(db,COL_NOTIF),where("destEmail","==",usuarioLogado.email)));
    const naoLidas=snap.docs.filter(d=>!d.data().lida);
    atualizarBadgesHome();
    atualizarSireneMeuPainel(naoLidas.length);
    // detecta notificação nova e avisa com uma vibração discreta (sem som, sem popup)
    const maxTs=Math.max(...naoLidas.map(d=>d.data().criadoEm?.seconds||0),0);
    if(maxTs>ultimaNotifTs&&ultimaNotifTs>0)vibrar3x();
    if(maxTs>0)ultimaNotifTs=maxTs;
    if(document.getElementById("mp-notif-painel")?.classList.contains("aberto"))
      renderNotificacoes();
  }catch(e){}
}

export async function verificarForcaLogoff(){
  try{
    const snap=await getDoc(doc(db,COL_SISTEMA_CONFIG,"config"));
    if(!snap.exists())return;
    const cfg=snap.data();
    const disparadoEm=cfg.forcarLogoffEm?.toMillis?.()||0;
    if(disparadoEm>0&&disparadoEm>_sessaoIniciadaEm){
      try{await registrarLog("logout","Logoff forçado pela Tecnologia (kill switch geral)");}catch(e){}
      clearTimeout(_timeoutSessao);clearTimeout(_avisoTimeout);
      if(notifInterval){clearInterval(notifInterval);notifInterval=null;}
      usuarioLogado=null;
      try{await signOut(auth);}catch(e){}
      voltar();
      alerta("Sua sessão foi encerrada pelo administrador (Tecnologia). Faça login novamente.","aviso");
    }
  }catch(e){}
}

export let fotoAtual = null;

export let fotosSelecionadas = new Set();

export let _fotosCache = [];

export let escalaMesAtual=new Date().getMonth();

export let escalaAnoAtual=new Date().getFullYear();

export let diaEditando=null;

export let _diasMesAtual={};

export const COL_PERMUTAS="permutas";

export const PRAZO_MINIMO_PERMUTA_DIAS=2;

export let _meuServidorPermuta=null,_destinatarioPermuta=null,_meusPlantoesPermuta=[],_plantoesDestinoPermuta=[];

export const TURNO_LABEL={M:"☀️ Manhã",T:"🌤 Tarde",N:"🌙 Noite",F:"🏖 Folga",E:"⚡ Extra"};

export let _buscaPermutaTimeout=null;

export const LIMITE_HORAS_SEM_AUTORIZACAO_SUPERIOR=6;

export const LIMITE_SALDO_NEGATIVO_ALERTA=-10;

export const TURNO_HORARIOS={M:["07:00","13:00"],T:["13:00","19:00"],N:["19:00","07:00"]};

export let _heServidoresSelecionados=[];

export let _buscaHETimeout=null;

export let _dheAprovadasMes=[];

export const COL_EQUIPES="equipes";

export const STATUS_EQUIPE_LABEL={
  aguardando_lancamento:["🟡","Aguardando Lançamento"],lancada:["🟢","Equipe Lançada"],
  em_patrulhamento:["🟢","Em Patrulhamento"],em_atendimento:["🔴","Em Atendimento"],
  apoio:["🟡","Apoio"],na_base:["🔵","Na Base"],encerrada:["⚫","Encerrada"],
  plantao_encerrado:["⚫","Plantão Encerrado"]
};

export let _secEquipesCache=[];

export const COL_OC="ocorrencias";

export const COL_BH="banco_horas";

export const COL_COLETES="coletes";

export const COL_COLETES_HIST="coletes_historico";

export const COL_ARMAS_IND="armas_individuais";

export const COL_ARMAS_HIST="armas_historico";

export const COL_PATRIMONIO="patrimonio";

export const COL_PATRIMONIO_HIST="patrimonio_historico";

export const COL_PATRIMONIO_INV="patrimonio_inventarios";

export const COL_CHAMADOS="chamados_tecnicos";

export const COL_SISTEMA_CONFIG="sistema_config";

export const COL_PERFIS="perfis_permissao";

export const COL_ERROS="erros_sistema";

export const COL_ESCALA_MENSAL="escalas_mensais";

export const COL_FOTOS="fotos";

export const COL_VIATURAS="viaturas";

export const COL_MUNICOES="municoes";

export const COL_MUNICOES_HIST="municoes_historico";

export const CHAVE_OC="pmc_ocorrencias";

export const COL_OC_HIST="ocorrencia_historico";

export let _corInboxCache=[];
window._corInboxCache=_corInboxCache;

export let modalOcAtualId=null;

export let fichaAtualId=null,fichaFotoBase64=null;

export const COL_TIMELINE="servidor_timeline";

export const CHAVE_BH="pmc_banco_horas";

export let _relatorioAtual="",_relatorioTexto="";

export const COL_PAD="pad";

export const COL_PAD_HIST="pad_historico";

export let padFotosBase64=[];

export let padEditandoId=null;

export let MODULO_ATUAL="—";

export const MODULO_POR_SECAO={
  secretario:"👔 Secretário",comando:"⭐ Comando",corregedoria:"⚖️ Corregedoria",
  inspetoria:"🏛 Inspetoria",checklist:"🛡️ Armaria",administrativo:"📁 Administrativo",
  videomonitor:"📹 Vídeo Monit.",inteligencia:"🔎 Inteligência",patrimonio:"🏛 Patrimônio",
  tecnologia:"💻 Tecnologia","meu-painel":"👮 Policial Municipal"
};

export let _ipCache=null;

export async function obterIpPublico(){
  if(_ipCache)return _ipCache;
  try{
    const r=await fetch("https://api.ipify.org?format=json");
    const j=await r.json();
    _ipCache=j.ip||"indisponível";
  }catch(e){_ipCache="indisponível";}
  return _ipCache;
}

export async function registrarAuditoria(acao,detalhes="",opts={}){
  if(!usuarioLogado)return;
  try{
    const ip=await obterIpPublico();
    await addDoc(collection(db,COL_AUDITORIA),{
      tipo:"Sistema",
      acao,
      dados:`${acao}\n${detalhes}`,
      detalhes,
      modulo:    opts.modulo||MODULO_POR_SECAO[MODULO_ATUAL]||MODULO_ATUAL||"—",
      registro:  opts.registro||"",
      resultado: opts.resultado||"Sucesso",
      ip,
      usuarioNome:  usuarioLogado.nome||"",
      usuarioEmail: usuarioLogado.email||"",
      matricula:    usuarioLogado.matricula||"",
      dispositivo:  navigator.userAgent.substring(0,60),
      criadoEm:     serverTimestamp()
    });
  }catch(e){}
}

export const STATUS_POSTO_LABEL={
  disponivel:["⚪","Disponível"], em_servico:["🟢","Em Serviço"],
  aguardando_passagem:["🟡","Aguardando Passagem"], aguardando_recebimento:["🟡","Aguardando Recebimento"],
  recebido:["🟢","Recebido"], com_pendencia:["🟡","Com Pendência"], com_divergencia:["🔴","Com Divergência"]
};

export const CD_TIPOS={
  os:{col:COL_OS, label:"Ordem de Serviço",
      titulo:r=>`📄 O.S ${r.numero||"—"} · ${r.tipo==="temporaria"?"Temporária":"Permanente"}`,
      linha1:r=>`📅 Início: ${r.dataInicio||"—"}${r.dataFim&&r.dataFim!=="indeterminado"?" · Fim: "+r.dataFim:""}`,
      linha2:r=>`👤 ${r.servidor||"—"}${r.matricula?" · Mat: "+r.matricula:""}`,
      corpo:r=>r.descricao||"Sem descrição",
      origemLabel:"Ordem de Serviço",
      servidorPad:r=>r.servidor||"A identificar",
      dataPad:r=>r.dataInicio||new Date().toISOString().slice(0,10),
      descPad:r=>`Ordem de Serviço nº ${r.numero||"—"} (${r.tipo||""})\nMatrícula: ${r.matricula||"—"}\n\n${r.descricao||""}`},
  fisc:{col:COL_FISC, label:"Fiscalização",
      titulo:r=>`🔍 ${r.local||"—"} · ${r.jornada||"—"}`,
      linha1:r=>`📅 ${r.data||"—"} · 🕐 ${r.hora||"—"}${r.horafim?"–"+r.horafim:""}`,
      linha2:r=>`👮 ${r.servidor||"—"}`,
      corpo:r=>r.obs||"Sem observações",
      origemLabel:"Fiscalização (Inspetoria)",
      servidorPad:r=>r.servidor||"A identificar",
      dataPad:r=>r.data||new Date().toISOString().slice(0,10),
      descPad:r=>`Fiscalização — ${r.local||"—"}\nJornada: ${r.jornada||"—"}\n\n${r.obs||""}`}
};

export let _decisaoCache={};
window._decisaoCache=_decisaoCache;

export const CHAVE_MUN_G="pmc_municoes_gestao";

export const CHAVE_VTR_G="pmc_viaturas_gestao";

export let _municoesCache=[];

export let _viaturasCache=[];

export let _armasIndCache=[];

export let _coletesCache=[],_coleteFotoBase64=null;

export let _bensCache=[];

export let _inventarioConferidos=new Set();

export const COL_DISPOSITIVOS="dispositivos";

export const COL_POSTOS="postos_fixos";

export const COL_POSTO_OPS="posto_operacoes";

export const COL_POSTO_SEQ="posto_seq";

export const GRUPOS_LIMPEZA=[
  {id:"ocorrencias_pad",label:"🚨 Ocorrências e PAD (todos os status)",cols:[COL_OC,COL_OC_HIST,COL_PAD,COL_PAD_HIST]},
  {id:"armaria",label:"🔫 Armaria — armas, coletes, munições",cols:[COL_ARMAS_IND,COL_ARMAS_HIST,COL_COLETES,COL_COLETES_HIST,COL_MUNICOES,COL_MUNICOES_HIST]},
  {id:"patrimonio",label:"🏛 Patrimônio — itens, histórico, inventários",cols:[COL_PATRIMONIO,COL_PATRIMONIO_HIST,COL_PATRIMONIO_INV]},
  {id:"plantao_escala",label:"📅 Plantão / Escala — plantões, fechamentos, escalas mensais, permutas, banco de horas",
    cols:[COL_PLANTAO,COL_PLANTAO_FECHAMENTO,COL_ESCALA_MENSAL,COL_PERMUTAS,COL_BH]},
  {id:"fiscalizacao",label:"🕵️ Fiscalização e Equipes",cols:[COL_FISC,COL_EQUIPES]},
  {id:"posto_fixo",label:"🛡️ Posto Fixo — cadastro de postos e operações (reinicia numeração)",
    cols:[COL_POSTOS,COL_POSTO_OPS],zeraContador:COL_POSTO_SEQ},
  {id:"fotos",label:"📷 Fotos",cols:[COL_FOTOS]},
  {id:"viaturas",label:"🚓 Viaturas",cols:[COL_VIATURAS]},
  {id:"chamados_os",label:"🎫 Chamados Técnicos / Ordens de Serviço",cols:[COL_CHAMADOS,COL_OS]},
  {id:"notificacoes",label:"🔔 Notificações",cols:[COL_NOTIF]},
  {id:"erros_dispositivos",label:"⚠️ Erros do Sistema / Dispositivos",cols:[COL_ERROS,COL_DISPOSITIVOS]},
  {id:"ficha_funcional",label:"👮 Ficha Funcional dos Servidores (nome, matrícula, cargo, CPF/RG...)",
    cols:[COL_SERV],subSensivel:true,
    aviso:"⚠️ Usado por Escalas, Plantão e Posto Fixo — apagar pode deixar essas áreas sem servidor vinculado."},
  {id:"auditoria",label:"🔐 Log de Auditoria (ações + acessos)",cols:[COL_AUDITORIA,COL_LOG],
    aviso:"⚠️ Zera todo o histórico de auditoria do sistema até agora."}
];

export const COLECOES_RESTAURAVEIS=["usuarios","chamados_tecnicos","erros_sistema","dispositivos","sistema_config","perfis_permissao"];

export let _chamadosCache=[];

export const PERM_LABELS={checklist:"🛡️ Armaria",historico:"📋 Histórico",inspetoria:"🏛 Inspetoria",
  administrativo:"📁 Administrativo",videomonitor:"📹 Vídeo Monit.",inteligencia:"🔎 Inteligência",
  comando:"⭐ Comando",patrimonio:"🏛 Patrimônio",tecnologia:"💻 Tecnologia",
  fotos:"📷 Fotos",escala:"📅 Escala",dashboard:"📊 Dashboard",corregedoria:"⚖️ Corregedoria",meupainel:"👮 Policial Municipal",secretario:"👔 Secretário"};

export let _perfisCache=[];

export function abrirModalPerfil(id=null){
  document.getElementById("perfil-edit-id").value=id||"";
  const grid=document.getElementById("perfil-permissoes-grid");
  const perfil=id?_perfisCache.find(p=>p._id===id):null;
  document.getElementById("modal-perfil-titulo").textContent=id?"Editar Perfil":"Novo Perfil";
  document.getElementById("perfil-nome").value=perfil?.nome||"";
  grid.innerHTML=PERMISSOES.map(p=>`
    <label class="equip-check-item">
      <input type="checkbox" id="perfil-perm-${p}" ${!perfil||perfil.permissoes?.[p]!==false?"checked":""}>
      ${PERM_LABELS[p]||p}
    </label>`).join("");
  document.getElementById("modal-perfil").classList.add("aberto");
}
window.abrirModalPerfil=abrirModalPerfil;

export function fecharModalPerfil(){document.getElementById("modal-perfil").classList.remove("aberto");}
window.fecharModalPerfil=fecharModalPerfil;

export async function salvarPerfil(){
  const id=v("perfil-edit-id"),nome=v("perfil-nome");
  if(!nome)return alerta("Informe o nome do perfil.","erro");
  const permissoes={};
  PERMISSOES.forEach(p=>{permissoes[p]=document.getElementById(`perfil-perm-${p}`).checked;});
  try{
    if(id){
      await updateDoc(doc(db,COL_PERFIS,id),{nome,permissoes});
    }else{
      await addDoc(collection(db,COL_PERFIS),{nome,permissoes,criadoPor:usuarioLogado?.nome||"",criadoEm:serverTimestamp()});
    }
    await registrarAuditoria("Perfil de acesso salvo",nome);
    fecharModalPerfil();
    await renderPerfis();
    alerta("Perfil salvo!","ok");
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.salvarPerfil=salvarPerfil;

export async function excluirPerfil(id){
  if(!confirm("Excluir este perfil? Usuários que já receberam essas permissões não serão afetados."))return;
  try{
    await deleteDoc(doc(db,COL_PERFIS,id));
    await registrarAuditoria("Perfil de acesso excluído",id);
    await renderPerfis();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.excluirPerfil=excluirPerfil;

export async function renderPerfis(){
  const el=document.getElementById("perfis-lista");
  el.innerHTML='<p class="hist-vazio">Carregando...</p>';
  try{
    const snap=await getDocs(collection(db,COL_PERFIS));
    _perfisCache=snap.docs.map(d=>({_id:d.id,...d.data()}));
  }catch(e){el.innerHTML=`<p class="hist-vazio">Erro: ${e.message}</p>`;return;}
  el.innerHTML=_perfisCache.length?_perfisCache.map(p=>{
    const ativos=PERMISSOES.filter(m=>p.permissoes?.[m]!==false);
    return`<div class="hist-item">
      <div class="hist-tipo">${p.nome}</div>
      <div class="hist-corpo" style="font-size:.72rem">${ativos.map(m=>PERM_LABELS[m]||m).join(" · ")||"Nenhum módulo liberado"}</div>
      <div style="display:flex;gap:6px;margin-top:8px">
        <button class="btn btn-sm btn-cinza" onclick="abrirModalPerfil('${p._id}')">✏️ Editar</button>
        <button class="btn btn-sm btn-perigo" onclick="excluirPerfil('${p._id}')">🗑 Excluir</button>
      </div>
    </div>`;
  }).join(""):'<p class="hist-vazio">Nenhum perfil criado ainda.</p>';
}
window.renderPerfis=renderPerfis;

export async function aplicarPerfilUsuario(userId,perfilId){
  if(!perfilId)return;
  try{
    let perfil=_perfisCache.find(p=>p._id===perfilId);
    if(!perfil){
      const snap=await getDocs(collection(db,COL_PERFIS));
      _perfisCache=snap.docs.map(d=>({_id:d.id,...d.data()}));
      perfil=_perfisCache.find(p=>p._id===perfilId);
    }
    if(!perfil)return;
    if(!confirm(`Aplicar o perfil "${perfil.nome}" a este usuário? Isso substitui as permissões atuais dele.`))return;
    await updateDoc(doc(db,COL_USUARIOS,userId),{permissoes:perfil.permissoes});
    await registrarAuditoria("Perfil aplicado a usuário",`Perfil: ${perfil.nome} · Usuário: ${userId}`);
    alerta("Perfil aplicado com sucesso!","ok");
    carregarAdmin();
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.aplicarPerfilUsuario=aplicarPerfilUsuario;

export async function carregarConfigGeral(){
  try{
    const snap=await getDoc(doc(db,COL_SISTEMA_CONFIG,"config"));
    const cfg=snap.exists()?snap.data():{};
    document.getElementById("cfg-nome").value=cfg.nomeInstituicao||"Polícia Municipal de Caruaru";
    document.getElementById("cfg-versao").value=cfg.versaoApp||"1.0.0";
    document.getElementById("cfg-cor").value=cfg.corDestaque||"#c9a84c";
    document.getElementById("cfg-manutencao").checked=!!cfg.manutencaoAtiva;
    document.getElementById("cfg-manutencao-msg").value=cfg.manutencaoMensagem||"Sistema em manutenção programada. Tente novamente mais tarde.";
    atualizarStatusManutencaoUI(cfg);
  }catch(e){}
}
window.carregarConfigGeral=carregarConfigGeral;

export async function salvarConfigGeral(){
  const nomeInstituicao=v("cfg-nome"),corDestaque=v("cfg-cor"),versaoApp=v("cfg-versao");
  try{
    await setDoc(doc(db,COL_SISTEMA_CONFIG,"config"),{nomeInstituicao,corDestaque,versaoApp},{merge:true});
    aplicarCorDestaque(corDestaque);
    await registrarAuditoria("Configurações gerais atualizadas",`Instituição: ${nomeInstituicao} · Versão: ${versaoApp} · Cor: ${corDestaque}`);
    alerta("Configurações salvas!","ok");
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.salvarConfigGeral=salvarConfigGeral;

export function aplicarCorDestaque(cor){
  if(cor)document.documentElement.style.setProperty("--dourado",cor);
}

export function atualizarStatusManutencaoUI(cfg){
  const el=document.getElementById("cfg-manutencao-status");
  if(!el)return;
  el.innerHTML=cfg.manutencaoAtiva
    ?`<div class="sit-alerta critico">🔴 Modo de Manutenção ATIVO desde ${cfg.manutencaoInicio||"—"}. Apenas administradores conseguem acessar.</div>`
    :`<div class="sit-alerta info">🟢 Sistema funcionando normalmente para todos os usuários.</div>`;
}

export async function salvarModoManutencao(){
  const ativar=document.getElementById("cfg-manutencao").checked;
  const mensagem=v("cfg-manutencao-msg");
  try{
    const snap=await getDoc(doc(db,COL_SISTEMA_CONFIG,"config"));
    const cfgAtual=snap.exists()?snap.data():{};
    const dados={manutencaoAtiva:ativar,manutencaoMensagem:mensagem};
    if(ativar&&!cfgAtual.manutencaoAtiva)dados.manutencaoInicio=agora();
    if(!ativar&&cfgAtual.manutencaoAtiva){
      dados.manutencaoFim=agora();
      dados.avisoGeralEm=Date.now(); // usado para notificar usuários no próximo login
    }
    await setDoc(doc(db,COL_SISTEMA_CONFIG,"config"),dados,{merge:true});
    await registrarAuditoria(ativar?"Modo de Manutenção ativado":"Modo de Manutenção desativado",mensagem);
    atualizarStatusManutencaoUI({...cfgAtual,...dados});
    alerta(ativar?"Modo de Manutenção ativado.":"Modo de Manutenção desativado. Usuários serão avisados no próximo login.","ok");
  }catch(err){alerta("Erro: "+err.message,"erro");}
}
window.salvarModoManutencao=salvarModoManutencao;

export async function verificarModoManutencao(){
  try{
    const snap=await getDoc(doc(db,COL_SISTEMA_CONFIG,"config"));
    if(!snap.exists())return{bloqueado:false};
    const cfg=snap.data();
    if(cfg.corDestaque)aplicarCorDestaque(cfg.corDestaque);
    if(cfg.manutencaoAtiva)return{bloqueado:true,mensagem:cfg.manutencaoMensagem||"Sistema em manutenção."};
    const ultimoAviso=Number(localStorage.getItem("pmc_ultimo_aviso_geral")||0);
    if(cfg.avisoGeralEm&&cfg.avisoGeralEm>ultimoAviso){
      localStorage.setItem("pmc_ultimo_aviso_geral",String(cfg.avisoGeralEm));
      setTimeout(()=>alerta("🟢 O sistema voltou ao funcionamento normal.","ok"),1200);
    }
    return{bloqueado:false};
  }catch(e){return{bloqueado:false};}
}

export async function executarPesquisaGlobal(){
  const termo=(v("pesquisa-global-input")||v("pg-input-2")||"").trim();
  if(!termo)return alerta("Digite um termo para pesquisar.","erro");
  document.getElementById("pg-input-2").value=termo;
  document.getElementById("pesquisa-global-input").value=termo;
  ir("pesquisa-global");
  const el=document.getElementById("pg-resultados");
  el.innerHTML='<p class="hist-vazio">Pesquisando...</p>';
  const t=termo.toLowerCase();
  const blocos=[];

  try{
    if(!servidoresCache.length){
      const snap=await getDocs(query(collection(db,COL_SERV),where("ativo","==",true)));
      servidoresCache=snap.docs.map(d=>({id:d.id,...d.data()}));
    }
    const srvs=servidoresCache.filter(s=>s.nome?.toLowerCase().includes(t)||s.matricula?.toLowerCase().includes(t));
    if(srvs.length)blocos.push({titulo:"👤 Servidores",itens:srvs.map(s=>
      `<div class="hist-item" style="padding:7px 10px;margin-bottom:5px;cursor:pointer" onclick="abrirFicha('${s.id}')">${esc(s.nome)} · Mat: ${esc(s.matricula)} ${s.cargo?"· "+esc(s.cargo):""}</div>`)});
  }catch(e){}

  try{
    const snap=await getDocs(collection(db,COL_PAD));
    const pads=snap.docs.map(d=>d.data()).filter(p=>p.numero?.toLowerCase().includes(t)||p.servidor?.toLowerCase().includes(t));
    if(pads.length)blocos.push({titulo:"⚖️ PADs",itens:pads.map(p=>
      `<div class="hist-item" style="padding:7px 10px;margin-bottom:5px">${esc(p.numero)} · ${esc(p.servidor)} · ${esc(p.status)}</div>`)});
  }catch(e){}

  try{
    const ocLista=(window._ocCache||carregarOC()).filter(o=>
      o.num?.toLowerCase().includes(t)||o.envolvidos?.toLowerCase().includes(t)||o.servidor?.toLowerCase().includes(t)||o.tipo?.toLowerCase().includes(t));
    if(ocLista.length)blocos.push({titulo:"🚨 Ocorrências",itens:ocLista.map(o=>
      `<div class="hist-item" style="padding:7px 10px;margin-bottom:5px">${esc(o.num)} · ${o.data} · ${esc(o.tipo)}</div>`)});
  }catch(e){}

  try{
    const snapA=await getDocs(collection(db,COL_ARMAS_IND));
    const armas=snapA.docs.map(d=>d.data()).filter(a=>a.acautelamento?.servidorNome?.toLowerCase().includes(t)||a.numeroSerie?.toLowerCase().includes(t));
    const snapC=await getDocs(collection(db,COL_COLETES));
    const coletes=snapC.docs.map(d=>d.data()).filter(c=>c.distribuicaoAtual?.servidorNome?.toLowerCase().includes(t)||c.patrimonio?.toLowerCase().includes(t));
    const eqItens=[...armas.map(a=>`<span class="ic-img ic-arma"></span> ${esc(a.tipo)} · Série ${esc(a.numeroSerie)||"—"} · Com: ${esc(a.acautelamento?.servidorNome)||"—"}`),
      ...coletes.map(c=>`<span class="ic-img ic-coletes"></span> Colete Patr ${esc(c.patrimonio)||"—"} · Com: ${esc(c.distribuicaoAtual?.servidorNome)||"—"}`)];
    if(eqItens.length)blocos.push({titulo:"🎒 Equipamentos",itens:eqItens.map(x=>`<div class="hist-item" style="padding:7px 10px;margin-bottom:5px">${x}</div>`)});
  }catch(e){}

  el.innerHTML=blocos.length?blocos.map(b=>`
    <div class="secao-titulo" style="font-size:.85rem">${b.titulo}</div>
    ${b.itens.join("")}`).join(""):'<p class="hist-vazio">Nenhum resultado encontrado para "'+esc(termo)+'".</p>';
}
window.executarPesquisaGlobal=executarPesquisaGlobal;

export async function carregarSalaSituacao(){
  document.getElementById("sit-data").textContent=`📅 ${agora()}`;
  const hoje=new Date().toISOString().slice(0,10);

  let presentesHoje=0,ocAndamento=0,ocPendentes=0,padsAtivos=0,vtrDisp=0,munBaixa=0;
  let muns=[],coletes=[],pads=[],ocLista=[];

  try{
    const snap=await getDocs(query(collection(db,COL_PLANTAO),where("data","==",hoje)));
    presentesHoje=snap.docs.filter(d=>d.data().status==="presente").length;
  }catch(e){}

  try{ await carregarViaturasCache(); vtrDisp=_viaturasCache.filter(v=>v.situacao==="disponivel").length; }catch(e){}

  try{
    muns=await carregarMunicoesCache();
    munBaixa=muns.filter(m=>m.qtd<=m.min&&m.min>0).length;
  }catch(e){}

  try{
    const snapC=await getDocs(collection(db,COL_COLETES));
    coletes=snapC.docs.map(d=>d.data());
  }catch(e){}

  try{
    const snapP=await getDocs(collection(db,COL_PAD));
    pads=snapP.docs.map(d=>({id:d.id,...d.data()}));
    padsAtivos=pads.filter(p=>p.status!=="arquivado").length;
  }catch(e){}

  try{
    ocLista=(window._ocCache||carregarOC());
    ocAndamento=ocLista.filter(o=>o.status==="andamento").length;
    ocPendentes=ocLista.filter(o=>!o.statusCorregedoria&&o.status!=="encerrada").length;
  }catch(e){}

  document.getElementById("sit-efetivo").textContent=presentesHoje;
  document.getElementById("sit-vtr-disp").textContent=vtrDisp;
  document.getElementById("sit-pad-ativos").textContent=padsAtivos;
  document.getElementById("sit-oc-andamento").textContent=ocAndamento;
  document.getElementById("sit-oc-pendentes").textContent=ocPendentes;
  document.getElementById("sit-mun-baixa").textContent=munBaixa;

  renderRecomendacoesIA();
}

export async function carregarAlertasCorregedoria(){
  let muns=[],coletes=[],pads=[],ocLista=[],ocPendentes=0;
  try{ muns=await carregarMunicoesCache(); }catch(e){}
  try{
    const snapC=await getDocs(collection(db,COL_COLETES));
    coletes=snapC.docs.map(d=>d.data());
  }catch(e){}
  try{
    const snapP=await getDocs(collection(db,COL_PAD));
    pads=snapP.docs.map(d=>({id:d.id,...d.data()}));
  }catch(e){}
  try{
    ocLista=(window._ocCache||carregarOC());
    ocPendentes=ocLista.filter(o=>!o.statusCorregedoria&&o.status!=="encerrada").length;
  }catch(e){}
  renderAlertasCCO({muns,coletes,pads,ocPendentes,ocLista});
}

export function renderAlertasCCO({muns,coletes,pads,ocPendentes}){
  const el=document.getElementById("sit-alertas");
  const alertas=[];

  const munsBaixas=muns.filter(m=>m.qtd<=m.min&&m.min>0);
  munsBaixas.forEach(m=>alertas.push({nivel:"critico",
    texto:`Estoque crítico de munição: <strong>${m.nome}</strong> (${m.qtd} un., mínimo ${m.min})`}));

  coletes.forEach(c=>{
    const d=diasParaVencer(c.dataValidade);
    if(d!==null&&d<0)alertas.push({nivel:"critico",
      texto:`Colete vencido — patrimônio <strong>${c.numeroPatrimonio||c.id}</strong> (venceu há ${Math.abs(d)} dia(s))`});
    else if(d!==null&&d<=30)alertas.push({nivel:"importante",
      texto:`Colete próximo do vencimento — patrimônio <strong>${c.numeroPatrimonio||c.id}</strong> (${d} dia(s))`});
  });

  pads.filter(p=>p.status!=="arquivado"&&p.prazo).forEach(p=>{
    const d=diasParaVencer(p.prazo);
    if(d!==null&&d<0)alertas.push({nivel:"critico",
      texto:`PAD <strong>${p.numero}</strong> com prazo vencido há ${Math.abs(d)} dia(s)`});
    else if(d!==null&&d<=7)alertas.push({nivel:"importante",
      texto:`PAD <strong>${p.numero}</strong> com prazo vencendo em ${d} dia(s)`});
  });

  if(ocPendentes>0)alertas.push({nivel:"importante",
    texto:`${ocPendentes} ocorrência(s) aguardando decisão do Comando`});

  const padsBacklog=pads.filter(p=>["recebido","analise"].includes(p.status)).length;
  if(padsBacklog>5)alertas.push({nivel:"importante",
    texto:`${padsBacklog} PADs acumulados em recebido/análise — considere priorizar`});

  if(!alertas.length){el.innerHTML=`<div class="sit-alerta info">🟢 Nenhuma situação crítica identificada no momento.</div>`;return;}

  const icone={critico:"🔴",importante:"🟡",info:"🟢"};
  alertas.sort((a,b)=>(a.nivel==="critico"?0:a.nivel==="importante"?1:2)-(b.nivel==="critico"?0:b.nivel==="importante"?1:2));
  el.innerHTML=alertas.map(a=>`<div class="sit-alerta ${a.nivel}">${icone[a.nivel]} ${esc(a.texto)}</div>`).join("");
}

export async function renderRecomendacoesIA(){
  const el=document.getElementById("sit-ia");
  const recs=[];
  try{
    const desde=new Date();desde.setDate(desde.getDate()-30);
    const desdeStr=desde.toISOString().slice(0,10);
    const snap=await getDocs(collection(db,COL_PLANTAO));
    const regs=snap.docs.map(d=>d.data()).filter(r=>r.data>=desdeStr);

    // faltas por servidor
    const faltasPorServidor={};
    regs.filter(r=>r.status==="ausente").forEach(r=>{
      faltasPorServidor[r.servidorNome]=(faltasPorServidor[r.servidorNome]||0)+1;
    });
    Object.entries(faltasPorServidor).filter(([,q])=>q>=3)
      .sort((a,b)=>b[1]-a[1]).slice(0,3)
      .forEach(([nome,q])=>recs.push(`Reincidência de faltas identificada: <strong>${nome}</strong> (${q} falta(s) nos últimos 30 dias).`));

    // atrasos por servidor
    const atrasosPorServidor={};
    regs.filter(r=>r.status==="atrasado").forEach(r=>{
      atrasosPorServidor[r.servidorNome]=(atrasosPorServidor[r.servidorNome]||0)+1;
    });
    Object.entries(atrasosPorServidor).filter(([,q])=>q>=3)
      .sort((a,b)=>b[1]-a[1]).slice(0,3)
      .forEach(([nome,q])=>recs.push(`Reincidência de atrasos identificada: <strong>${nome}</strong> (${q} atraso(s) nos últimos 30 dias).`));

    // equipe com mais ausências
    const faltasPorEquipe={};
    regs.filter(r=>r.status==="ausente"&&r.equipe).forEach(r=>{
      faltasPorEquipe[r.equipe]=(faltasPorEquipe[r.equipe]||0)+1;
    });
    const piorEquipe=Object.entries(faltasPorEquipe).sort((a,b)=>b[1]-a[1])[0];
    if(piorEquipe&&piorEquipe[1]>=3)recs.push(`Aumento de faltas identificado na Equipe <strong>${piorEquipe[0]}</strong> (${piorEquipe[1]} nos últimos 30 dias).`);
  }catch(e){}

  try{
    const muns=await carregarMunicoesCache();
    muns.filter(m=>m.qtd<=m.min&&m.min>0).forEach(m=>
      recs.push(`O estoque de <strong>${m.nome}</strong> atingiu o limite mínimo — reposição recomendada.`));
  }catch(e){}

  try{
    const snapP=await getDocs(collection(db,COL_PAD));
    const pads=snapP.docs.map(d=>d.data());
    const vencendo=pads.filter(p=>p.status!=="arquivado"&&p.prazo&&diasParaVencer(p.prazo)!==null&&diasParaVencer(p.prazo)<=7&&diasParaVencer(p.prazo)>=0).length;
    if(vencendo>0)recs.push(`${vencendo} PAD(s) com prazo final se aproximando (≤7 dias).`);
  }catch(e){}

  el.innerHTML=recs.length?recs.map(r=>`<div class="sit-ia-item">💡 ${r}</div>`).join("")
    :`<p class="hist-vazio">Nenhum padrão relevante identificado nos últimos 30 dias.</p>`;
}

export async function carregarDashboardComando(){
  document.getElementById("cmd-data").textContent=`📅 ${agora()}`;
  const hoje=new Date().toISOString().slice(0,10);
  const mesAtual=hoje.slice(0,7);

  // Efetivo
  try{
    const snap=await getDocs(query(collection(db,COL_PLANTAO),where("data","==",hoje)));
    const docs=snap.docs.map(d=>d.data());
    document.getElementById("cmd-servico").textContent=docs.filter(d=>d.status==="presente").length;
    document.getElementById("cmd-folga").textContent=docs.filter(d=>d.status==="ausente").length;
    document.getElementById("cmd-afastado").textContent=docs.filter(d=>d.status==="atrasado").length;
    document.getElementById("cmd-jorn-ord").textContent=docs.filter(d=>d.jornada==="Ordinário").length;
    document.getElementById("cmd-jorn-ext").textContent=docs.filter(d=>d.jornada==="Extraordinário").length;
  }catch(e){}

  // Viaturas
  await carregarViaturasCache();
  const vtrs=_viaturasCache;
  document.getElementById("cmd-vtr-disp").textContent=vtrs.filter(v=>v.situacao==="disponivel").length;
  document.getElementById("cmd-vtr-serv").textContent=vtrs.filter(v=>v.situacao==="servico").length;
  document.getElementById("cmd-vtr-man").textContent=vtrs.filter(v=>v.situacao==="manutencao").length;

  // Armaria
  let armas=[];
  try{armas=(await getDocs(collection(db,COL_ARMAS_IND))).docs.map(d=>d.data());}catch(e){}
  const muns=await carregarMunicoesCache();
  document.getElementById("cmd-armas-total").textContent=armas.length;
  document.getElementById("cmd-mun-total").textContent=muns.reduce((s,m)=>s+(Number(m.qtd)||0),0);
  const estBaixo=muns.filter(m=>m.qtd<=m.min&&m.min>0).length;
  document.getElementById("cmd-estoque-baixo").textContent=estBaixo;

  // Inspetoria
  try{
    const snapF=await getDocs(query(collection(db,COL_FISC)));
    const fiscMes=snapF.docs.filter(d=>d.data()?.data?.startsWith(mesAtual));
    document.getElementById("cmd-fisc-total").textContent=fiscMes.length;
  }catch(e){}

  const ocLista=(window._ocCache||carregarOC());
  document.getElementById("cmd-oc-total").textContent=ocLista.filter(o=>o.data?.startsWith(mesAtual)).length;

  // Corregedoria
  try{
    const snapOCcor=await getDocs(query(collection(db,COL_OC),where("statusCorregedoria","in",
      ["recebida","info_solicitada","pad_aberto","arquivada_sem_pad","devolvida"])));
    document.getElementById("cmd-cor-recebidas").textContent=snapOCcor.size;
    const aguardando=snapOCcor.docs.filter(d=>["recebida","info_solicitada"].includes(d.data().statusCorregedoria)).length;
    document.getElementById("cmd-cor-aguardando").textContent=aguardando;
  }catch(e){}
  try{
    const snap=await getDocs(query(collection(db,COL_PAD)));
    const pads=snap.docs.map(d=>d.data());
    document.getElementById("cmd-pad-rec").textContent=pads.filter(p=>p.status==="recebido").length;
    document.getElementById("cmd-pad-ana").textContent=pads.filter(p=>p.status==="analise").length;
    document.getElementById("cmd-pad-ab").textContent=pads.filter(p=>p.status==="aberto").length;
    document.getElementById("cmd-pad-arq").textContent=pads.filter(p=>p.status==="arquivado").length;
  }catch(e){}

  // Gráficos simples (barras CSS)
  renderGraficosComando(armas,muns);
}

export function renderGraficosComando(armas,muns){
  const el=document.getElementById("cmd-graficos");
  armas=armas||[];muns=muns||_municoesCache;
  const situacoes=["Disponível","Acautelada","Em manutenção","Reserva","Apreendida","Baixada"];
  const porSituacao=situacoes.map(s=>({nome:s,qtd:armas.filter(a=>a.situacao===s).length})).filter(x=>x.qtd>0);
  const maxArma=Math.max(...porSituacao.map(a=>a.qtd),1);
  const maxMun=Math.max(...muns.map(m=>m.qtd),1);

  let html=`<div style="background:rgba(255,255,255,.04);border:1px solid rgba(201,168,76,.2);border-radius:8px;padding:12px;margin-bottom:8px">
    <div style="font-family:'Oswald',sans-serif;font-size:.72rem;letter-spacing:1px;color:var(--dourado);margin-bottom:8px"><span class="ic-img ic-arma"></span> ARMAS POR SITUAÇÃO</div>`;
  porSituacao.forEach(a=>{
    const pct=Math.round((a.qtd/maxArma)*100);
    const cor=a.nome==="Em manutenção"||a.nome==="Baixada"||a.nome==="Apreendida"?"#f87171":"#60a5fa";
    html+=`<div class="chart-bar-wrap">
      <div class="chart-bar-label">${a.nome} (${a.qtd})</div>
      <div class="chart-bar-track"><div class="chart-bar-fill" style="width:${pct}%;background:${cor}"></div></div>
    </div>`;
  });
  if(!porSituacao.length)html+=`<p class="hist-vazio">Sem armas cadastradas.</p>`;
  html+=`</div>`;

  if(muns.length){
    html+=`<div style="background:rgba(255,255,255,.04);border:1px solid rgba(201,168,76,.2);border-radius:8px;padding:12px">
      <div style="font-family:'Oswald',sans-serif;font-size:.72rem;letter-spacing:1px;color:var(--dourado);margin-bottom:8px"><span class="ic-img ic-municoes"></span> ESTOQUE DE MUNIÇÕES</div>`;
    muns.slice(0,5).forEach(m=>{
      const pct=Math.round((m.qtd/maxMun)*100);
      const cor=m.qtd<=m.min&&m.min>0?"#f87171":"#7dcea0";
      html+=`<div class="chart-bar-wrap">
        <div class="chart-bar-label">${m.nome} (${m.qtd})</div>
        <div class="chart-bar-track"><div class="chart-bar-fill" style="width:${pct}%;background:${cor}"></div></div>
      </div>`;
    });
    html+=`</div>`;
  }
  el.innerHTML=html;
}

export async function carregarLog(){
  const lista=document.getElementById("log-lista");
  const cont =document.getElementById("log-contador");
  if(!lista)return;
  lista.innerHTML='<p class="hist-vazio">Carregando...</p>';
  try{
    const snap=await getDocs(query(collection(db,COL_LOG),orderBy("criadoEm","desc")));
    let docs=snap.docs.map(d=>({id:d.id,...d.data()}));

    const nome=(v("filtro-log-nome")||"").toLowerCase();
    const data= v("filtro-log-data")||"";
    const tipo= v("filtro-log-tipo")||"";
    if(nome) docs=docs.filter(d=>d.usuarioNome?.toLowerCase().includes(nome)||d.usuarioEmail?.toLowerCase().includes(nome));
    if(data) docs=docs.filter(d=>d.hora?.includes(data.split("-").reverse().join("/")));
    if(tipo) docs=docs.filter(d=>d.tipo===tipo);

    cont.textContent=docs.length?`${docs.length} registro(s)`:"";
    if(!docs.length){lista.innerHTML='<p class="hist-vazio">Nenhum registro encontrado.</p>';return;}

    lista.innerHTML=docs.map(d=>{
      const ic=d.tipo==="login"?"✅":d.tipo==="logout"?"🚪":d.tipo==="timeout"?"⏱":"❌";
      const cor=d.tipo==="login"?"#7dcea0":d.tipo==="tentativa_falha"?"#f1948a":
                d.tipo==="timeout"?"#f0b27a":"var(--cinza)";
      return`<div class="hist-item" style="border-left-color:${cor}">
        <div class="hist-tipo" style="color:${cor}">${ic} ${(d.tipo||"").replace("_"," ").toUpperCase()}</div>
        <div class="hist-data">🕐 ${d.hora||""}</div>
        <div class="hist-usuario">👤 ${d.usuarioNome||d.usuarioEmail||"desconhecido"}${d.matricula?" · Mat: "+d.matricula:""}</div>
        <div class="hist-corpo" style="font-size:.72rem">${d.detalhes||""}\n📱 ${(d.dispositivo||"").substring(0,55)}</div>
      </div>`;
    }).join("");
  }catch(err){lista.innerHTML=`<p class="hist-vazio">Erro: ${err.message}</p>`;}
}
window.carregarLog=carregarLog;

export async function sairPorTimeoutComLog(){
  // registra antes de limpar usuarioLogado
  if(usuarioLogado){
    try{
      await addDoc(collection(db,COL_LOG),{
        usuarioId:    usuarioLogado.id||"",
        usuarioNome:  usuarioLogado.nome||"",
        usuarioEmail: usuarioLogado.email||"",
        matricula:    usuarioLogado.matricula||"",
        tipo:"timeout",
        detalhes:"Sessão encerrada por inatividade (10 min)",
        dispositivo:  navigator.userAgent.substring(0,60),
        hora:         agora(),
        criadoEm:     serverTimestamp()
      });
    }catch(e){}
  }
  sairPorTimeout();
}

export const MESES_PT=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

export let _mpPlantoesMesOffset=0,_mpBhDetalheOffset=0,_mpBhCacheCompleto=[],_mpBhResumoAtualTexto="";

onAuthStateChanged(auth,async(user)=>{
  if(!user){adminAutenticado=false;return;}
  try{
    const snap=await getDoc(doc(db,"admins",user.uid));
    adminAutenticado=snap.exists();
  }catch(e){adminAutenticado=false;}
});

["touchstart","click","keydown","scroll"].forEach(evt=>
  document.addEventListener(evt, registrarAtividade, {passive:true}));

document.getElementById("btn-atualizar-admin").addEventListener("click",carregarAdmin);

atualizarBadge();

atualizarMenu();

atualizarBadgeCorregedoria();

atualizarBadgeCmdOc();

atualizarBadgesHome();

if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./sw.js').catch(()=>{});
}

