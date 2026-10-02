import {devHarness} from './support/real-session.mjs';import {writeFile} from 'node:fs/promises';
import sharp from 'sharp';
const h=await devHarness();let admin,member,inactive=false;const evidence=[];
let product,image;
try{
 admin=await h.login(process.env.SIGCA_TEST_ADMIN_EMAIL);member=await h.login(process.env.SIGCA_TEST_MEMBER_EMAIL);
 const created=await admin.client.from('products').insert({sku:'VERIFY-3E-'+Date.now(),name:'Verificación Storage 3E',base_price:'1.00'}).select('id').single();if(created.error)throw Error('Fixture producto rechazada');product=created.data.id;
 const path=`products/${product}/${crypto.randomUUID()}.webp`;const bytes=await sharp({create:{width:20,height:20,channels:3,background:'#DD0675'}}).webp().toBuffer();
 const upload=await h.service.storage.from('catalog-images').upload(path,bytes,{contentType:'image/webp',upsert:false,cacheControl:'0'});if(upload.error)throw Error('Carga fixture rechazada');
 const registered=await h.service.rpc('register_catalog_image',{actor:admin.id,product,object_path:path,caption_text:'Verificación 3E; conservar historial',is_logo:false});if(registered.error)throw Error('Registro fixture rechazado');image=registered.data;
 const refs=[];for(const [table,bucket] of [['order_files','order-references'],['product_images','catalog-images']]){const r=await member.client.from(table).select('id,path').eq('is_active',true).limit(1);if(r.error)throw Error('Lectura fallida '+table);if(!r.data.length){evidence.push({bucket,skipped:'Sin imagen activa existente'});continue;}refs.push({...r.data[0],bucket});}
 for(const r of refs){const result=await member.client.storage.from(r.bucket).download(r.path);evidence.push({bucket:r.bucket,activeDownload:!result.error});}
 const off=await admin.client.from('profiles').update({status:'inactive'}).eq('id',member.id);if(off.error)throw Error('No se pudo inactivar');inactive=true;
 for(const r of refs){const cached=await member.client.storage.from(r.bucket).download(r.path);const fresh=await member.client.storage.from(r.bucket).download(r.path,{cacheNonce:crypto.randomUUID()},{cache:'no-store'});evidence.push({bucket:r.bucket,inactiveRepeatedDownload:!cached.error,inactiveFreshDownload:!fresh.error});}
}finally{if(inactive){const r=await admin.client.from('profiles').update({status:'active'}).eq('id',member.id);if(r.error)throw Error('No se pudo restaurar perfil');}if(image)await admin.client.from('product_images').update({is_active:false,is_main:false}).eq('id',image);if(product)await admin.client.from('products').update({is_active:false}).eq('id',product);await writeFile('test-results/phase3e-storage-probe.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));await h.close();}
