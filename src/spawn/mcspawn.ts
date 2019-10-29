import { Spawn, StdInListener } from "krspawn";
import { Match } from "./match";
import { onCloseProcess } from "../util/closerequest";

let server:Spawn|null = null;

interface TerminalEvents
{
    onConnected?:(date:Date, id:string, xuid:string)=>void;
    onDisconnected?:(date:Date, id:string, xuid:string)=>void;
}

export const spawnEvents:TerminalEvents = {};

new Match(/^ Player (connected|disconnected): ([a-zA-Z0-9 ]+), xuid: ([0-9]+)$/, (date, matched)=>{
    const [line, behavior, id, xuid] = matched;

    switch (behavior)
    {
    case 'connected':
        if (spawnEvents.onConnected) spawnEvents.onConnected(date, id, xuid);
        break;
    case 'disconnected':
        if (spawnEvents.onDisconnected) spawnEvents.onDisconnected(date, id, xuid);
        break;
    default:
        console.log(line);
        break;
    }
}).regist();

function newMinecraftServer():Spawn
{
    const runargs = process.argv.slice(2);
    let runexec = './bedrock_server';
    if (runargs.length !== 0)
    {
        runexec = runargs.shift()!;
    }
    server = new Spawn(runexec, runargs);
        
    server.on('close', newMinecraftServer);
    server.on('stdout', message=>{
        Match.process(message);
    });
    return server;
}

const stdin = new StdInListener(line=>{
    if (!server) return;
    switch (line)
    {
    case 'restart':
        server.stdin('stop');
        break;
    case 'stop':
        onCloseProcess.fire();
        break;
    default:
        if (line.startsWith('!'))
        {
            if (!server) return;
            server.stdin(line.substr(1));
        }
        break;
    }
});

export function spawnMinecraftServer():void
{
    if (server) return;
    newMinecraftServer();
}

export function closeMinecraftServer():void
{
    if (!server) return;
    server.removeListener('close', newMinecraftServer);
    server.on('close', ()=>{
        server = null;
        stdin.remove();
    });
    server.stdin('stop');
}

export function terminateMinecraftServer():void
{
    if (!server) return;
    server.kill();
}

export async function command(cmd:string, capture:RegExp):Promise<RegExpExecArray>
{
    return new Promise(resolve=>{
        if (!server) throw Error('No Server');
        server.stdin(cmd);
        new Match(capture, (date, array, match)=>{
            match.remove();
            resolve(array);
        }).regist();
    });
}
