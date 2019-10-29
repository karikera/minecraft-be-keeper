import { Type, type } from "./type";

const ipv4 = new Type<string>(s=>{
    let out = (s.readUint8() ^ 0xff)+'.';
    out += (s.readUint8() ^ 0xff); out += '.';
    out += (s.readUint8() ^ 0xff); out += '.';
    out += (s.readUint8() ^ 0xff);
    return out;
}, (s,v)=>{
    const vs = v.split('.').map(v=>(~v)&0xff);
    s.writeUint8(vs[0]);
    s.writeUint8(vs[1]);
    s.writeUint8(vs[2]);
    s.writeUint8(vs[3]);
});
const ipv6 = new Type<string>(s=>{
    return s.readHex(16, ':');
}, (s,v)=>{
    for (const hex of v.split(':'))
    {
        s.writeUint8(parseInt(hex, 16));
    }
});

const address = type.compare('version', type.byte)
.case(4, 
    ['address', ipv4], 
    ['port', type.short]
)
.case(6, 
    ['family', type.lshort], 
    ['port', type.short], 
    ['flowInfo', type.int], 
    ['address', ipv6],
    ['scopeId', type.int] 
);

export const raknetType = {
    address
};