
import dgram = require('dgram');
import { BinStream } from '../util/binstream';
import { MessageIdentifiers, RELIABLITY_MAP } from './raknet_const';
import { PacketParser, type } from './type';
import { raknetType } from './raknet_type';
import { banlist } from './banlist';
import { conninfo } from './conninfo';

const KEEP_PORT_TIMEOUT = 10000;

const FROM_PORT = 19132;
const TO_PORT = 19134;
const TO_ADDRESS = '127.0.0.1';
let newClient:((conn:Connection)=>RaknetClient)|null = null;

const BITFLAG_VALID = 0x80;
const BITFLAG_ACK = 0x40;
const BITFLAG_NAK = 0x20; // hasBAndAS for ACKs
const SPLIT_FLAG = 0x10;
const BITFLAG_PACKET_PAIR = 0x10;
const BITFLAG_CONTINUOUS_SEND = 0x08;
const BITFLAG_NEEDS_B_AND_AS = 0x04;

let server:dgram.Socket|null = null;

interface Connection
{
    name:string;
    address:string;
    port:number;
}

class Fragment
{
    private readonly buffers:(Buffer|undefined)[] = [];
    private filled:number = 0;

    constructor(public readonly size:number)
    {
    }

    set(index:number, buffer:Buffer):Buffer|undefined
    {
        const already = this.buffers[index];
        if (already) throw Error(`Already compound filled: ${index}`);
        this.filled++;
        this.buffers[index] = buffer;
        return already;
    }

    finish():Buffer
    {
        return Buffer.concat(<Buffer[]>this.buffers);
    }
    
    isEnd():boolean
    {
        return this.filled === this.size;
    }
}

class Fragments
{
    private readonly fragments = new Map<number, Fragment>();

    put(compoundSize:number, compoundId:number, fragmentIndex:number, buffer:Buffer):Buffer|undefined
    {
        let frag = this.fragments.get(compoundId);
        if (!frag)
        {
            frag = new Fragment(compoundSize);
            this.fragments.set(compoundId, frag);
        }
        if (frag.size !== compoundSize)
        {
            throw Error(`Compound size mismatch ${frag.size}!=${compoundSize}`);
        }
        frag.set(fragmentIndex, buffer);
        if (frag.isEnd())
        {
            const buffer = frag.finish();
            this.fragments.delete(compoundId);
            return buffer;
        }
    }
}

export enum ClientState
{
	CONNECTING = 0,
	CONNECTED = 1,
	DISCONNECTING = 2,
    DISCONNECTED = 3,
    DIRECT = 4,
    CLOSED = 5,
}

export const raknetPackets = {
    encapsulated:{
        send:new PacketParser<[RaknetPort]>(),
        recv:new PacketParser<[RaknetPort]>(),
    },
    unconnected:{
        recv: new PacketParser<[RaknetPort]>(),
        send: new PacketParser<[RaknetPort]>(),
    },
    user: {
        recv: new PacketParser<[RaknetPort]>(),
        send: new PacketParser<[RaknetPort]>(),
    }
};

class EncapsulatedPacket
{
    needACK = false;
    messageIndex:number|null = null;
	identifierACK:number|null = null;
}

export abstract class RaknetPort
{
    private readonly fragments = new Fragments;
    // private readonly recoveryQueue = new Map<number, EncapsulatedPacket[]>();
    // private readonly needACK = new Map<number, Map<number, number>>();

    constructor(public readonly client:RaknetClient)
    {
    }

    private _parseEncapsulated(s:BinStream):void
    {
        const id = s.readUint8();
        if (id < MessageIdentifiers.USER_PACKET_ENUM)
        {
            // console.log(`${this.direction} Rx${id.toString(16)} ${MessageIdentifiers[id] || '?'} size=${s.remaining()}`);
            this.getEncapsulatedParser().parseStream(id, s, this);
        }
        else
        {
            this.getUserParser().parseStream(id, s, this);
        }
    }

    private _unknownPacket(packetId:number, s:BinStream):void
    {
        this.client.onError(this, packetId, `unknown ${s.remaining()}bytes`);
    }

    parsePacket(msg:Buffer):boolean
    {
        if (this.client.state !== ClientState.DIRECT)
        {
            const s = new BinStream(msg);
    
            const parseAck = ()=>{
                const count = s.readUint16();
                const packets:number[] = [];
    
                const RECORD_TYPE_RANGE = 0;
    
                for(let i = 0; i < count && !s.eof() && packets.length < 4096; ++i){
                    if(s.readUint8() === RECORD_TYPE_RANGE)
                    {
                        const start = s.readUint24(true);
                        let end = s.readUint24(true);
                        if((end - start) > 512){
                            end = start + 512;
                        }
                        for(let c = start; c <= end; ++c)
                        {
                            packets.push(c);
                        }
                    }
                    else
                    {
                        packets.push(s.readUint24(true));
                    }
                }
                return packets;
            };
    
            // const res = raknet.parse(msg);
            const packetId = s.readUint8();
            try
            {
                if (this.client.state === ClientState.CONNECTED)
                {
                    if (packetId & BITFLAG_VALID)
                    {
                        if (packetId & BITFLAG_ACK)
                        {
                            // console.log('ACK');
                            // for (const seq of parseAck())
                            // {
                            //     const packets = this.recoveryQueue.get(seq);
                            //     if(packets)
                            //     {
                            //         for (const pk of packets)
                            //         {
                            //             if((pk instanceof EncapsulatedPacket) && 
                            //                 pk.needACK && pk.messageIndex !== null)
                            //             {
                            //                 this.needACK.get(pk.identifierACK!)!.delete(pk.messageIndex);
                            //             }
                            //         }
                            //         this.recoveryQueue.delete(seq);
                            //     }
                            // }
                        }
                        else if (packetId & BITFLAG_NAK)
                        {
                            // console.log('NAK');
                            // parseAck();
                        }
                        else
                        {
                            // console.log('DGRAM');
                            const frameSetIndex = s.readUint24(true);
                            const flags = s.readUint8();
                            const reliability = (flags >> 5);
                            const flagsInfo = RELIABLITY_MAP[reliability];
                            const fragmented = (flags & SPLIT_FLAG) !== 0;
                            const lengthInBits = s.readInt16();
                            const lengthInBytes = (lengthInBits+7)>>3;
                            if (flagsInfo.reliable)
                            {
                                const reliableFrameIndex = s.readUint24(true);
                            }
                            if (flagsInfo.sequenced)
                            {
                                const sequencedFrameIndex = s.readUint24(true);
                            }
                            if (flagsInfo.ordered)
                            {
                                const orderFrameIndex = s.readUint24(true);
                                const orderChannel = s.readUint8();
                            }
            
                            let out:Buffer|undefined;
                            if (fragmented)
                            {
                                const compoundSize = s.readInt32();
                                const compoundId = s.readInt16();
                                const fragmentIndex = s.readInt32();
                                const buffer = s.readBuffer(lengthInBytes);
                                out = this.fragments.put(compoundSize, compoundId, fragmentIndex, buffer);
                            }
                            else
                            {
                                out = s.readBuffer(lengthInBytes);
                            }
                            // const remained = s.remaining();
                            // if (remained)
                            // {
                            //     if (remained === 8 && s.peekBuffer(8).every(v=>v === 0))
                            //     {
                            //     }
                            //     else
                            //     {
                            //         this.client.onError(this, packetId, `remained ${remained}bytes`);
                            //         console.log(`${s.readHex(16)}`);
                            //     }
                            // }
                            
                            if (out) 
                            {
                                s.resetBuffer(out);
                                this._parseEncapsulated(s);
                            }
                        }
                    }
                    else
                    {
                        console.error('UNCONNECTED PACKET');
                    }
                }
                else
                {
                    if (!this.getUnconnectedParser().parseStream(packetId, s, this))
                    {
                        // this._unknownPacket(packetId, s);
                    }
                }
            }
            catch(err)
            {
                this.client.onError(this, packetId, err.message);
            }
        }
        
        this.send(msg);
        return false;
    }

    abstract get direction():string;
    abstract getEncapsulatedParser():PacketParser<[RaknetPort]>;
    abstract getUnconnectedParser():PacketParser<[RaknetPort]>;
    abstract getUserParser():PacketParser<[RaknetPort]>;
    abstract send(buf:Buffer):void;
    
}

export class RaknetSendPort extends RaknetPort
{
    getEncapsulatedParser():PacketParser<[RaknetPort]>
    {
        return raknetPackets.encapsulated.send;
    }

    getUnconnectedParser():PacketParser<[RaknetPort]>
    {
        return raknetPackets.unconnected.send;
    }
    
    getUserParser():PacketParser<[RaknetPort]>
    {
        return raknetPackets.user.send;
    }

    get direction():string
    {
        return 'SEND';
    }

    send(msg:Buffer):void
    {
        server!.send(msg, this.client.port, this.client.address, err=>{
            if (err) console.error(err);
        });
    }
}

export class RaknetReceivePort extends RaknetPort
{
    getEncapsulatedParser():PacketParser<[RaknetPort]>
    {
        return raknetPackets.encapsulated.recv;
    }

    getUnconnectedParser():PacketParser<[RaknetPort]>
    {
        return raknetPackets.unconnected.recv;
    }

    getUserParser():PacketParser<[RaknetPort]>
    {
        return raknetPackets.user.recv;
    }

    get direction():string
    {
        return 'RECV';
    }

    send(msg:Buffer):void
    {
        this.client.socket.send(msg, TO_PORT, TO_ADDRESS, err=>{
            if (err) console.error(err);
        });
    }
}

const clients:(RaknetClient|undefined)[] = [];

export abstract class RaknetClient
{
    private static readonly empties:number[] = [];
    private static readonly idmap = new Map<string, RaknetClient>();
    
    public readonly name:string;
    public readonly id:number;
    public readonly address:string;
    public readonly port:number;
    state:ClientState = ClientState.DISCONNECTED;
    
    public readonly socket:dgram.Socket = dgram.createSocket('udp4');
    private readonly sendobj = new RaknetSendPort(this);
    private readonly recvobj = new RaknetReceivePort(this);
    private readonly messageListener:(msg:Buffer, remote:dgram.RemoteInfo)=>void;
    private aliveTimeout:NodeJS.Timeout|null = null;
    
    constructor(conn:Connection)
    {
        this.name = conn.name;
        this.address = conn.address;
        this.port = conn.port;

        if (RaknetClient.empties.length !== 0)
        {
            this.id = RaknetClient.empties.pop()!;
        }
        else
        {
            this.id = clients.length;
        }
        clients[this.id] = this;
        RaknetClient.idmap.set(this.name, this);

        const close = ()=>{
            this.close();
        };
        this.aliveTimeout = setTimeout(close, KEEP_PORT_TIMEOUT);

        this.messageListener = (msg:Buffer, remote:dgram.RemoteInfo)=>{
            this.sendobj.parsePacket(msg);
            if (this.aliveTimeout) clearTimeout(this.aliveTimeout);
            this.aliveTimeout = setTimeout(close, KEEP_PORT_TIMEOUT);
        };
        this.socket.on('message', this.messageListener);
    }

    receive(msg:Buffer):void
    {
        this.recvobj.parsePacket(msg);
    }

    close():void
    {
        if (this.state === ClientState.CLOSED) return;
        this.state = ClientState.CLOSED;
        if (this.aliveTimeout)
        {
            clearTimeout(this.aliveTimeout);
            this.aliveTimeout = null;
        }
        clients[this.id] = undefined;
        RaknetClient.empties.push(this.id);
        RaknetClient.idmap.delete(this.name);
        this.socket.removeListener('message', this.messageListener);
        this.socket.close();
        this.onDisconnected();
        const data = conninfo.data[this.address];
        if (data)
        {
            if (data.packetsPerSecMax < 10)
            {
                delete conninfo.data[this.address];
            }
            else
            {
                delete data.packetsPerSec;
            }
        }
    }

    abstract onConnected():void;
    abstract onDisconnected():void;
    abstract onError(direction:RaknetPort, id:number, message:string):void;

    static getInstance(conn:Connection, newClient:(conn:Connection)=>RaknetClient):RaknetClient
    {
        let client = RaknetClient.idmap.get(conn.name);
        if (client) return client;
        client = newClient(conn);
        client.onConnected();
        return client;
    }
}

function onServerMessage(msg:Buffer, remote:dgram.RemoteInfo)
{
    let info = conninfo.data[remote.address];
    if (!info) info = conninfo.data[remote.address] = {packetsPerSec:[0], packetsPerSecMax:0};
    else if (!info.packetsPerSec) info.packetsPerSec = [0];
    info.packetsPerSec![0] ++;
    if (banlist.data[remote.address]) return;
    const conn:Connection = {
        name:remote.address+':'+remote.port,
        address:remote.address,
        port:remote.port,
    };
    const client = RaknetClient.getInstance(conn, newClient!);
    client.receive(msg);
}

conninfo.save();
conninfo.onSaveAfter.on((data)=>{
    if (!server) return;
    for (const ip in data)
    {
        const d = data[ip];
        if (!d.packetsPerSec) continue;
        if (d.packetsPerSec[0] > d.packetsPerSecMax)
        {
            d.packetsPerSecMax = d.packetsPerSec[0];
            if (d.packetsPerSecMax > 600)
            {
                banlist.data[ip] = true;
                banlist.save();
                return;
            }
        }
        d.packetsPerSec.unshift(0);
        d.packetsPerSec.length = 5;
    }
    conninfo.save();
});

export function bindRaknet(opts:{newClient:(conn:Connection)=>RaknetClient}):void
{
    if (server) return;
    server = dgram.createSocket('udp4');
    newClient = opts.newClient;
    server.on('message', onServerMessage);
    server.bind(FROM_PORT);
}

export function unbindRaknet():void
{
    if (!server) return;
    server.removeListener('message', onServerMessage);
    server.close();
    newClient = null;
    server = null;
    for (const client of clients)
    {
        if (client) client.close();
    }
    clients.length = 0;
}

raknetPackets.encapsulated.recv.set(MessageIdentifiers.CONNECTION_REQUEST, 
    type.long,type.long,type.boolean,
).on = ([clientId, sendPingTime, useSecurity], client)=>{
    // console.log('clientId:'+clientId);
    // console.log('sendPingTime:'+sendPingTime);
    // console.log('useSecurity:'+useSecurity);
    // $dataPacket = new NewIncomingConnection($packet->buffer);
    // $dataPacket->decode();

    // if($dataPacket->address->port === this.sessionManager->getPort() or !this.sessionManager->portChecking)
    // {
    //     this.state = self::STATE_CONNECTED; //FINALLY!
    //     this.isTemporal = false;
    //     this.sessionManager->openSession($this);

    //     //this.handlePong($dataPacket->sendPingTime, $dataPacket->sendPongTime); //can't use this due to system-address count issues in MCPE >.<
    //     this.sendPing();
    // }
};
raknetPackets.encapsulated.recv.set(MessageIdentifiers.DISCONNECTION_NOTIFICATION).on = ([], s, port)=>{
};
raknetPackets.encapsulated.recv.set(MessageIdentifiers.NEW_INCOMING_CONNECTION, 
    raknetType.address,
).on = ([address], s, port)=>{
    // console.log(address.address+':'+address.port);
    // //TODO: HACK!
    // $stopOffset = strlen($this->buffer) - 16; //buffer length - sizeof(sendPingTime) - sizeof(sendPongTime)
    // $dummy = new InternetAddress("0.0.0.0", 0, 4);
    // for($i = 0; $i < RakLib::$SYSTEM_ADDRESS_COUNT; ++$i){
    //     if($this->offset >= $stopOffset){
    //         $this->systemAddresses[$i] = clone $dummy;
    //     }else{
    //         $this->systemAddresses[$i] = $this->getAddress();
    //     }
    // }

    // $this->sendPingTime = $this->getLong();
    // $this->sendPongTime = $this->getLong();
};
raknetPackets.encapsulated.recv.set(MessageIdentifiers.CONNECTED_PING, 
    type.long,
).on = ([sendPingTime], s, port)=>{
    // $pk = new ConnectedPong;
    // $pk->sendPingTime = $dataPacket->sendPingTime;
    // $pk->sendPongTime = this.sessionManager->getRakNetTimeMS();
    // this.queueConnectedPacket($pk, PacketReliability::UNRELIABLE, 0);
};
raknetPackets.encapsulated.recv.set(MessageIdentifiers.CONNECTED_PONG, 
    type.long, type.long
).on = ([sendPingTime, sendPongTime], s, port)=>{
    // this.handlePong($dataPacket->sendPingTime, $dataPacket->sendPongTime);
};

raknetPackets.unconnected.recv.set(MessageIdentifiers.UNCONNECTED_PING,
    type.long, type.magic, type.long
).on = ([sendPingTime, magic, clientId], s, port)=>{
    // console.log(`[${client.direction}:PING] ${sendPingTime} ${clientId}`);
};
raknetPackets.unconnected.recv.set(MessageIdentifiers.UNCONNECTED_PING_OPEN_CONNECTIONS,
).on = ([], s, port)=>{
    // console.log(`[${client.direction}:PING_OPEN_CONNECTIONS]`);
};
raknetPackets.unconnected.recv.set(MessageIdentifiers.OPEN_CONNECTION_REQUEST_1,
    type.magic, type.byte, type.remaining
).on = ([magic,protocol, mtu], s, port)=>{
    // console.log(`[${client.direction}:OPEN_CONNECTION_REQUEST_1] ${protocol}`);
};
raknetPackets.unconnected.recv.set(MessageIdentifiers.OPEN_CONNECTION_REQUEST_2,
    type.magic, raknetType.address, type.short, type.long
).on = ([magic, address, mtuSize, clientId], s, port)=>{
    // console.log(`[${client.direction}:OPEN_CONNECTION_REQUEST_2] ${address.address}:${address.port} ${mtuSize} ${clientId}`);
};

raknetPackets.unconnected.send.set(MessageIdentifiers.UNCONNECTED_PONG, 
    type.long, type.long, type.magic, type.string
).on = ([sendPingTime, serverId, magic, serverName], s, port)=>{
    // console.log(`[${client.direction}:PONG] ${sendPingTime} ${serverId} ${serverName}`);
};
raknetPackets.unconnected.send.set(MessageIdentifiers.OPEN_CONNECTION_REPLY_1,
    type.magic, type.long, type.boolean, type.short
).on = ([magic, serverId, serverSecurity, mtuSize], s, port)=>{
    // console.log(`[${client.direction}:OPEN_CONNECTION_REPLY_1] ${serverId} ${serverSecurity} ${mtuSize}`);
};
raknetPackets.unconnected.send.set(MessageIdentifiers.OPEN_CONNECTION_REPLY_2,
    type.magic, type.long, raknetType.address, type.short, type.boolean
).on = ([magic, serverId, address, mtuSize, serverSecurity], s, port)=>{
    // console.log(`[${port.direction}:OPEN_CONNECTION_REPLY_2] ${serverId} ${address.address}:${address.port} ${mtuSize} ${serverSecurity}`);

    port.client.state = ClientState.CONNECTED;
};