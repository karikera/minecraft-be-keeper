
export const unique = {
    maps: new WeakMap<{new(param:any):any}, Map<any, any>>(),
    clear<PARAM, T>(cls:{new(param:PARAM):T}):void
    {
        unique.maps.delete(cls);
    },
    getMap<PARAM, T>(cls:{new(param:PARAM):T}):Map<PARAM, T>
    {
        let list = unique.maps.get(cls);
        if (!list)
        {
            list = new Map;
            unique.maps.set(cls, list);
        }
        return list;
    },
    set<PARAM, T extends {line:PARAM}>(cls:{new(param:PARAM):T}, value:T):void
    {
        const list = unique.getMap(cls);
        list.set(value.line, value);
    },
    get<PARAM, T>(cls:{new(param:PARAM):T}, param:PARAM):T
    {
        const list = unique.getMap(cls);
        let obj = list.get(param);
        if (!obj)
        {
            obj = new cls(param);
            list.set(param, obj);
        }
        return obj;
    }
};
