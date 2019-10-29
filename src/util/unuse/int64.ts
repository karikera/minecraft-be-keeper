
/// XXX: Not completed, decided to use BigInt

export interface Int64
{
    readonly high:number;
    readonly low:number;
    equals(v:number|Int64):boolean;
    compare(v:number|Int64):number;
    neg():Int64;
    add(n:number|Int64):Int64;
    sub(n:number|Int64):Int64;
    mul(n:number|Int64):Int64;
    idiv(n:number|Int64):[Int64, Int64];
    udiv(n:number|Int64):[Int64, Int64];
    shl(n:number):Int64;
    shr(n:number):Int64;
    sal(n:number):Int64;
    sar(n:number):Int64;
    toString(radix?:number):string;
};
function fls(x:number):number
{
	let r = 32;
	if (!x) return 0;
	if (!(x & 0xffff0000)) {
		x <<= 16;
		r -= 16;
	}
	if (!(x & 0xff000000)) {
		x <<= 8;
		r -= 8;
	}
	if (!(x & 0xf0000000)) {
		x <<= 4;
		r -= 4;
	}
	if (!(x & 0xc0000000)) {
		x <<= 2;
		r -= 2;
	}
	if (!(x & 0x80000000)) {
		x <<= 1;
		r -= 1;
	}
	return r;
}

class Int64Methods implements Int64
{
    constructor(
        public readonly high:number,
        public readonly low:number)
    {

    }

    equals(v:number|Int64):boolean
    {
        if (v instanceof Int64)
        {
            return this.high === v.high && this.low === v.low;
        }
        else
        {
            return this.high === 0 && this.low === v;
        }
    }
    compare(v:number|Int64):number
    {
        if (v instanceof Int64)
        {
            return this.high - v.high || this.low - v.low;
        }
        else
        {
            return this.high || this.low - v;
        }
    }
    neg():Int64
    {
        if (this.low === 0) return new Int64(-this.high, 0);
        return new Int64(~this.high, -this.low);
    }
    add(n:number|Int64):Int64
    {
        if (!(n instanceof Int64)) n = Int64(n);
    
        if (this.low < 0 && n.low < 0)
        {
            return new Int64(
                this.high + n.high + 1 | 0, 
                this.low + n.low | 0
            );
        }
        else
        {
            return new Int64(
                this.high + n.high | 0,
                this.low + n.low | 0
            );
        }
    }
    sub(n:number|Int64):Int64
    {
        if (!(n instanceof Int64)) n = Int64(n);
    
        if ((this.low >>> 0) < (n.low >>> 0))
        {
            return new Int64(
                this.high + n.high - 1 | 0, 
                this.low + n.low | 0
            );
        }
        else
        {
            return new Int64(
                this.high - n.high | 0,
                this.low - n.low | 0
            );
        }
    }
    mul(n:number|Int64):Int64
    {
        if (!(n instanceof Int64)) n = Int64(n);
        return new Int64(
            Math.imul(this.high, n.low) + Math.imul(n.high, this.low)
            + (this.low >>> 16) * (n.low >>> 16) | 0,
            Math.imul(this.low, n.low)
        );
    }
    udiv(n:number|Int64):[Int64, Int64]
    {
        if (n instanceof Int64)
        {
            let dividend:Int64 = this;
            
            let high = n.high;
            if (high)
            {
                let shift = fls(high);
                n = n.shr(shift).low;
                dividend = dividend.shr(shift);
            }
            else
            {
                n = n.low;
            }
        }

        let rem:Int64;
        let res:Int64;
        let high = this.high;
        /* Reduce the thing a bit first */
        if (high >= n) {
            high = high / n |0;
            res = new Int64(high, 0);
            rem = this.sub(new Int64(high*n, 0));
        }
        else
        {
            res = Int64(0);
            rem = this;
        }

        let b = Int64(n);
        let d = Int64(1);
        while (b.compare(0) > 0 && rem.compare(b) > 0) {
            b = b.shl(1);
            d = d.shl(1);
        }

        do {
            if (rem.compare(b) >= 0) {
                rem = rem.sub(b);
                res = res.add(d);
            }
            b = b.shr(1);
            d = d.shr(1);
        } while (d);
        return [rem, res];
    }
    idiv(n:number|Int64):[Int64, Int64]
    {
        if (n instanceof Int64)
        {
            let dividend:Int64 = this;
            
            let high = n.high;
            if (high)
            {
                let shift = fls(high);
                n = n.shr(shift).low;
                dividend = dividend.shr(shift);
            }
            else
            {
                n = n.low;
            }
        }

        let rem:Int64;
        let res_high:number;
        /* Reduce the thing a bit first */
        let u_high = this.high >>> 0;
        const u_n = n >>> 0;
        if (u_high >= u_n) {
            res_high = u_high / u_n | 0;
            rem = this.sub(new Int64(res_high*n, 0));
        }
        else
        {
            res_high = 0;
            rem = this;
        }

        let b = Int64(n);
        let d = 1;
        while (b.compare(0) > 0 && rem.compare(b) > 0) {
            b = b.shl(1);
            d <<= 1;
        }

        let res_low = 0;
        do {
            if (rem.compare(b) >= 0) {
                rem = rem.sub(b);
                res_low = res_low + d | 0;
            }
            b = b.shr(1);
            d = d >>> 1;
        } while (d);
        return [new Int64(res_high, res_low), rem];
    }

    shl(n:number):Int64
    {
        n &= 0x1f;
        if (n === 0) return this;
        return new Int64(
            (this.high << n) | (this.low >> (32 - n)),
            this.low << n,
        );
    }
    shr(n:number):Int64
    {
        n &= 0x1f;
        if (n === 0) return this;
        return new Int64(
            this.high >>> n,
            (this.high << (32 - n)) | (this.low >>> n),
        );
    }
    sal(n:number):Int64
    {
        return this.shl(n);
    }
    sar(n:number):Int64
    {
        n &= 0x1f;
        if (n === 0) return this;
        return new Int64(
            this.high >> n,
            (this.high << (32 - n)) | (this.low >>> n),
        );
    }

    toString(radix?:number):string
    {
        if (radix === undefined) radix = 0;
        else if (radix < 2 || radix > 36) throw Error('radix argument must be between 2 and 36');

        let out:number[] = [];
        let i = 0;
        let v:Int64 = this;
        let neg:boolean;
        if ((neg = (v.compare(0) < 0)))
        {
            v = v.neg();
        }
        do
        {
            const chr = v.udiv(10)[1].low;
            out[i++] = chr >= 10 ? (chr + (0x61 - 0x10)) : chr + 0x30;
            v = v.udiv(10)[0];
        }
        while (!v.equals(0));

        if (neg)
        {
            out[i] = 0x2d;
        }
        
        return String.fromCharCode(...out.reverse());
    }
    valueOf():number
    {
        return this.high * 0x100000000 + this.low;
    }
}

interface Int64Class
{
    new(high:number, low:number):Int64;
    (v:number):Int64;
};
export const Int64:Int64Class = <any>function(this:any, high:number, low:number) {
    if (this instanceof Int64)
    {
        (<any>this).high = high | 0;
        (<any>this).low = low | 0;
    }
    else
    {
        return new Int64(high | 0, high / 0x100000000 |0);
    }
};

Int64.prototype = Int64Methods.prototype;
Int64.prototype.constructor = Int64;

