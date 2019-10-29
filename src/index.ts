require('source-map-support').install();

import { spawnEvents, spawnMinecraftServer, terminateMinecraftServer, closeMinecraftServer } from "./spawn/mcspawn";
import { bindProxy, unbindProxy, proxyEvents } from "./proxy/mcproxy";
import { onCloseProcess } from "./util/closerequest";
import { WatchJson } from "./util/watchjson";

// require('./web');

interface IpList
{
    [key:string]:string[];
}

const iplist = new WatchJson<IpList>('./iplist.json', {});

(async()=>{

    await iplist.load();

    spawnEvents.onConnected = (date, id, xuid)=>{
        console.log(`${date.toLocaleTimeString()} 入 ${id} ${xuid}`);
    };
    spawnEvents.onDisconnected = (date, id, xuid)=>{
        console.log(`${date.toLocaleTimeString()} 出 ${id} ${xuid}`);
    };
    proxyEvents.login = (ip, name, xuid)=>{
        console.log(`LOGIN> ${ip}, ${name || '?'}, ${xuid || '?'}`);
        if (name)
        {
            let list = iplist.data[ip];
            if (!list) iplist.data[ip] = [name];
            else
            {
                const idx = list.indexOf(name);
                if (idx === -1) list.push(name);
            }
            iplist.save();
        }
    };
    
    if (process.argv[2] !== 'nospawn')
    {
        spawnMinecraftServer();
    }
    
    onCloseProcess.on(()=>{
        unbindProxy();
        iplist.dispose();
        closeMinecraftServer();
    });
    
    process.on('exit', ()=>{
        terminateMinecraftServer();
        process.exit();
    });
    
    bindProxy();
    
})();
