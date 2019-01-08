class Lock {
    private _promise  : Promise<void> | undefined;
    private _resolver: ((value?: void | PromiseLike<void> | undefined) => void )| undefined;

    public async lock() {
        while (this._promise) {
            await this._promise;
        }
        this._promise = new Promise<void>((resolve) => this._resolver = resolve);
    }

    public unlock() : void {
        if (this._resolver) {
            this._resolver();
        }
        this._promise = undefined;
        this._resolver = undefined;
    }
}

export { Lock };