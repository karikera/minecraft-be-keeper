

export class LinkNode
{
    public next:LinkNode = this;
    public prev:LinkNode = this;

    remove():void
    {
        const p = this.prev;
        const n = this.next;
        p.next = n;
        n.prev = p;

        this.prev = this.next = this;
    }

    insert(node:LinkNode):void
    {
        const p = this.prev;
        p.next = node;
        node.prev = p;

        node.next = this
        this.prev = node;
    }
}

export class LinkedList<T extends LinkNode> extends LinkNode implements Iterable<T>
{
    constructor()
    {
        super();
    }

    *values():IterableIterator<T>
    {
        let node = this.next;
        while (node !== this)
        {
            const next = node.next;
            yield node as T;
            node = next;
        }
    }

    *[Symbol.iterator]():IterableIterator<T>
    {
                
    }

    push(node:T):void
    {
        this.insert(node);
    }

    unshift(node:T):void
    {
        this.insert(this.next);
    }

    pop():T|null
    {
        const last = this.prev;
        if (last === this) return null;
        last.remove();
        return last as T;
    }

    shift():T|null
    {
        const first = this.next;
        if (first === this) return null;
        first.remove();
        return first as T;
    }
}

