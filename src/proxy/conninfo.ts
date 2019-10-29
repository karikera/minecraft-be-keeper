import { WatchJson } from "../util/watchjson";

interface ConnectionInfo
{
    packetsPerSecMax:number;
    packetsPerSec?:number[];
}

export const conninfo = new WatchJson<{[key:string]:(ConnectionInfo)}>('./conninfo.json', {});
conninfo.load().then(data=>{
    for (const p in data)
    {
        delete data[p].packetsPerSec;
    }
});

