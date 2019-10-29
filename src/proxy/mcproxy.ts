
import zlib = require('zlib');
import atob = require('atob');
import { type } from './type';
import { BinStream } from '../util/binstream';
import { PacketId } from './packetid';

import crypto = require('crypto');
import { RaknetClient, RaknetPort, bindRaknet, unbindRaknet, raknetPackets, ClientState } from './raknet_proxy';

interface ProxyEvents
{
    login?(ip:string, name?:string, xuid?:string):void,
}

export const proxyEvents:ProxyEvents = {};

const JWT_TRANS:{[key:string]:string} = {'-':'+', '_':'/'};
const JWT_TRANS_REGEX = /[-_]/g;
const JWT_TRANS_FN = (v:string)=>JWT_TRANS[v];

function jatob(jwt_base64:string):Buffer
{
    return Buffer.from(atob(jwt_base64.replace(JWT_TRANS_REGEX, JWT_TRANS_FN)), 'binary');
}

const privkey = jatob("MIGkAgEBBDDNeixdpeh1WK5i8bjv//A8Jy4iitouCERclTTIhgHS/LVTAjdctuSfUNt6UMs+HwGgBwYFK4EEACKhZANiAATnAIzoFZ4ERrgZYAlycLdqVdohKRafn2kyE5DnfCB+CJK4pTum/5n59kZFHng/4/D80P8ovx6ZY4SSCNWzZbT+mOsK3t5zophC+5zSLfy1yY9ZUAq+H0LUYaLeE2NAMt0=");
const pubkey = jatob("MHYwEAYHKoZIzj0CAQYFK4EEACIDYgAE5wCM6BWeBEa4GWAJcnC3alXaISkWn59pMhOQ53wgfgiSuKU7pv+Z+fZGRR54P+Pw/ND/KL8emWOEkgjVs2W0/pjrCt7ec6KYQvuc0i38tcmPWVAKvh9C1GGi3hNjQDLd");
const dkey = jatob("MHYwEAYHKoZIzj0CAQYFK4EEACIDYgAEZpTe9JC4+dMhmZwceAsU9nKjck1+bd3LfECDeM/anl3g6/BgcWN5GbM4+Ci9PEorOXqruWZV8VBYHQ8F3im8lVLF62gj4t6I5pJJnvOETYYsk1XQ2BYFzVP8UDPVjfGc");

//let obj:crypto.KeyObject = crypto.createPrivateKey(privkey);

let keyobj:crypto.KeyObject|undefined;

raknetPackets.user.recv.set(PacketId.LOGIN, 
    type.int, type.buffer,
 ).on = ([protocol, buffer], s, port)=>{
    const is = new BinStream(buffer);
    const len = is.readUint32(true);
    const chainData = JSON.parse(is.readString(len));
    // const jwt = decodeJWT(chainData.chain[0]);
    // rdx:&"eyJ4NXUiOiJNSFl3RUFZSEtvWkl6ajBDQVFZRks0RUVBQ0lEWWdBRVQ4ODVXaFVVcUdweVhURDFJRUVkc2p2Nm1IXC9NQmU5WVpBSHJxQng1N0ZjQmhRWGVVYzY2NjNMQ1wvNFJaRVdCVW5QVFZsVzh0QTFldWhFMzJacDB3ZkZicUxSeFUwNm0rZ2ZGbjlnYmZcL0JZVGhkYVMzZzFZSUY5TldnYjdrU1FMIiwiYWxnIjoiRVMzODQifQ", r13:&"eyJ4NXUiOiJNSFl3RUFZSEtvWkl6ajBDQVFZRks0RUVBQ0lEWWdBRVQ4ODVXaFVVcUdweVhURDFJRUVkc2p2Nm1IXC9NQmU5WVpBSHJxQng1N0ZjQmhRWGVVYzY2NjNMQ1wvNFJaRVdCVW5QVFZsVzh0QTFldWhFMzJacDB3ZkZicUxSeFUwNm0rZ2ZGbjlnYmZcL0JZVGhkYVMzZzFZSUY5TldnYjdrU1FMIiwiYWxnIjoiRVMzO
    // const pkey = atob(jwt.header.x5u);
    // keyobj = crypto.createPrivateKey(pkey);
    // keyobj = crypto.createPublicKey(pkey);
    
    // console.log(decodeJWT(chainData.chain[0]));
    // console.log(decodeJWT(chainData.chain[1]));
    if (chainData.chain[2])
    {
        const user = decodeJWT(chainData.chain[2]).payload.extraData;
        proxyEvents.login!(port.client.address, user.displayName, user.XUID);
    }
    else
    {
        proxyEvents.login!(port.client.address);
    }
    port.client.state = ClientState.DIRECT;
};

raknetPackets.user.recv.set(PacketId.SERVER_TO_CLIENT_HANDSHAKE,
    type.string
).on = ([jwt])=>{
	const {header, payload, secret} = decodeJWT(jwt);
	// console.log(hex(jatob(payload.salt)));
};

raknetPackets.user.recv.set(0xfe).on = async([], s, port) =>{
    try
    {
        if (s.peek() !== 120)
        {
            port.client.state = ClientState.DIRECT;
            return;
        }
        const buffer = await new Promise<Buffer>((resolve, reject)=>zlib.inflate(s.remainedBuffer(), (error, result)=>{
            if (error) reject(error);
            else resolve(result);
        }));
        s.resetBuffer(buffer);
        while (!s.eof())
        {
            const length = s.readUint32Var();
            const remaining = s.remaining();
            const ibuffer = s.readBuffer(length);
            const is = new BinStream(ibuffer);
            const packetId = is.readUint8();
            if (remaining < length)
            {
                console.error('Overflow 0x'+packetId.toString(16)+': length='+ length + '    remaining='+remaining);
            }
            
            try
            {
                port.getUserParser().parseStream(packetId, is, port);
            }
            catch (err)
            {
                console.log('Packet: 0x'+packetId.toString(16));
                console.error(err);
            }
        }
    }
    catch (err)
    {
        console.error(err);
        port.client.state = ClientState.DIRECT;
    }
};


function decodeJWT(token:string):{header:any, payload:any, secret:Buffer}{
    const [headB64, payloadB64, sigB64] = token.split(".");
    return {
		header: JSON.parse(jatob(headB64).toString('utf-8')),
		payload: JSON.parse(jatob(payloadB64).toString('utf-8')),
		secret: jatob(sigB64)
	};
}

class Client extends RaknetClient
{
    onConnected():void
    {
    }

    onDisconnected():void
    {
    }

    onError(dir:RaknetPort, packetId:number, message:string):void
    {
        console.error(`[${dir.direction}:0x${packetId.toString(16)}]: ${message}`);
    }
}

export function bindProxy():void
{
    bindRaknet({newClient(conn){ return new Client(conn); }});
}

export function unbindProxy():void
{
    unbindRaknet();
}