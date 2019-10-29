
import fs = require('fs');


const CACHE_DURATION = 5000;
export class Cache<T>
{
	private cached:Promise<T>|null = null;

	constructor(private readonly reader:()=>Promise<T>)
	{
	}

	get():Promise<T>
	{
		if (this.cached !== null) return this.cached!;
		const prom = this.reader();
		this.cached = prom;
		setTimeout(()=>{ this.cached = null; }, CACHE_DURATION);
		return prom;
	}
}

export class CachedFileList extends Cache<string[]>
{
	constructor(public readonly path:string)
	{
		super(()=>new Promise((resolve, reject)=>{
			fs.readdir(this.path, (err, files)=>{
				if (err) reject(err);
				else resolve(files);
			});
		}));
	}

	child(child:string):string
	{
		return this.path + child;
	}
}
