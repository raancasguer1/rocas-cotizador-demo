/* Generación local de .docx para el prototipo ficticio ROCAS. Sin dependencias externas. */
(function(root){
  'use strict';
  const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const CT='http://schemas.openxmlformats.org/package/2006/content-types';
  const REL='http://schemas.openxmlformats.org/package/2006/relationships';
  function esc(value){return String(value??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')}
  function run(text,style={}){
    const props=['<w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>'];
    if(style.bold)props.push('<w:b/>');
    if(style.color)props.push('<w:color w:val="'+style.color+'"/>');
    if(style.size)props.push('<w:sz w:val="'+style.size+'"/><w:szCs w:val="'+style.size+'"/>');
    const rpr='<w:rPr>'+props.join('')+'</w:rPr>';
    const value=String(text??'').replace(/\r\n?/g,'\n').split('\n').map((line,i)=>(i?'<w:br/>':'')+'<w:t xml:space="preserve">'+esc(line)+'</w:t>').join('');
    return '<w:r>'+rpr+value+'</w:r>';
  }
  function para(runs,opts={}){
    const ppr=[];
    if(opts.keepNext)ppr.push('<w:keepNext/>');
    ppr.push('<w:spacing w:after="'+(opts.after??100)+'" w:line="276" w:lineRule="auto"/>');
    if(opts.align)ppr.push('<w:jc w:val="'+opts.align+'"/>');
    return '<w:p><w:pPr>'+ppr.join('')+'</w:pPr>'+runs.join('')+'</w:p>';
  }
  function crc32(bytes){
    let c=0xffffffff;
    for(let i=0;i<bytes.length;i++){
      c^=bytes[i];
      for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);
    }
    return (c^0xffffffff)>>>0;
  }
  function zipStore(entries){
    const enc=new TextEncoder(),locals=[],centrals=[];let offset=0;
    const dosDate=33,dosTime=0;
    for(const entry of entries){
      const name=enc.encode(entry.name),data=enc.encode(entry.content),crc=crc32(data);
      const local=new Uint8Array(30+name.length+data.length),lv=new DataView(local.buffer);
      lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x0800,true);lv.setUint16(8,0,true);lv.setUint16(10,dosTime,true);lv.setUint16(12,dosDate,true);lv.setUint32(14,crc,true);lv.setUint32(18,data.length,true);lv.setUint32(22,data.length,true);lv.setUint16(26,name.length,true);lv.setUint16(28,0,true);
      local.set(name,30);local.set(data,30+name.length);locals.push(local);
      const central=new Uint8Array(46+name.length),cv=new DataView(central.buffer);
      cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x0800,true);cv.setUint16(10,0,true);cv.setUint16(12,dosTime,true);cv.setUint16(14,dosDate,true);cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,name.length,true);cv.setUint16(30,0,true);cv.setUint16(32,0,true);cv.setUint16(34,0,true);cv.setUint16(36,0,true);cv.setUint32(38,0,true);cv.setUint32(42,offset,true);central.set(name,46);centrals.push(central);
      offset+=local.length;
    }
    const centralSize=centrals.reduce((n,x)=>n+x.length,0),end=new Uint8Array(22),ev=new DataView(end.buffer);
    ev.setUint32(0,0x06054b50,true);ev.setUint16(4,0,true);ev.setUint16(6,0,true);ev.setUint16(8,entries.length,true);ev.setUint16(10,entries.length,true);ev.setUint32(12,centralSize,true);ev.setUint32(16,offset,true);ev.setUint16(20,0,true);
    const all=new Uint8Array(offset+centralSize+end.length);let at=0;
    for(const b of locals){all.set(b,at);at+=b.length}
    for(const b of centrals){all.set(b,at);at+=b.length}
    all.set(end,at);return all;
  }
  function buildDocx(model){
    const body=[];
    body.push(para([run('CONTRATO DE OBRA',{bold:true,size:34})],{align:'center',after:80}));
    body.push(para([run('BORRADOR · PENDIENTE DE REVISIÓN',{bold:true,color:'9B3F37',size:24})],{align:'center',after:120}));
    body.push(para([run('Borrador de prueba · revisar antes de cualquier uso.',{bold:true,color:'9B3F37'})],{align:'center',after:120}));
    body.push(para([run('Cotización vinculada: ',{bold:true}),run(String(model.quoteNumber||'POR COMPLETAR')+' · Revisión '+String(model.revision||'POR COMPLETAR'))]));
    body.push(para([run('Cliente en la cotización: ',{bold:true}),run(String(model.quoteClient||'POR COMPLETAR'))]));
    body.push(para([run('Proyecto: ',{bold:true}),run(String(model.project||'POR COMPLETAR'))]));
    body.push(para([run('Valor de mano de obra: ',{bold:true}),run(String(model.laborTotal||'POR COMPLETAR'))]));
    body.push(para([run('Generado: ',{bold:true}),run(String(model.generatedAt||''))],{after:180}));
    body.push(para([run('Referencia ficticia de solo lectura; no modifica la cotización de origen.')],{after:120}));
    for(const section of (model.sections||[])){
      body.push(para([run(section.title,{bold:true,size:26})],{keepNext:true,after:80}));
      for(const row of (section.rows||[]))body.push(para([run(row.label+': ',{bold:true}),run(row.value||'POR COMPLETAR')]));
      body.push(para([run('')],{after:80}));
    }
    body.push(para([run('AVISO: BORRADOR · NO FIRMAR',{bold:true,color:'9B3F37',size:24})],{align:'center',after:80}));
    body.push(para([run('La aceptación en la app no es firma electrónica, aprobación legal ni orden de obra. Los campos vacíos: POR COMPLETAR.')],{after:100}));
    const docXml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="'+W+'"><w:body>'+body.join('')+'<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>';
    const contentTypes='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="'+CT+'"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
    const rels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="'+REL+'"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
    return zipStore([{name:'[Content_Types].xml',content:contentTypes},{name:'_rels/.rels',content:rels},{name:'word/document.xml',content:docXml}]);
  }
  root.ROCASDOCX={buildDocx};
})(typeof window!=='undefined'?window:globalThis);
