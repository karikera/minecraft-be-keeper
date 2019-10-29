import { WatchJson } from "../util/watchjson";

export const banlist = new WatchJson<{[key:string]:boolean}>('./banlist.json', {});

