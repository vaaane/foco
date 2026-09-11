// ementa-data.js
// Ementa do concurso SEDF - Professor de Educação Básica / Matemática (cargo 429)
// Fonte: Edital nº 31/2022 (Anexo IV). Estrutura em árvore: um nó pode ter "filhos".
// Nó sem filhos = item marcável (checkbox). Nó com filhos = expansível.
// Os ids são estáveis: use-os como chave no Firebase (usuarios/$uid/ementa/$id).

export const ementaData = [
  {
    id: "basicos",
    titulo: "Conhecimentos Básicos (40 itens)",
    filhos: [
      {
        id: "b_lp",
        titulo: "Língua Portuguesa",
        filhos: [
          { id: "b_lp_1", titulo: "Compreensão e interpretação de textos" },
          { id: "b_lp_2", titulo: "Tipos e gêneros textuais" },
          { id: "b_lp_3", titulo: "Ortografia oficial" },
          {
            id: "b_lp_4",
            titulo: "Coesão textual",
            filhos: [
              { id: "b_lp_4_1", titulo: "Referenciação, substituição, conectores" },
              { id: "b_lp_4_2", titulo: "Tempos e modos verbais" }
            ]
          },
          {
            id: "b_lp_5",
            titulo: "Estrutura morfossintática do período",
            filhos: [
              { id: "b_lp_5_1", titulo: "Classes de palavras" },
              { id: "b_lp_5_2", titulo: "Coordenação" },
              { id: "b_lp_5_3", titulo: "Subordinação" },
              { id: "b_lp_5_4", titulo: "Pontuação" },
              { id: "b_lp_5_5", titulo: "Concordância verbal e nominal" },
              { id: "b_lp_5_6", titulo: "Regência verbal e nominal" },
              { id: "b_lp_5_7", titulo: "Crase" },
              { id: "b_lp_5_8", titulo: "Colocação pronominal" }
            ]
          },
          {
            id: "b_lp_6",
            titulo: "Reescrita de frases e parágrafos",
            filhos: [
              { id: "b_lp_6_1", titulo: "Significação das palavras" },
              { id: "b_lp_6_2", titulo: "Substituição de palavras/trechos" },
              { id: "b_lp_6_3", titulo: "Reorganização de orações e períodos" },
              { id: "b_lp_6_4", titulo: "Reescrita de gêneros e níveis de formalidade" }
            ]
          },
          { id: "b_lp_7", titulo: "Figuras de linguagem" }
        ]
      },
      {
        id: "b_info",
        titulo: "Tecnologia na Educação e Informática Básica",
        filhos: [
          { id: "b_info_1", titulo: "Segurança da informação (vírus, backup)" },
          { id: "b_info_2", titulo: "Plataforma Google (Sala de Aula, Docs, Planilhas)" },
          { id: "b_info_3", titulo: "Windows (textos, planilhas, apresentações)" },
          { id: "b_info_4", titulo: "Internet (ferramentas e procedimentos)" },
          { id: "b_info_5", titulo: "Organização de arquivos, pastas e programas" }
        ]
      },
      {
        id: "b_dir",
        titulo: "Noções de Direito Administrativo",
        filhos: [
          { id: "b_dir_1", titulo: "Estado, governo e administração pública" },
          { id: "b_dir_2", titulo: "Organização administrativa do Estado" },
          { id: "b_dir_3", titulo: "Administração direta e indireta" },
          { id: "b_dir_4", titulo: "Agentes públicos" },
          { id: "b_dir_5", titulo: "Poderes administrativos" },
          { id: "b_dir_6", titulo: "Atos administrativos" },
          { id: "b_dir_7", titulo: "Controle e responsabilização da administração" },
          { id: "b_dir_8", titulo: "LC nº 840/2011 (Títulos I, II, V, VI, VII)" }
        ]
      },
      {
        id: "b_df",
        titulo: "Conhecimentos acerca do Distrito Federal",
        filhos: [
          { id: "b_df_1", titulo: "Realidade étnica, social e histórica do DF" },
          { id: "b_df_2", titulo: "Realidade geográfica, cultural, política e econômica" },
          { id: "b_df_3", titulo: "RIDE (LC nº 94/1998)" }
        ]
      },
      { id: "b_atual", titulo: "Atualidades (somente prova discursiva)" }
    ]
  },
  {
    id: "complementares",
    titulo: "Conhecimentos Complementares (30 itens)",
    filhos: [
      {
        id: "c_leg",
        titulo: "Legislação",
        filhos: [
          { id: "c_leg_1", titulo: "CF/1988 (art. 205 a 214)" },
          { id: "c_leg_2", titulo: "LDB — Lei 9.394/1996 (Títulos I a IX)" },
          { id: "c_leg_3", titulo: "ECA — Lei 8.069/1990" },
          { id: "c_leg_4", titulo: "LBI — Lei 13.146/2015 (Direito à Educação)" },
          { id: "c_leg_5", titulo: "DCN Educação Infantil (Res. CNE/CEB 5/2009)" },
          { id: "c_leg_6", titulo: "DCN Ensino Fundamental 9 anos (Res. 7/2010)" },
          { id: "c_leg_7", titulo: "DCN Ensino Médio (Res. CNE/CEB 3/2018)" },
          { id: "c_leg_8", titulo: "Diretrizes EJA (Res. CNE/CEB 1/2021)" },
          { id: "c_leg_9", titulo: "Lei 13.415/2017 — Reforma do Ensino Médio" },
          { id: "c_leg_10", titulo: "Lei Orgânica do DF" },
          { id: "c_leg_11", titulo: "Resolução nº 2/2020-CEDF" },
          { id: "c_leg_12", titulo: "Regimento Escolar da Rede Pública DF (Port. 15/2015)" },
          { id: "c_leg_13", titulo: "Plano Distrital de Educação (PDE 2015-2024)" },
          { id: "c_leg_14", titulo: "Currículo em Movimento — Pressupostos Teóricos" },
          { id: "c_leg_15", titulo: "II Plano Distrital de Política para Mulheres" },
          { id: "c_leg_16", titulo: "Lei nº 5.105/2013" },
          { id: "c_leg_17", titulo: "Plano Nacional de Educação (PNE 2014-2024)" }
        ]
      },
      {
        id: "c_ped",
        titulo: "Temas Educacionais e Pedagógicos",
        filhos: [
          { id: "c_ped_1", titulo: "Planejamento e organização do trabalho pedagógico" },
          { id: "c_ped_2", titulo: "Currículo: do proposto à prática" },
          { id: "c_ped_3", titulo: "TIC na educação" },
          { id: "c_ped_4", titulo: "Educação para diversidade, cidadania e direitos humanos; EAD" },
          { id: "c_ped_5", titulo: "Educação integral" },
          { id: "c_ped_6", titulo: "Educação do campo" },
          { id: "c_ped_7", titulo: "Educação de Jovens e Adultos" },
          { id: "c_ped_8", titulo: "Educação ambiental" },
          { id: "c_ped_9", titulo: "Fundamentos da educação especial/inclusiva" },
          { id: "c_ped_10", titulo: "Educação, sociedade e prática escolar" },
          { id: "c_ped_11", titulo: "Tendências pedagógicas na prática escolar" },
          { id: "c_ped_12", titulo: "Didática e prática histórico-cultural" },
          { id: "c_ped_13", titulo: "A didática na formação do professor" },
          { id: "c_ped_14", titulo: "Aspectos pedagógicos e sociais da prática educativa" },
          { id: "c_ped_15", titulo: "Processos de ensino e de aprendizagem" },
          { id: "c_ped_16", titulo: "Relação professor/aluno" },
          { id: "c_ped_17", titulo: "Compromisso social e ético do professor" },
          { id: "c_ped_18", titulo: "Componentes do processo de ensino" },
          { id: "c_ped_19", titulo: "Interdisciplinaridade e transdisciplinaridade" },
          { id: "c_ped_20", titulo: "Avaliação escolar e implicações pedagógicas" },
          { id: "c_ped_21", titulo: "Papel político-pedagógico do ensinar/aprender/pesquisar" },
          { id: "c_ped_22", titulo: "Projeto político-pedagógico da escola" },
          { id: "c_ped_23", titulo: "Políticas públicas para a Educação Básica" },
          { id: "c_ped_24", titulo: "Gestão democrática" },
          { id: "c_ped_25", titulo: "Educação em Direitos Humanos (étnico-raciais, gênero)" }
        ]
      }
    ]
  },
  {
    id: "matematica",
    titulo: "Conhecimentos Específicos — Matemática (50 itens)",
    filhos: [
      {
        id: "e_1",
        titulo: "Números",
        filhos: [
          { id: "e_1_1", titulo: "Propriedades e operações: inteiros, racionais, irracionais, reais" }
        ]
      },
      {
        id: "e_2",
        titulo: "Funções",
        filhos: [
          { id: "e_2_1", titulo: "Igualdade de funções" },
          { id: "e_2_2", titulo: "Determinação do domínio" },
          { id: "e_2_3", titulo: "Injetivas, sobrejetivas e bijetivas" },
          { id: "e_2_4", titulo: "Função inversa" },
          { id: "e_2_5", titulo: "Composição de funções" },
          { id: "e_2_6", titulo: "Crescentes, decrescentes, pares e ímpares; zeros e sinal" },
          { id: "e_2_7", titulo: "1º grau, 2º grau, modular, polinomial, log e exponencial" }
        ]
      },
      { id: "e_3", titulo: "Equações e inequações" },
      {
        id: "e_4",
        titulo: "Geometrias",
        filhos: [
          { id: "e_4_1", titulo: "Geometria plana" },
          { id: "e_4_2", titulo: "Geometria espacial" },
          { id: "e_4_3", titulo: "Geometria analítica" }
        ]
      },
      { id: "e_5", titulo: "Trigonometria (seno, cosseno, tangente)" },
      {
        id: "e_6",
        titulo: "Sequências",
        filhos: [
          { id: "e_6_1", titulo: "Fibonacci e sequências numéricas" },
          { id: "e_6_2", titulo: "Progressões aritmética e geométrica (PA e PG)" }
        ]
      },
      {
        id: "e_7",
        titulo: "Matrizes",
        filhos: [
          { id: "e_7_1", titulo: "Determinantes" },
          { id: "e_7_2", titulo: "Sistemas lineares" },
          { id: "e_7_3", titulo: "Análise combinatória" },
          { id: "e_7_4", titulo: "Binômio de Newton" }
        ]
      },
      {
        id: "e_8",
        titulo: "Noções de estatística",
        filhos: [
          { id: "e_8_1", titulo: "Medidas de tendência central" },
          { id: "e_8_2", titulo: "Medidas de dispersão e distribuição de frequência" },
          { id: "e_8_3", titulo: "Gráficos" },
          { id: "e_8_4", titulo: "Tabelas" }
        ]
      },
      {
        id: "e_9",
        titulo: "Matemática financeira",
        filhos: [
          { id: "e_9_1", titulo: "Proporção, %, juros simples e composto, descontos" },
          { id: "e_9_2", titulo: "Taxa efetiva e equivalência de capitais" }
        ]
      },
      { id: "e_10", titulo: "Cálculo de probabilidade" },
      { id: "e_11", titulo: "Números complexos" },
      { id: "e_12", titulo: "Noções de história da Matemática" },
      {
        id: "e_13",
        titulo: "Avaliação e educação matemática",
        filhos: [
          { id: "e_13_1", titulo: "Formas e instrumentos" }
        ]
      },
      { id: "e_14", titulo: "Ensino de Matemática" },
      { id: "e_15", titulo: "BNCC — competências e habilidades (Fund. e Médio)" },
      { id: "e_16", titulo: "Currículo do DF — Matemática (Fund. e Médio)" }
    ]
  }
];
