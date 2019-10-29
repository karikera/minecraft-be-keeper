
export class Event<T extends (...args:any[])=>void = ()=>void>
{
    private readonly list:(T)[] = [];

    constructor()
    {
    }

    on(fn:T):void
    {
        this.list.push(fn);
    }

    fire(...args:T extends (...args:infer ARGS)=>void ? ARGS : never):void
    {
        for (const fn of this.list)
        {
            fn(...args);
        }
    }
}
