import { LinkedList, LinkNode } from "../util/linkedlist";

const MATCH = /^\[([0-9]+)-([0-9]+)-([0-9]+) ([0-9]+):([0-9]+):([0-9]+) INFO\]/;

const list = new LinkedList<Match>();

export class Match extends LinkNode
{

    constructor(
        public readonly regexp:RegExp, 
        public readonly callback:(date:Date, matched:RegExpExecArray, match:Match)=>void)
    {
        super();
    }

    regist():void
    {
        list.push(this);
    }

    static process(message:string):void
    {
        const matched = MATCH.exec(message);
        if (matched)
        {
            const [line, year, month, date, hours, minutes, seconds] = matched;
            const time = new Date(+year, +month, +date, +hours, +minutes, +seconds);
            const text = message.substr(matched[0].length);
            
            for (const match of list)
            {
                const array = match.regexp.exec(text);
                if (!array) continue;
                match.callback(time, array, match);
                return;
            }
            console.log(time.toLocaleTimeString() + ' ' + text);
        }
        else
        {
            console.log(message);
        }
    }
}
