import { IMAGE_MAX_BYTES, TEXT_MAX_BYTES } from '../content-hash.ts';

const TYPES:Record<string,{kind:'image'|'text';extensions:string[]}>={
 'image/png':{kind:'image',extensions:['.png']},'image/jpeg':{kind:'image',extensions:['.jpg','.jpeg']},
 'image/webp':{kind:'image',extensions:['.webp']},'image/gif':{kind:'image',extensions:['.gif']},
 'text/plain':{kind:'text',extensions:['.txt']},'text/markdown':{kind:'text',extensions:['.md','.markdown']},
};
function starts(bytes:Uint8Array,signature:number[],offset=0){return signature.every((value,index)=>bytes[offset+index]===value);}

export function validateContentUpload(fileName:string,declaredType:string,bytes:Uint8Array):{mediaType:string;size:number}{
 const mediaType=declaredType.split(';',1)[0].trim().toLowerCase();const rule=TYPES[mediaType];
 if(!rule)throw new Error('Choose a PNG, JPEG, WebP, GIF image or UTF-8 TXT/Markdown file.');
 if(bytes.byteLength===0)throw new Error('Empty files cannot be uploaded.');
 const limit=rule.kind==='image'?IMAGE_MAX_BYTES:TEXT_MAX_BYTES;if(bytes.byteLength>limit)throw new Error(`${rule.kind==='image'?'Image':'Text'} files must be ${rule.kind==='image'?'5 MiB':'256 KiB'} or smaller.`);
 const extension=fileName.toLowerCase().slice(fileName.lastIndexOf('.'));if(!rule.extensions.includes(extension))throw new Error('The file extension does not match its declared content type.');
 if(mediaType==='image/png'&&!(starts(bytes,[137,80,78,71,13,10,26,10])&&starts(bytes,[73,72,68,82],12)&&bytes.byteLength>=24))throw new Error('The file does not contain a valid PNG header.');
 if(mediaType==='image/jpeg'&&!(starts(bytes,[255,216,255])&&bytes.byteLength>=4&&starts(bytes,[255,217],bytes.byteLength-2)))throw new Error('The file does not contain a valid JPEG signature.');
 if(mediaType==='image/gif'&&!(bytes.byteLength>=14&&(starts(bytes,[71,73,70,56,55,97])||starts(bytes,[71,73,70,56,57,97]))))throw new Error('The file does not contain a valid GIF signature.');
 if(mediaType==='image/webp'&&!(bytes.byteLength>=16&&starts(bytes,[82,73,70,70])&&starts(bytes,[87,69,66,80],8)))throw new Error('The file does not contain a valid WebP signature.');
 if(rule.kind==='text'){
  if(bytes.includes(0))throw new Error('Text content cannot contain binary NUL bytes.');
  try{new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new Error('Text files must use valid UTF-8 encoding.');}
 }
 return{mediaType,size:bytes.byteLength};
}
