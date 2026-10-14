export type IndexedLog={key:string;blockNumber:string;blockHash:string;transactionHash:string;logIndex:number;eventName:string;args:Record<string,string|number|boolean>};
type ActivityApiRecord={chainId:number;hubAddress:string;transactionHash:string;blockNumber:string;blockHash:string;logIndex:number;eventType:string;args:Record<string,string|number|boolean>};

/** Ask the server to persistently sync verified receipts, then read one bounded page from server storage. */
export async function syncHubEvents(_fromBlock?:bigint):Promise<IndexedLog[]>{
 const sync=await fetch('/api/activity/sync',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store'});
 const syncBody=await sync.json() as {error?:string};if(!sync.ok)throw new Error(syncBody.error||'Persistent activity synchronization failed.');
 const page=await fetch('/api/activity?limit=100&offset=0',{cache:'no-store'});const body=await page.json() as {events?:ActivityApiRecord[];error?:string};
 if(!page.ok||!body.events)throw new Error(body.error||'Persistent activity history could not be loaded.');
 return body.events.map(event=>({key:`${event.chainId}:${event.hubAddress.toLowerCase()}:${event.transactionHash.toLowerCase()}:${event.logIndex}`,blockNumber:event.blockNumber,blockHash:event.blockHash,transactionHash:event.transactionHash,logIndex:event.logIndex,eventName:event.eventType,args:event.args}));
}
