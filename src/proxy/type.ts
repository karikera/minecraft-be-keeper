import { BinStream } from "../util/binstream";
import { hex } from "../util/util";



export const OFFLINE_MESSAGE_DATA_ID = Buffer.from([0x00, 0xff, 0xff, 0x00, 0xfe, 0xfe, 0xfe, 0xfe, 0xfd, 0xfd, 0xfd, 0xfd, 0x12, 0x34, 0x56, 0x78]);

export interface Address
{
    version:number;
    address:number;
    port:number;
}

export class Type<T>
{
    constructor(
        public readonly reader:(s:BinStream)=>T, 
        public readonly writer:(s:BinStream, v:T)=>void)
    {
    }
}

export class Types<T extends Array<any>> extends Type<T>
{
    constructor(types:{[key in keyof T]: Type<T[key]>})
    {
        super(s=>{
            const out:any[] = [];
            for (const t of types)
            {
                out.push(t.reader(s));
            }
            return <T>out;
        }, (s,values)=>{
            for (const v of values)
            {
                v.writer(s, v);
            }
        });
    }
}

type GetValueFrom<K extends string, T extends {[key in K]:any}> = T extends {[key in K]:infer V} ? V : never;
type ConcatObjectTuple<T extends {[key:string]:any}[], KEYS extends string> = {[K in KEYS]: GetValueFrom<K, T[number]>};
type TupleToKeyValue<T extends [string, any][]> = {[K in keyof T]:T[K] extends any[] ? {[key in T[K][0]]:T[K][1]} : never};
type ArrayToObject<T extends [string, any][]> = ConcatObjectTuple<TupleToKeyValue<T>, T[number][0]>;

type TypeClassToType<T extends {[key:string]:any}> = {[K in keyof T]:T[K]['reader'] extends (s:BinStream)=>infer V ? V : never};
type UnpackObjectType<T extends [string, Type<any>][]> = TypeClassToType<ConcatObjectTuple<TupleToKeyValue<T>, T[number][0]>>;
type UnpackTupleType<T extends Type<any>[]> = {[key in keyof T]:T[key] extends Type<infer T> ? T : T[key]};

class ObjectType<T extends [string, Type<any>][]> extends Type<UnpackObjectType<T>>
{
    constructor(types:T)
    {
        type ObjT = UnpackObjectType<T>;
        super(s=>{
            const out:ObjT = {} as any;
            for (const [key, type] of types)
            {
                out[key] = type.reader(s);
            }
            return out;
        }, (s,values)=>{
            for (const [key, type] of types)
            {
                type.writer(s, values[key]);
            }
        });
    }
}

class TupleType<T extends Type<any>[]> extends Type<UnpackTupleType<T>>
{
    constructor(types:T)
    {
        type ArrayT = UnpackTupleType<T>;
        super(s=>{
            const out:ArrayT = [] as any;
            for (const type of types)
            {
                out.push(type.reader(s));
            }
            return out;
        }, (s,values)=>{
            
            let idx = 0;
            for (const type of types)
            {
                type.writer(s, values[idx++]);
            }
        });
    }
}

export class CompareType<OUT extends {}, KNAME extends string, KVALUE> extends Type<OUT>
{
    private readonly map = new Map<KVALUE, ObjectType<any>>();

    constructor(keyName: KNAME, keyType:Type<KVALUE>)
    {
        super(s=>{
            const key = keyType.reader(s);
            const objtype = this.map.get(key);
            if (objtype === undefined) throw Error('undefined key: '+key);
            const t = this.reader;
            type OUT = typeof t extends (s:BinStream)=>infer V ? V : never;
            const v = <any>objtype.reader(s);
            v[keyName] = key;
            return <OUT>v;
        }, (s,v)=>{
            const key:KVALUE = (<any>v)[keyName];
            keyType.writer(s, key);
            const objtype = this.map.get(key);
            if (objtype === undefined) throw Error('undefined key: '+key);
            objtype.writer(s, v);
        });
    }

    case<V extends KVALUE, K extends string, T extends [K, Type<any>][]>(key:V, ...entries:T):CompareType<OUT | (UnpackObjectType<T> & {[key in KNAME]: V}), KNAME, KVALUE>
    {
        const objt = new ObjectType<T>(entries);
        this.map.set(key, objt);
        return <CompareType<OUT | (UnpackObjectType<T> & {[key in KNAME]: V}), KNAME, KVALUE>>this;
    }
}

export namespace type 
{
    export const int = new Type(
        s=>s.readInt32(),
        (s, v)=>s.writeInt32(v));
    export const string = new Type(
        s=>s.readString(s.readUint32Var()),
        (s, v)=>{
            const buffer = Buffer.from(v, 'utf-8');
            s.writeUint32Var(buffer.length);
            s.writeBuffer(buffer);
        });
    export const buffer = new Type(
        s=>s.readBuffer(s.readUint32Var()),
        (s, v)=>{
            s.writeUint32Var(v.length);
            s.writeBuffer(v);
        });
            
    export const remaining = new Type(
        s=>s.remainedBuffer(),
        (s, v)=>s.writeBuffer(v));
        
    export const byte = new Type(
        s=>s.readUint8(),
        (s, v)=>s.writeUint8(v));
    export const word = new Type(
        s=>s.readUint16(),
        (s, v)=>s.writeUint16(v));
    export const short = new Type(
        s=>s.readInt16(),
        (s, v)=>s.writeInt16(v));
    export const lshort = new Type(
        s=>s.readInt16(true),
        (s, v)=>s.writeInt16(v, true));
    export const long = new Type(
        s=>s.readInt64(),
        (s, v)=>s.writeInt64(v));
    export const uint24le = new Type(
        s=>s.readUint24(true),
        (s, v)=>s.writeUint24(v, true));
    export const uintvar = new Type(
        s=>s.readUBigIntVar(),
        (s, v)=>s.writeUBigInt4Var(v)
    );

    export const boolean = new Type(
        s=>!!s.readUint8(),
        (s, v)=>s.writeUint8(+v));
    export const float = new Type(
        s=>s.readFloat32(),
        (s, v)=>s.writeFloat32(v));
    export const magic = new Type<void>(s=>{
        const buffer = s.readBuffer(OFFLINE_MESSAGE_DATA_ID.length)
        if (!buffer.equals(OFFLINE_MESSAGE_DATA_ID)) throw Error('Magic unmatched ' + hex(buffer));
    }, s=>{
        s.writeBuffer(OFFLINE_MESSAGE_DATA_ID);
    });

    export function object<K extends string, T extends [K, Type<any>][]>(...types:T)
    {
        return new ObjectType<T>(types);
    }
    
    export function compare<KNAME extends string, KVALUE>(keyName: KNAME, keyType:Type<KVALUE>)
    {
        return new CompareType<never, KNAME, KVALUE>(keyName, keyType);
    }
}

interface PacketParserEntry<ARGS extends any[], T extends Type<any>[]>
{
    type:TupleType<T>;
    on:(obj:UnpackTupleType<T>, s:BinStream, ...args:ARGS)=>void;
}

export class PacketParser<ARGS extends any[]>
{
    private readonly map = new Map<number, PacketParserEntry<any, any>|null>();

    constructor()
    {
    }

    delete(id:number):void
    {
        this.map.delete(id);
    }

    set<T extends Type<any>[]>(id:number, ...types:T):PacketParserEntry<ARGS, T>
    {
        const item = {type:new TupleType<T>(types), on:()=>{}};
        this.map.set(id, item);
        return item;
    }

    parseStream(packetId:number, s:BinStream, ...args:ARGS):boolean
    {
        const type = this.map.get(packetId);
        if (!type) return false;
        const data = type.type.reader(s);
        type.on(data, s, ...args);
        return true;
    }

    parse(msg:Buffer, ...args:ARGS):void
    {
        const packetId = msg[0];
        
        try
        {
            const type = this.map.get(packetId);
            if (!type)
            {
            }
            else
            {
                const s = new BinStream(msg);
                s.readUint8();
                const data = type.type.reader(s);
                type.on(data, s, ...args);
            }
        }
        catch (err)
        {
            console.error(err);
        }
    }
}

