export interface RetryOptions {
  name?: string;
  attempts?: number;
  interval?: number;
  randomInterval?: boolean;
}

export async function retry<T>(
  cb: () => Promise<T> | T,
  {name, attempts = 3, interval = 3000, randomInterval = false}: RetryOptions
): Promise<T> {
  const logs: Error[] = [];
  for (let i = 0; i < attempts; i++) {
    try {
      return await cb();
    } catch (e: any) {
      console.error(name, e.message);
      logs.push(e);
    }

    if (i < attempts - 1) {
      await new Promise(resolve => {
        setTimeout(
          resolve,
          randomInterval ? Math.round(Math.random() * interval) : interval
        );
      });
    }
  }

  console.error(logs);
  throw new Error((name ? `[${name}] ` : '') + 'Retry Failed');
}
