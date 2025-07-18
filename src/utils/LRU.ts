
class Node<T> {
  key: string;
  value: T;
  prev: Node<T> | null = null;
  next: Node<T> | null = null;

  constructor(key: string, value: T) {
    this.key = key;
    this.value = value;
  }
}

export default class LRUCache<T> {
  private capacity: number;
  private cache: Map<string, Node<T>> = new Map();
  private head: Node<T> | null = null;
  private tail: Node<T> | null = null;
  private _onEvict: ((key: string, value: T) => void) | null = null;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  get(key: string): T | undefined {
    const node = this.cache.get(key);
    if (!node) {
      return undefined;
    }
    this.moveToHead(node);
    return node.value;
  }

  set(key: string, value: T): void {
    let node = this.cache.get(key);
    if (node) {
      node.value = value;
      this.moveToHead(node);
    } else {
      node = new Node(key, value);
      this.cache.set(key, node);
      this.addToHead(node);
      if (this.cache.size > this.capacity) {
        this.evict();
      }
    }
  }

  on(event: 'evict', callback: (key: string, value: T) => void) {
    if (event === 'evict') {
      this._onEvict = callback;
    }
  }

  private addToHead(node: Node<T>): void {
    node.next = this.head;
    node.prev = null;
    if (this.head) {
      this.head.prev = node;
    }
    this.head = node;
    if (!this.tail) {
      this.tail = node;
    }
  }

  private moveToHead(node: Node<T>): void {
    if (node === this.head) {
      return;
    }
    this.removeNode(node);
    this.addToHead(node);
  }

  private removeNode(node: Node<T>): void {
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
  }

  private evict(): void {
    if (!this.tail) {
      return;
    }
    const keyToEvict = this.tail.key;
    const valueToEvict = this.tail.value;
    this.cache.delete(keyToEvict);
    this.removeNode(this.tail);
    if (this._onEvict) {
      this._onEvict(keyToEvict, valueToEvict);
    }
  }
}