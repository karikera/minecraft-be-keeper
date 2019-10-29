
export default class Parser
{
    public p:number = 0;
    public line:number = 1;

    constructor(public content:string)
    {
    }

    read():number
    {
        return this.content.charCodeAt(this.p++);
    }

    eof():boolean
    {
        return this.p >= this.content.length;
    }

    error(message:string):never
    {
        throw Error(this.line+': '+message);
    }

    readToRegexp(regexp:RegExp):string
    {
        regexp.lastIndex = this.p;
        const res = regexp.exec(this.content);
        if (!res)
        {
            const block = this.content.substr(this.p);
            this.p = this.content.length;
            return block;
        }
        else
        {
            const block = this.content.substring(this.p, res.index);
            this.p = res.index;
            return block;
        }
    }

    readBrace(open:string, close:string):string
    {
        this.skipWhitespace();
        this.must(open);

        const regexp = new RegExp('['+open+close+']', 'g');
        regexp.lastIndex = this.p;

        let count = 1;
        for (;;)
        {
            const res = regexp.exec(this.content);
            if (!res)
            {
                throw this.error('Brace not matching');
            }
            if (res[0] === open)
            {
                count ++;
            }
            else
            {
                count --;
                if (count === 0)
                {
                    const out = this.content.substring(this.p, res.index);
                    this.p = regexp.lastIndex;
                    return out;
                }
            }
        }
    }

    readWith(str:string):string
    {
        const p = this.content.indexOf(str, this.p);
        if (p === -1)
        {
            const out = this.content.substr(this.p);
            this.p = this.content.length;
            return out;
        }
        else
        {
            const out = this.content.substring(this.p, p);
            this.p = p + str.length;
            return out;
        }
    }

    readBlock():string
    {
        this.skipWhitespace();
        return this.readToRegexp(/[^0-9a-zA-Z_$]/g);
    }

    readLine():string
    {
        return this.readWith('\n');
    }

    mustBlock(text:string):void
    {
        this.skipWhitespace();
        const block = this.readBlock();
        if (block !== text)
        {
            this.error(text +' expected but '+block);
        }
    }

    peekIf(text:string):boolean
    {
        this.skipWhitespace();
        return this.content.substr(this.p, text.length) === text;
    }

    nextIf(text:string):boolean
    {
        if (!this.peekIf(text)) return false;
        this.p += text.length;
        return true;
    }

    must(text:string):void
    {
        if (!this.nextIf(text))
        {
            this.error(text+' expected but ' + this.content.substr(this.p, 10));
        }
    }

    skipWhitespace()
    {
        this.readToRegexp(/[^\x00-\x20]/g);
    }
}
