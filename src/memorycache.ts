import * as debug_ from "debug";
import { Config } from "./config";

const debugCache = debug_("bazels3cache:cache");

interface CacheNode {
    s3key: string;
    buffer: Buffer;
    prev: CacheNode;
    next: CacheNode;
};

export class Cache {
    size: number = 0;
    head: CacheNode = null; // the newest element in the cache
    tail: CacheNode = null; // the oldest
    entries: { [s3key: string]: CacheNode } = {};

    constructor(private config: Config) {
    }

    contains(s3key: string) {
        return this.entries.hasOwnProperty(s3key);
    }

    get(s3key: string) {
        const node = this.entries[s3key];
        return node ? node.buffer : null;
    }

    private deleteNode(node: CacheNode) {
        if (node.prev) { node.prev.next = node.next; } else { this.head = node.next; }
        if (node.next) { node.next.prev = node.prev; } else { this.tail = node.prev; }
        this.size -= node.buffer.byteLength;
        delete this.entries[node.s3key];
        debugCache(`Removed ${node.s3key} size=${node.buffer.byteLength}, total size = ${this.size}`);
    }

    delete(s3key: string) {
        if (this.entries.hasOwnProperty(s3key)) {
            this.deleteNode(this.entries[s3key]);
            return true;
        } else {
            return false;
        }
    }

    private makeSpace(newItemLength: number) {
        if (this.config.cache.enabled) {
            while (this.size > 0 && this.size + newItemLength > this.config.cache.maxTotalSizeBytes) {
                this.deleteNode(this.tail);
            }
        }
    }

    public maybeAdd(s3key: string, buffer: Buffer) {
        if (this.config.cache.enabled) {
            this.delete(s3key);
            if (buffer.byteLength < this.config.cache.maxEntrySizeBytes) {
                this.makeSpace(buffer.byteLength);
                const node: CacheNode = {
                    s3key: s3key,
                    buffer: buffer,
                    prev: null,
                    next: this.head
                };
                if (node.next) node.next.prev = node;
                this.head = node;
                if (!this.tail) this.tail = node;
                this.entries[s3key] = node;
                this.size += buffer.byteLength;
                debugCache(`Added ${s3key} size=${buffer.byteLength}, total size = ${this.size}`);
            }
        }
    }
}
