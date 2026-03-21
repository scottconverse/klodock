import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import MarkdownIt from 'markdown-it';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const mdPath = path.join(projectRoot, 'README-full.md');
const pdfPath = path.join(projectRoot, 'ClawPad-README.pdf');

const md = new MarkdownIt({ html: true, typographer: true });
const markdown = fs.readFileSync(mdPath, 'utf-8');
const htmlBody = md.render(markdown);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  @page {
    margin: 1in 0.85in;
    size: letter;
  }
  body {
    font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.55;
    color: #1a1a1a;
    max-width: 100%;
  }
  h1 {
    font-size: 26pt;
    font-weight: 700;
    color: #0f172a;
    margin-top: 0;
    margin-bottom: 4pt;
    border-bottom: 3px solid #2563eb;
    padding-bottom: 8pt;
  }
  h2 {
    font-size: 16pt;
    font-weight: 600;
    color: #1e40af;
    margin-top: 28pt;
    margin-bottom: 8pt;
    border-bottom: 1px solid #cbd5e1;
    padding-bottom: 4pt;
    page-break-after: avoid;
  }
  h3 {
    font-size: 13pt;
    font-weight: 600;
    color: #334155;
    margin-top: 18pt;
    margin-bottom: 6pt;
    page-break-after: avoid;
  }
  p {
    margin: 6pt 0;
  }
  ul, ol {
    margin: 6pt 0;
    padding-left: 20pt;
  }
  li {
    margin: 4pt 0;
  }
  li strong {
    color: #1e293b;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 10pt 0;
    font-size: 10pt;
    page-break-inside: avoid;
  }
  th {
    background: #f1f5f9;
    color: #1e293b;
    font-weight: 600;
    text-align: left;
    padding: 6pt 10pt;
    border: 1px solid #cbd5e1;
  }
  td {
    padding: 5pt 10pt;
    border: 1px solid #e2e8f0;
    vertical-align: top;
  }
  tr:nth-child(even) td {
    background: #f8fafc;
  }
  code {
    font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace;
    font-size: 9.5pt;
    background: #f1f5f9;
    padding: 1pt 4pt;
    border-radius: 3pt;
    color: #be185d;
  }
  pre {
    background: #0f172a;
    color: #e2e8f0;
    padding: 12pt 16pt;
    border-radius: 6pt;
    overflow-x: auto;
    font-size: 9pt;
    line-height: 1.45;
    margin: 10pt 0;
    page-break-inside: avoid;
  }
  pre code {
    background: none;
    color: inherit;
    padding: 0;
    font-size: inherit;
  }
  hr {
    border: none;
    border-top: 1px solid #e2e8f0;
    margin: 20pt 0;
  }
  a {
    color: #2563eb;
    text-decoration: none;
  }
  /* First table after h1 is the metadata table — style it differently */
  h1 + table,
  h1 + p + table {
    border: none;
    width: auto;
    margin: 0 0 10pt 0;
  }
  h1 + table td,
  h1 + table th,
  h1 + p + table td,
  h1 + p + table th {
    border: none;
    background: none;
    padding: 2pt 12pt 2pt 0;
    font-size: 10pt;
    color: #475569;
  }
  /* Page break hints */
  h2 { page-break-before: auto; }
  pre, table { page-break-inside: avoid; }
</style>
</head>
<body>
${htmlBody}
</body>
</html>`;

console.log('Launching browser...');
const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();

console.log('Rendering HTML...');
await page.setContent(html, { waitUntil: 'networkidle0' });

console.log(`Writing PDF to ${pdfPath}...`);
await page.pdf({
  path: pdfPath,
  format: 'Letter',
  printBackground: true,
  margin: { top: '0.85in', bottom: '0.85in', left: '0.85in', right: '0.85in' },
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate: `
    <div style="font-size: 8pt; color: #94a3b8; width: 100%; text-align: center; padding: 0 0.85in;">
      ClawPad v0.1.0 — <span class="pageNumber"></span> / <span class="totalPages"></span>
    </div>
  `,
});

await browser.close();

const stats = fs.statSync(pdfPath);
console.log(`Done! PDF size: ${(stats.size / 1024).toFixed(0)} KB`);
