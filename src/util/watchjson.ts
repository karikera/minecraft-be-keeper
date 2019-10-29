import { watch, FSWatcher, promises as fs } from "fs";
import { Event } from "./event";

export class WatchJson<T>
{
    private loadWait:NodeJS.Timeout|null = null;
    private saveWait:NodeJS.Timeout|null = null;
    private watcher:FSWatcher|null = null;
    private ignoreWatch:number = 0;
    private promise:Promise<T>|null = null;
    public data:T;

    public readonly onError = new Event<(error:Error)=>void>();
    public readonly onUpdate = new Event<(data:T)=>void>();
    public readonly onSaveAfter = new Event<(data:T)=>void>();

    constructor(public readonly filename:string, defaultValue:T)
    {
        const watchCallback = (event:string)=>{
            if (this.ignoreWatch >= Date.now()) return;
            if (event === 'change')
            {
                this.load();
            }
            else if (event === 'rename')
            {
                if (this.watcher) this.watcher.close();
                this.watcher = watch(filename, watchCallback);
            }
        }
        try
        {
            this.watcher = watch(filename, watchCallback);
            this.promise = this.load();
        }
        catch (err)
        {
            if (this.watcher)
            {
                this.watcher.close();
                this.watcher = null;
            }
            if (err.code === 'ENOENT')
            {
                fs.writeFile(filename, JSON.stringify(defaultValue, null, 4), 'utf-8').then(()=>{
                    this.watcher = watch(filename, watchCallback);
                });
            }
            else
            {
                throw err;
            }
        }
    }

    dispose():void
    {
        if (this.watcher)
        {
            this.watcher.close();
            this.watcher = null;
        }
    }

    load():Promise<T>
    {
        if (this.promise) return this.promise;
        return new Promise((resolve, reject)=>{
            this.loadWait = setTimeout(async()=>{
                this.loadWait = null;
                this.promise = null;
    
                try
                {
                    const json = await fs.readFile(this.filename, 'utf-8');
                    this.data = JSON.parse(json);
                }
                catch(err)
                {
                    this.onError.fire(err);
                    reject(err);
                    return;
                }
    
                resolve(this.data);
                this.onUpdate.fire(this.data);
            }, 300);
        });
    }
    
    save():void
    {
        if (this.saveWait) return;
        this.saveWait = setTimeout(()=>{
            this.saveWait = null;
            this.ignoreWatch = Date.now() + 500;
            fs.writeFile(this.filename, JSON.stringify(this.data, null, 4), 'utf-8').then(()=>{
                this.onSaveAfter.fire(this.data);
            });
        }, 1000);
    }
}
