
import https = require('https');

export function wget(url:string):Promise<string>
{
    return new Promise<string>((resolve, reject)=>{
        https.get(url, response=>{
            if (response.statusCode !== 200){
                reject(Error('Status:' + response.statusCode));
                return;
            }
            let out = '';
            response.on('data', chunk=>{
                out += chunk.toString('utf-8');
            });
            response.on('end', ()=>{
                resolve(out);    
            });
        }).on('error', reject);
    });
}
