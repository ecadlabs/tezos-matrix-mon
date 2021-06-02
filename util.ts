export async function* tick(interval: number, immediate = false): AsyncGenerator<Date> {
    if (immediate) {
        yield new Date();
    }
    while (true) {
        yield new Promise<Date>(resolve => setTimeout(() => resolve(new Date()), interval));
    }
}

export class Canceller {
    private rejectFunc: (arg?: unknown) => void = () => { };
    private canceller = new Promise<void>((_resolve, reject) => this.rejectFunc = reject);

    public cancel(arg?: unknown) {
        this.canceller.catch(() => { }); // eat exception
        this.rejectFunc(arg);
    }

    public async wrap<T>(target: Promise<T>): Promise<T> {
        const res = await Promise.race([target.then(v => ({ v })), this.canceller.then(undefined)]);
        if (res === undefined) {
            throw new Error(""); // unlikely    
        }
        return res.v;
    }
}
