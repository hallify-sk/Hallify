export class TokenBucket<_Key> {
	public max: number;
	public refillIntervalSeconds: number;

	constructor(max: number, refillIntervalSeconds: number) {
		this.max = max;
		this.refillIntervalSeconds = refillIntervalSeconds;
	}

	private storage = new Map<_Key, Bucket>();

	public consume(key: _Key, cost: number): boolean {
		let bucket = this.storage.get(key) ?? null;
		const now = Date.now();
		if (bucket === null) {
			bucket = {
				count: this.max - cost,
				refilledAt: now
			};
			this.storage.set(key, bucket);
			return true;
		}
		const refill = Math.floor((now - bucket.refilledAt) / (this.refillIntervalSeconds * 1000));
		bucket.count = Math.min(bucket.count + refill, this.max);
		bucket.refilledAt = now;
		if (bucket.count < cost) {
			return false;
		}
		bucket.count -= cost;
		this.storage.set(key, bucket);
		return true;
	}
}

interface Bucket {
	count: number;
	refilledAt: number;
}

export class Throttler<_Key> {
	public timeoutSeconds: number[];

	private storage = new Map<_Key, ThrottlingCounter>();

	constructor(timeoutSeconds: number[]) {
		this.timeoutSeconds = timeoutSeconds;
	}

	public consume(key: _Key): boolean {
		let counter = this.storage.get(key) ?? null;
		const now = Date.now();
		if (counter === null) {
			counter = {
				index: 0,
				updatedAt: now
			};
			this.storage.set(key, counter);
			return true;
		}
		const allowed = now - counter.updatedAt >= this.timeoutSeconds[counter.index] * 1000;
		if (!allowed) {
			return false;
		}
		counter.updatedAt = now;
		counter.index = Math.min(counter.index + 1, this.timeoutSeconds.length - 1);
		this.storage.set(key, counter);
		return true;
	}

	public reset(key: _Key): void {
		this.storage.delete(key);
	}
}

interface ThrottlingCounter {
	index: number;
	updatedAt: number;
}
