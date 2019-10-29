### src/proxy  
UDP proxy, and parse raknet  
but It's incompleted, and output weird result  
### src/spawn
Minecraft spawners  
It will run minecraft and make proxy of stdin/stdout  
It will add 'restart' command  
but it cannot detect cursor move, need to fix  
### src/proxy/banlist.ts
variables from `banlist.json`  
`banlist.json` contains ip lists for ban
```json
{
    "111.111.111.111": true
}
```
### src/proxy/conninfo.ts
variables from `conninfo.json`
`conninfo.json` contains packet sending counts per ip
### src/proxy/mcproxy.ts
It parses login info, but it cannot parse encrypted data  
### src/proxy/packetid.ts
Packet Id consts  
### src/proxy/raknet_const.ts
RakNet const values
### src/proxy/raknet_proxy.ts
RakNet proxy with UDP proxy  
incompleted + It has bug  
### src/proxy/raknet_type.ts
address type structure implementation  
It's for reading & writing with packet  
### src/proxy/type.ts
byte reading & writing implementation with primitive types  
It's for reading & writing with packet  
### src/spawn/match.ts
Regexp matcher from bedrock_server output
### src/spawn/mcspawn.ts
Minecraft spawner
