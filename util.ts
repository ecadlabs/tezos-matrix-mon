export async function* tick(interval: number, immediate = false): AsyncGenerator<Date> {
    if (immediate) {
        yield Promise.resolve(new Date());
    }
    while (true) {
        yield await new Promise<Date>(resolve => setTimeout(() => resolve(new Date()), interval));
    }
}