import { Event } from "./event";
import fs = require('fs');

export class CommandReader
{
    private index = 0;

    constructor(private readonly line:string)
    {
    }

    get():string
    {
        const next =  this.line.indexOf(' ', this.index);
        if (next === -1)
        {
            const out = this.line;
            this.index = this.line.length;
            return out;
        }
        const out = this.line.substring(this.index, next);
        this.index = next + 1;
        return out;
    }

    remaining():string
    {
        return this.line.substr(this.index);
    }
}

export function getLines(lines:string):string[]
{
    return lines.split('\n').map(toLF);
}

export function toLF(line:string):string
{
    if (line.endsWith('\r')) return line.substr(0, line.length-1);
    return line;
}

export function makeRegExp(regexp:string):RegExp
{
    if (regexp.startsWith('/'))
    {
        const endidx = regexp.lastIndexOf('/');
        return new RegExp(regexp.substring(1, endidx), regexp.substr(endidx+1));
    }
    else
    {
        return new RegExp(regexp);
    }
}

export function replaceRegExpParameters(target:string, params:string[]):string
{
    return target.replace(/\$([0-9])/g, (match,v)=>v === '$' ? '$' : (params[v] || v || ''));
}

export function asBool(value:string):boolean
{
    if (value === '1' || value === 'true' || value === 't')
    {
        return true;
    }
    else if (value === '0' || value === 'false' || value === 'f')
    {
        return false
    }
    throw Error('accept true or false: '+value);
}

export function promTimeout(ms:number, canceler:Event):Promise<void>
{
    return new Promise((resolve, reject)=>{
        setTimeout(resolve, ms);
        canceler.on(reject);
    });
}

export function hex(buffer:Buffer, seperator:string = ' '):string
{
    let out = '';
    const len = buffer.length;
    for (let i=0;i<len;i++)
    {
        const chr = buffer[i];
        out += (chr >> 4).toString(16);
        out += (chr & 0xf).toString(16);
        out += seperator;
    }
    return out.substr(0, out.length-1);
}
