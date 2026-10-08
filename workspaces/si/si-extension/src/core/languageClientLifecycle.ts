export interface ManagedLanguageClient {
    start(): Promise<void> | void;
    stop(): Promise<void>;
}

export class LanguageClientLifecycle<T extends ManagedLanguageClient> {
    private activeClient?: T;
    private initialization?: Promise<T>;

    async initialize(createClient: () => Promise<T> | T): Promise<T> {
        if (this.initialization) {
            return this.initialization;
        }

        this.initialization = this.replaceClient(createClient);
        try {
            return await this.initialization;
        } finally {
            this.initialization = undefined;
        }
    }

    async dispose(): Promise<void> {
        if (this.initialization) {
            await this.initialization;
        }
        await this.stopActiveClient();
    }

    private async replaceClient(createClient: () => Promise<T> | T): Promise<T> {
        await this.stopActiveClient();
        const client = await createClient();
        await client.start();
        this.activeClient = client;
        return client;
    }

    private async stopActiveClient(): Promise<void> {
        const client = this.activeClient;
        this.activeClient = undefined;
        if (client) {
            await client.stop();
        }
    }
}
