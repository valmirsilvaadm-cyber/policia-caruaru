// Ponto de entrada único carregado pelo index.html.
// Cada import abaixo executa o módulo correspondente, o que atribui todas
// as suas funções a window.X (necessário para os onclick="..." do HTML) e,
// no caso do core.js, também inicializa o Firebase e registra os listeners
// de autenticação/sessão. A ordem de importação aqui não afeta a ordem de
// execução real — os módulos ES resolvem as dependências entre si primeiro
// (core.js sempre termina de rodar antes de qualquer função de outro
// módulo ser chamada de verdade, pois isso só acontece em resposta a uma
// ação do usuário, nunca durante o carregamento da página).
import "./core.js";
import "./administrativo.js";
import "./armaria.js";
import "./inspetoria.js";
import "./meu_painel.js";
import "./ocorrencias.js";
import "./pad.js";
import "./patrimonio.js";
import "./plantao.js";
import "./posto_fixo.js";
import "./tecnologia.js";
