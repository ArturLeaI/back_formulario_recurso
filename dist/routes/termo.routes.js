"use strict";
// import { Router } from "express";
// import Mustache from "mustache";
// import puppeteer from "puppeteer";
Object.defineProperty(exports, "__esModule", { value: true });
// const router = Router();
// router.post("/pdf", async (req, res) => {
//   try {
//     const data = req.body;
//     const html = Mustache.render(
//       `
//       <!doctype html>
//       <html>
//         <head>
//           <meta charset="utf-8" />
//           <style>
//             body { font-family: "Times New Roman", Times, serif; font-size: 12px; line-height: 1.35; }
//             .center { text-align:center; }
//             .bold { font-weight:700; }
//             h1,h2,h3 { margin: 0; }
//             table { width: 100%; border-collapse: collapse; margin-top: 8px; }
//             th, td { border: 1px solid #000; padding: 6px; }
//             th { font-weight: 700; }
//             .spacer { height: 12px; }
//             .assinaturas { margin-top: 50px; display:flex; justify-content: space-between; gap: 24px; }
//             .linha { border-top: 1px solid #000; width: 280px; padding-top: 6px; }
//           </style>
//         </head>
//         <body>
//           <div class="center bold">MINISTÉRIO DA SAÚDE</div>
//           <div class="center bold">SECRETARIA DE GESTÃO DO TRABALHO E DA EDUCAÇÃO NA SAÚDE</div>
//           <div class="spacer"></div>
//           <div class="bold">ANEXO I</div>
//           <div class="spacer"></div>
//           <div class="bold">
//             TERMO DE ADESÃO E COMPROMISSO ENTRE O MINISTÉRIO DA SAÚDE E O ENTE FEDERATIVO PARA PARTICIPAÇÃO NO PROJETO MAIS MÉDICOS ESPECIALISTAS
//           </div>
//           <div class="spacer"></div>
//           <div><span class="bold">Total de vagas solicitadas:</span> {{totalvagas}}</div>
//           <div class="spacer"></div>
//           <div class="bold">Quadro de vagas solicitadas por Aprimoramento e estabelecimento:</div>
//           <table>
//             <thead>
//               <tr>
//                 <th>Aprimoramento</th>
//                 <th>CNES</th>
//                 <th>Nº de vagas solicitadas</th>
//               </tr>
//             </thead>
//             <tbody>
//               {{#aprimoramentos}}
//                 <tr>
//                   <td>{{name}}</td>
//                   <td>{{cnes}}</td>
//                   <td>{{vagas}}</td>
//                 </tr>
//               {{/aprimoramentos}}
//             </tbody>
//           </table>
//           <div class="spacer"></div>
//           <div class="bold">
//             TERMO DE ADESÃO E COMPROMISSO QUE ENTRE SI CELEBRAM O MINISTÉRIO DA SAÚDE E O ENTE FEDERATIVO {{nomeente}},
//             PARA ADESÃO AO PROJETO MAIS MÉDICOS ESPECIALISTAS, NO ÂMBITO DO PROGRAMA MAIS MÉDICOS.
//           </div>
//           <div class="spacer"></div>
//           <div>
//             O MINISTÉRIO DA SAÚDE, CNPJ nº 03.274.533/0001-50, neste ato representado por FELIPE PROENÇO DE OLIVEIRA,
//             Secretário de Gestão do Trabalho e da Educação na Saúde - SGTES, com sede na Esplanada dos Ministérios,
//             Bloco "O", 9º andar, Brasília/DF e o ENTE FEDERATIVO {{nomeente}}, CNPJ nº {{cnpj}}, com sede em {{sede}},
//             representado por {{representacao}}, resolvem celebrar o presente Termo de Adesão e Compromisso...
//           </div>
//           <div class="spacer"></div>
//           <div>Brasília/DF, {{dia}} de {{mes}} de 2026.</div>
//           <div class="assinaturas">
//             <div>
//               <div class="linha"></div>
//               <div class="bold">FELIPE PROENÇO DE OLIVEIRA</div>
//               <div>Secretário de Gestão do Trabalho e da Educação na Saúde</div>
//             </div>
//             <div>
//               <div class="linha"></div>
//               <div class="bold">GESTOR LOCAL</div>
//             </div>
//           </div>
//         </body>
//       </html>
//       `,
//       data
//     );
//     const browser = await puppeteer.launch({
//       args: ["--no-sandbox", "--disable-setuid-sandbox"],
//     });
//     const page = await browser.newPage();
//     await page.setContent(html, { waitUntil: "networkidle0" });
//     const pdf = await page.pdf({
//       format: "A4",
//       printBackground: true,
//       margin: { top: "15mm", right: "15mm", bottom: "15mm", left: "15mm" },
//     });
//     await browser.close();
//     res.setHeader("Content-Type", "application/pdf");
//     res.setHeader("Content-Disposition", 'attachment; filename="Termo_de_Adesao.pdf"');
//     return res.send(pdf);
//   } catch (e: any) {
//     console.error(e);
//     return res.status(500).json({ ok: false, error: e?.message ?? "Erro ao gerar PDF" });
//   }
// });
// export default router;
