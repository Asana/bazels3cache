import * as debug_ from "debug";
import { CacheConfig } from "./config";

const debugCache = debug_("bazels3cache:cache");

interface CacheNode {
    s3key: string;
    buffer: Buffer;
    prev?: CacheNode;
    next?: CacheNode;
}

export class Cache {
    private size = 0;
    private head?: CacheNode; // the newest element in the cache
    private tail?: CacheNode; // the oldest
    private entries: { [s3key: string]: CacheNode } = {};

    constructor(private config: CacheConfig) {}

    public contains(s3key: string): boolean {
        return this.entries.hasOwnProperty(s3key);
    }

    public get(s3key: string): Buffer | null {
        const node = this.entries[s3key];
        if (node) {
            this._moveNodeToHead(node);
            return node.buffer;
        } else {
            return null;
        }
    }

    public delete(s3key: string): boolean {
        if (this.entries.hasOwnProperty(s3key)) {
            this._deleteNode(this.entries[s3key]);
            return true;
        } else {
            return false;
        }
    }

    public maybeAdd(s3key: string, buffer: Buffer): void {
        if (this.config.enabled) {
            this.delete(s3key);
            if (buffer.byteLength < this.config.maxEntrySizeBytes) {
                this._makeSpace(buffer.byteLength);
                const node: CacheNode = {
                    s3key: s3key,
                    buffer: buffer,
                    next: this.head
                };
                if (node.next) {
                    node.next.prev = node;
                }
                this.head = node;
                if (!this.tail) {
                    this.tail = node;
                }
                this.entries[s3key] = node;
                this.size += buffer.byteLength;
                debugCache(`Added ${s3key} size=${buffer.byteLength}, total size = ${this.size}`);
            }
        }
    }

    private _makeSpace(newItemLength: number) {
        if (this.config.enabled) {
            while (this.tail && this.size + newItemLength > this.config.maxTotalSizeBytes) {
                this._deleteNode(this.tail);
            }
        }
    }

    private _moveNodeToHead(node: CacheNode) {
        this._deleteNode(node);
        this.maybeAdd(node.s3key, node.buffer);
    }

    private _deleteNode(node: CacheNode) {
        if (node.prev) {
            node.prev.next = node.next;
        } else {
            this.head = node.next;
        }
        if (node.next) {
            node.next.prev = node.prev;
        } else {
            this.tail = node.prev;
        }
        this.size -= node.buffer.byteLength;
        delete this.entries[node.s3key];
        debugCache(
            `Removed ${node.s3key} size=${node.buffer.byteLength}, total size = ${this.size}`
        );
    }
}
