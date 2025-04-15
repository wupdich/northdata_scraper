type QueueTask<T> = {
  task: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
};

/**
 * Simple in-memory queue for processing tasks sequentially
 */
export class Queue<T> {
  private queue: QueueTask<T>[] = [];
  private processing = false;

  /**
   * Add a task to the queue
   * @param task Function that returns a promise
   * @returns Promise that resolves with the task result
   */
  public enqueue(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.processNext();
    });
  }

  /**
   * Process the next task in the queue
   */
  private async processNext(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;
    const { task, resolve, reject } = this.queue.shift()!;

    try {
      const result = await task();
      resolve(result);
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.processing = false;
      this.processNext();
    }
  }

  /**
   * Get the number of tasks in the queue
   */
  public get size(): number {
    return this.queue.length;
  }

  /**
   * Check if the queue is currently processing a task
   */
  public get isProcessing(): boolean {
    return this.processing;
  }
}
