import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..').replaceAll('\\','/');
const dir=path.join(os.tmpdir(),'manuva-reports-accents-preview');
fs.mkdirSync(dir,{recursive:true});
const fixture=`import React from '${repo}/node_modules/react';
import {createRoot} from '${repo}/node_modules/react-dom/client';
import Reports from '${repo}/src/app/app/reports/page';
import AppContent from '${repo}/src/app/app/app-content';
import Topbar from '${repo}/src/app/app/topbar';
import SidebarNav from '${repo}/src/app/app/sidebar-nav';
import shell from '${repo}/src/app/app/shell.module.css';
import '${repo}/src/app/globals.css';
const q=new URLSearchParams(location.search),variant=q.get('variant')||'restrained';
document.documentElement.dataset.theme=q.get('theme')||'daylight';
document.body.className=variant==='balanced'?'professional balanced':variant;
createRoot(document.getElementById('root')).render(<div className={shell.shell}><aside className={shell.sidebar}><div className={shell.brand}><img src="/logo" width="140" alt="Manuva"/></div><SidebarNav hasPlanning isSuperAdmin isPlatformOperator /></aside><div className={shell.main}><div className="preview-note">{variant==='balanced'?'D - Colour with restraint':variant==='professional'?'C - Professional tool':variant==='expressive'?'B · Expressive accents':'A · Restrained accents'} · Pac-Technologies preview fixtures <nav><a href="/?variant=restrained">A · Restrained</a><a href="/?variant=expressive">B · Expressive</a><a href="/?variant=professional">C - Professional</a><a href="/?variant=balanced">D - Balanced</a></nav></div><Topbar userInitial="P" userAvatarUrl={null} tenantName="Pac-Technologies" selectableTenants={[]} currentTenantId="fixture"/><AppContent><Reports/></AppContent></div></div>);
`;
fs.writeFileSync(path.join(dir,'fixture.tsx'),fixture);
(async()=>{await build({entryPoints:[path.join(dir,'fixture.tsx')],outfile:path.join(dir,'fixture.js'),bundle:true,platform:'browser',jsx:'automatic',nodePaths:[repo+'/node_modules'],loader:{'.css':'local-css'},plugins:[{name:'preview-boundaries',setup(b){
b.onResolve({filter:/^next\/(link|navigation)$|^\.\/actions$/},a=>({path:a.path,namespace:'preview'}));
b.onLoad({filter:/.*/,namespace:'preview'},a=>({contents:a.path==='next/link'?"import React from 'react'; export default function Link({href,children,...rest}) {return <a href={href} {...rest}>{children}</a>}":a.path==='next/navigation'?"export const usePathname=()=>'/app/reports';":"export const signOut=()=>{}; export const switchActiveTenant=()=>{};",loader:'jsx',resolveDir:repo}));
b.onLoad({filter:/reports[\\/]page\.tsx$/},a=>{let s=fs.readFileSync(a.path,'utf8');const start=s.indexOf('  return (\n    <div className={styles.page}>');if(start<0)throw new Error('Reports render boundary missing');s=`import Link from 'next/link';import PageHeader from '../_ui/page-header';import styles from './reports.module.css';
export default function ReportsPreview(){
 const professional=['professional','balanced'].includes(new URLSearchParams(location.search).get('variant'));
 const onTimePct=null,deliveryMetric={deltaPoints:null},balances=Array.from({length:59}),totalValue=3000000,movCount=0,deadCount=59,deadValue=3000000,stocktakeTotal=7,lastStocktakeDaysAgo=124,openPOs=[],openLiability=0,overduePOs=0,yearSpend=420000,supplierCount=8,discrepancyCount=0,totalIssues=0;
 const fmtCurrency=n=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:0,notation:n>=100000?'compact':'standard'}).format(n);
`+s.slice(start).replace('        band\n','        band={!professional}\n').replace('        cover\n','        cover={!professional}\n').replace('title="Last 90 days in numbers."','title={professional ? "Reports" : "Last 90 days in numbers."}');return {contents:s,loader:'tsx',resolveDir:path.dirname(a.path)};});
b.onLoad({filter:/globals\.css$/},a=>({contents:fs.readFileSync(a.path,'utf8'),loader:'css'}));
}}]});
let fontCSS='';for(const f of fs.readdirSync(repo+'/.next/static/chunks').filter(f=>f.endsWith('.css'))){for(const m of fs.readFileSync(repo+'/.next/static/chunks/'+f,'utf8').matchAll(/@font-face\{[^}]+\}/g)){if(/Archivo|Inter/.test(m[0]))fontCSS+=m[0].replaceAll('../media/','/fonts/');}}
fs.writeFileSync(path.join(dir,'fonts.css'),fontCSS);
fs.writeFileSync(path.join(dir,'compare.css'),`
.preview-note{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 24px;color:var(--ink-muted);font-size:12px;background:var(--bg-card);border-bottom:1px solid var(--stroke)}
.preview-note nav{display:flex;gap:16px}.preview-note a{color:var(--brand-1);text-decoration:underline}
.expressive [data-app-content]>div>section[data-domain]>h2{font-family:var(--font-display);font-size:24px;font-weight:800;letter-spacing:-.02em;text-transform:none;padding:12px 16px;background:var(--accent-dim);border-left:4px solid var(--accent-loud);border-radius:var(--radius-xs)}
.expressive [data-app-content]>div>section[data-domain]>h2:after{display:none}
.expressive [data-app-content]>div>section[data-domain]>div>a{padding:24px;background:color-mix(in srgb,var(--accent-loud) 7%,var(--bg-card));border-top:4px solid var(--accent-loud)}
.expressive [data-app-content]>div>section[data-domain]>div>a>div:nth-child(2){font-size:34px;font-weight:800;font-variation-settings:"wdth" 108,"wght" 800;letter-spacing:-.025em;margin:8px 0 6px}
.expressive [data-app-content]>div>section[data-domain]>div>a[href$="dead-stock"]{background:var(--warning-dim);border-color:var(--warning)}
.expressive [data-app-content]>div>section[data-domain]>div>a[href$="inventory-integrity"]{max-width:400px}

.professional header[data-band]{background:var(--bg-page);color:var(--band-reset-ink-strong);--ink-strong:var(--band-reset-ink-strong);--ink-muted:var(--band-reset-ink-muted);--ink-faint:var(--band-reset-ink-faint);--bg-card:var(--band-reset-bg-card);--stroke:var(--band-reset-stroke);--stroke-strong:var(--band-reset-stroke-strong);--brand-1:var(--band-reset-brand-1);--brand-dim:var(--band-reset-brand-dim);border-bottom:1px solid var(--stroke)}
.professional header[data-band]>div:first-child{display:none}.professional header[data-band]{justify-content:flex-end}
.professional aside a[aria-current="page"][data-domain],.professional aside a[aria-current="page"][data-domain]:hover{background:color-mix(in srgb,var(--band-reset-ink-on-brand) 8%,var(--bg-sidebar));color:var(--band-reset-ink-on-brand);border-color:transparent;border-left:2px solid var(--accent-loud)}
.professional [data-app-content]>div>div:first-child h1{font-family:var(--font-body);font-size:28px;font-weight:700;letter-spacing:-.025em}
.professional [data-app-content]>div>div:first-child span{background:transparent;padding:0;border-radius:0;color:var(--ink-muted)}
.professional [data-app-content]>div>section[data-domain]>h2{color:var(--ink-muted)}
.professional [data-app-content]>div>section[data-domain]>h2:after{background:var(--stroke)}
.professional [data-app-content]>div>section[data-domain]>div>a{border-top:1px solid var(--stroke-card)}
.professional [data-app-content]>div>section[data-domain]>div>a:hover{border-color:var(--brand-1)}
.professional [data-app-content]>div>section[data-domain]>div>a>div:nth-child(2){font-family:var(--font-body)}
.professional [data-app-content]>div>section[data-domain]>div>a>div:last-child{color:var(--brand-1)}
.professional [data-app-content]>div>section[data-domain]>div>a[href$="dead-stock"]{border-color:var(--warning)}
.balanced [data-app-content]>div>div:first-child{padding:var(--space-6);background:color-mix(in srgb,var(--accent-loud) 8%,var(--bg-card));border:1px solid color-mix(in srgb,var(--accent-loud) 24%,var(--stroke));border-left:4px solid var(--accent-loud);border-radius:var(--radius-lg)}
.balanced [data-app-content]>div>div:first-child h1{font-family:var(--font-display);font-size:32px;font-weight:700;font-variation-settings:"wdth" 105,"wght" 700;letter-spacing:-.025em}
.balanced [data-app-content]>div>div:first-child span{color:var(--accent-text)}
.balanced aside a[aria-current="page"][data-domain],.balanced aside a[aria-current="page"][data-domain]:hover{background:color-mix(in srgb,var(--accent-loud) 22%,var(--bg-sidebar));border-left:3px solid var(--accent-loud)}
.balanced [data-app-content]>div>section[data-domain]>h2{color:var(--accent-text);font-size:var(--fs-sm);font-weight:var(--fw-bold);letter-spacing:.08em}
.balanced [data-app-content]>div>section[data-domain]>h2:before{content:"";width:4px;height:16px;background:var(--accent-loud);border-radius:var(--radius-xs)}
.balanced [data-app-content]>div>section[data-domain]>div>a{box-shadow:var(--shadow-sm)}
.balanced [data-app-content]>div>section[data-domain]>div>a>div:last-child{color:var(--accent-text)}
@media(max-width:820px){.preview-note{padding:8px 12px;flex-wrap:wrap}.expressive [data-app-content]>div>section[data-domain]>h2{font-size:20px}}
`);
fs.writeFileSync(path.join(dir,'index.html'),'<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Manuva Reports comparison</title><link rel="stylesheet" href="/fonts.css"><link rel="stylesheet" href="/fixture.css"><link rel="stylesheet" href="/compare.css"></head><body style="--font-archivo:Archivo;--font-inter:Inter"><div id="root"></div><script src="/fixture.js"></script></body></html>');
createServer((req,res)=>{const u=new URL(req.url,'http://localhost');const p=u.pathname;let file=p.startsWith('/fonts/')?path.join(repo,'.next/static/media',path.basename(p)):p==='/logo'?path.join(repo,'public/manuva-logo.png'):path.join(dir,p==='/'?'index.html':path.basename(p));if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'application/javascript':file.endsWith('.png')?'image/png':file.endsWith('.woff2')?'font/woff2':'text/html');res.end(fs.readFileSync(file));}).listen(3218,'127.0.0.1',()=>console.log('Reports comparison preview ready on 3218'));
})();
