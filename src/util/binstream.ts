

import _bigInteger = require('big-integer');
import { hex } from './util';
export const BigInt = _bigInteger;
export type BigInt = typeof _bigInteger extends ()=>infer T ? T : never;

export class BinStream
{
    private view:DataView;
    private p_end:number = 0;
    private buffer:Buffer;
    private p:number = 0;

    constructor(buffer:Buffer)
    {
        this.view = new DataView(buffer.buffer);
        this.p = buffer.byteOffset;
        this.p_end = buffer.byteLength + this.p;
        this.buffer = Buffer.from(buffer.buffer, 0, this.p_end);
    }

    peek():number
    {
        return this.buffer[this.p];
    }

    eof():boolean
    {
        return this.p >= this.p_end;
    }

    resetBuffer(buffer:Uint8Array):void
    {
        this.view = new DataView(buffer.buffer);
        this.p = buffer.byteOffset;
        this.p_end = buffer.byteLength + this.p;
        this.buffer = Buffer.from(buffer.buffer, 0, this.p_end);
    }

    remaining():number
    {
        return this.p_end - this.p;
    }

    remainedBuffer():Buffer
    {
        const out = this.buffer.subarray(this.p);
        this.p = this.p_end;
        return out;
    }

    readBuffer(length:number):Buffer
    {
        const end = this.p + length;
        const out = this.buffer.subarray(this.p, end);
        this.p = end;
        return out;
    }

    peekBuffer(length:number):Buffer
    {
        return this.buffer.subarray(this.p, this.p + length);
    }

    writeBuffer(buffer:Buffer):void
    {
        this.buffer.set(buffer, this.p);
        this.p += buffer.length;
    }

    readString(length:number):string
    {
        return this.readBuffer(length).toString('utf-8');
    }

    writeString(text:string):void
    {
        this.writeBuffer(Buffer.from(text, 'utf-8'));
    }

    readHex(length:number, seperator?:string):string
    {
        const p_end = Math.min(this.p + length, this.p_end);
        const out = hex(this.buffer.subarray(this.p, p_end), seperator);
        this.p = p_end;
        return out;
    }

    readUint64(littleEndian?:boolean):BigInt
    {
        const a = this.view.getUint32(this.p, littleEndian);
        this.p += 4;
        const b = this.view.getUint32(this.p, littleEndian);
        this.p += 4;
        return littleEndian ? 
            BigInt(b).shiftLeft(32).or(a) :
            BigInt(a).shiftLeft(32).or(b);
    }

    readUint32(littleEndian?:boolean):number
    {
        const out = this.view.getUint32(this.p, littleEndian);
        this.p += 4;
        return out;
    }
    
    readUint24(littleEndian?:boolean):number
    {
        let out:number;
        if (littleEndian)
        {
            out = this.view.getUint8(this.p);
            this.p ++;
            out |= this.view.getUint8(this.p) << 8;
            this.p ++;
            out |= this.view.getUint8(this.p) << 16;
            this.p ++;
        }
        else
        {
            out = this.view.getUint8(this.p) << 16;
            this.p ++;
            out |= this.view.getUint8(this.p) << 8;
            this.p ++;
            out |= this.view.getUint8(this.p);
            this.p ++;
        }
        return out;
    }
    
    readUint16(littleEndian?:boolean):number
    {
        const out = this.view.getUint16(this.p, littleEndian);
        this.p += 2;
        return out;
    }
    
    readUint8():number
    {
        const out = this.buffer[this.p];
        this.p++;
        return out;
    }

    readInt64(littleEndian?:boolean):BigInt
    {
        let high:number, low:number;
        if (littleEndian)
        {
            low = this.view.getUint32(this.p, false);
            this.p += 4;
            high = this.view.getInt32(this.p, false);
            this.p += 4;
        }
        else
        {
            high = this.view.getInt32(this.p, true);
            this.p += 4;
            low = this.view.getUint32(this.p, true);
            this.p += 4;
        }
        return BigInt(high).shiftLeft(32).or(low);
    }
    
    readInt32(littleEndian?:boolean):number
    {
        const out = this.view.getInt32(this.p, littleEndian);
        this.p += 4;
        return out;
    }
    
    readInt24(littleEndian?:boolean):number
    {
        const v = this.readUint24(littleEndian);
        return v < 0x8fffff ? v : v - 0x1000000;
    }

    readInt16(littleEndian?:boolean):number
    {
        const out = this.view.getInt16(this.p, littleEndian);
        this.p += 2;
        return out;
    }
    
    readInt8():number
    {
        const out = this.view.getInt8(this.p);
        this.p++;
        return out;
    }


    writeUint64(v:BigInt, littleEndian?:boolean):void
    {
        const low = +v.and(0xffffffff);
        const high = +v.shiftRight(32).and(0xffffffff);
        if (littleEndian)
        {
            this.view.setUint32(this.p, low, true);
            this.p += 4;
            this.view.setUint32(this.p, high, true);
            this.p += 4;
        }
        else
        {
            this.view.setUint32(this.p, high, false);
            this.p += 4;
            this.view.setUint32(this.p, low, false);
            this.p += 4;
        }
    }
    
    writeUint32(v:number, littleEndian?:boolean):void
    {
        this.view.setUint32(this.p, v, littleEndian);
        this.p += 4;
    }
    
    writeUint24(v:number, littleEndian?:boolean):void
    {
        if (littleEndian)
        {
            this.view.setUint8(this.p, v);
            this.p ++;
            this.view.setUint8(this.p, v >> 8);
            this.p ++;
            this.view.setUint8(this.p, v >> 16);
            this.p ++;
        }
        else
        {
            this.view.setUint8(this.p, v >> 16);
            this.p ++;
            this.view.setUint8(this.p, v >> 8);
            this.p ++;
            this.view.setUint8(this.p, v);
            this.p ++;
        }
    }
    
    writeUint16(v:number, littleEndian?:boolean):void
    {
        this.view.setUint16(this.p, v, littleEndian);
        this.p += 2;
    }
    
    writeUint8(v:number):void
    {
        this.view.setUint8(this.p, v);
        this.p++;
    }

    writeInt64(v:BigInt, littleEndian?:boolean):void
    {
        this.writeUint64(v, littleEndian);
    }

    writeInt32(v:number, littleEndian?:boolean):void
    {
        this.view.setInt32(this.p, v, littleEndian);
        this.p += 4;
    }
    
    writeInt24(v:number, littleEndian?:boolean):void
    {
        this.writeUint24(v, littleEndian);
    }

    writeInt16(v:number, littleEndian?:boolean):void
    {
        this.view.setInt16(this.p, v, littleEndian);
        this.p += 2;
    }
    
    writeInt8(v:number):void
    {
        this.view.setInt8(this.p, v);
        this.p++;
    }

    readFloat32(littleEndian?:boolean):number
    {
        const out = this.view.getFloat32(this.p, littleEndian);
        this.p += 4;
        return out;
    }

    writeFloat32(v:number, littleEndian?:boolean):void
    {
        this.view.setFloat32(this.p, v, littleEndian);
        this.p += 4;
    }

    readInt32Var():number
    {
        return 0;
    }

    writeInt32Var(v:number):void
    {
    }

    readUint32Var():number
    {
        let shift = 0;
        let out = 0;
        for (;;)
        {
            const chr = this.readUint8();
            if (chr & 0x80)
            {
                out |= (chr & 0x7f) << shift;
                shift += 7;
            }
            else
            {
                return out | (chr << shift);
            }
        }
    }

    writeUint32Var(v:number):void
    {
        while ((v >>> 0) >= 0x80) {
            this.writeUint8((v & 0x7F) | 0x80);
            v >>>= 7;
        }
        this.writeUint8(v & 0x7F);
    }

    readUBigIntVar():BigInt
    {
        let shift = BigInt.zero;
        let out = BigInt.zero;
        for (;;)
        {
            const chr = this.readUint8();
            if (chr & 0x80)
            {
                shift = shift.add(7);
                out = out.or(BigInt(chr & 0x7f).shiftLeft(shift));
            }
            else
            {
                return out.or(BigInt(chr).shiftLeft(shift));
            }
        }
    }

    writeUBigInt4Var(v:BigInt):void
    {
        if (v.lesser(0))
        {
            this.writeUint8(0);
            return;
        }
        while (v.shiftRight(0).greaterOrEquals(0x80)) {
            this.writeUint8((+v.and(0x7F)) | 0x80);
            v = v.shiftRight(7);
        }
        this.writeUint8(+v.and(0x7F));
    }
}
