/** Isolated fixture boundaries; the page return JSX and child components stay real. */
export function catalogPreviewSource(screen, source) {
  const start = source.indexOf('  return (\n    <div className={styles.page}>');
  if (start < 0) throw new Error(`${screen} render boundary missing`);
  const body = source.slice(start)
    .replace('        band\n', "        band={new URLSearchParams(location.search).get('variant')==='implemented'}\n")
    .replace('<div className={styles.table}>', '<div className={styles.table} data-preview-table="">')
    .replace('<div className={styles.tableCard}>', '<div className={styles.tableCard} data-preview-table="">');

  if (screen === 'products') return `
import {Fragment} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import styles from './products.module.css';
import PageHeader from '../_ui/page-header';
import EmptyState from '../_ui/empty-state';
import ProductFilters from './product-filters';
import SortableHeader from './sortable-header';
import ProductsPagination from './products-pagination';
import RetailItemDialog from './retail-item-dialog';
export default function ProductsPreview() {
 const names=['Adjustable machine foot','Aluminium enclosure','Cable support bracket','Conveyor guide assembly','Control panel mounting plate','Guard hinge kit','Sensor mounting bracket','Stainless steel roller'];
 const pagedRows=names.map((title,i)=>({id:'preview-product-'+i,title,image_url:null,status:i===5?'draft':'active',variantCount:[3,2,4,2,1,3,2,4][i],sellPrice:[45,180,24,320,85,65,32,145][i],matGpPct:[.48,.36,.54,.42,.31,null,.52,.38][i],actualGpPct:[.31,.24,.39,.28,.18,null,.36,.25][i],groupKey:'none'}));
 const products=pagedRows,filteredProducts=products,totalFiltered=products.length,canCreateRetailItem=true,retailSuppliers=[],productsError=null,groupBy='none',safePage=1,PAGE_SIZE=25;
 const syncStatus=null,syncProducts=0,syncOrders=0,syncError='';
 const facets={productTypes:['Assemblies','Hardware','Sheet metal'],categories:['Industrial equipment','Machine parts'],tags:['Manufactured','Stock item'],collections:[]};
 const formatCurrency=n=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:0}).format(n);
 const gpClassFor=n=>n==null?'':n>=.3?styles.gpGood:n>=.1?styles.gpWarn:styles.gpBad;
${body}`;

  return `
import Link from 'next/link';
import styles from './components.module.css';
import ComponentCreateForm from './component-create-form';
import ComponentTable from './component-table';
import FilterRail,{ActiveFilterChips} from './filter-rail';
import {createComponent} from './actions';
import PageHeader from '../_ui/page-header';
import EmptyState from '../_ui/empty-state';
import SearchInput from '../_ui/search-input';
export default function ComponentsPreview() {
 const samples=[
 ['Aluminium angle 25 × 25','AL-2525','Raw materials',120,100,30,4.8,'Cut to required length'],
 ['Aluminium sheet 3mm','AL-S3','Raw materials',18,12,5,89,'1200 × 2400mm sheet'],
 ['Bearing 6204-2RS','BR-6204','Bearings',48,42,12,8.5,'Sealed deep-groove bearing'],
 ['Cable gland M20','CG-M20','Electrical',75,60,20,2.4,'IP68 nylon cable gland'],
 ['Cap screw M6 × 20','CS-M620','Fasteners',240,180,100,.35,'Socket head, zinc plated'],
 ['Cap screw M8 × 30','CS-M830','Fasteners',28,18,25,.65,'Socket head, zinc plated'],
 ['Dowel pin 6 × 20','DP-0620','Fasteners',96,80,30,.42,'Hardened steel locating pin'],
 ['Limit switch roller arm','LS-RA','Electrical',5,0,4,28,'Normally closed safety circuit'],
 ['Stainless steel tube 25mm','SS-T25','Raw materials',36,30,10,12.6,'304 stainless steel'],
 ['Washer M8 stainless','WS-M8','Fasteners',320,300,100,.12,'Flat washer, stainless steel']
 ];
 const filtered=samples.map(([name,sku,groupName,onHand,available,reorder_point,costPerUnit,description],i)=>({id:'preview-component-'+i,name,sku,groupName,onHand,available,reorder_point,costPerUnit,description,status:available<=0?'critical':available<reorder_point?'low':'ok'}));
 const allComponents=filtered,role='admin',error=null,q='',filtersActive=false,sortCol='name',sortDir='asc',baseParams=new URLSearchParams(),chips=[];
 const groupOptions=['Raw materials','Fasteners','Bearings','Electrical'].map(label=>({key:label,label,count:filtered.filter(c=>c.groupName===label).length}));
 const supplierOptions=[{key:'pac-hardware',label:'Pac Hardware Supply',count:5},{key:'pac-metals',label:'Pac Metals Supply',count:3},{key:'pac-electrical',label:'Pac Electrical Supply',count:2}];
 const statusOptions=[{key:'ok',label:'OK',count:8},{key:'low',label:'Low',count:1},{key:'critical',label:'Critical',count:1}];
 const selected={statuses:[],groups:[],suppliers:[]},bounds={min:.12,max:89},filters={costMin:null,costMax:null};
 const lookups={suppliers:supplierOptions.map(o=>({id:o.key,name:o.label})),locations:[{id:'preview-main',name:'Main warehouse'}],groups:groupOptions.map(o=>({id:o.key,name:o.label}))};
${body}`;
}
