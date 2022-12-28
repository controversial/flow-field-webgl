function formatMemory(bytes: number) {
  const mib = bytes / 1024 / 1024;
  return `${mib.toLocaleString(undefined, { maximumFractionDigits: 2 })} MiB`;
}

export default class MemoryMonitor {
  pageMemory?: Awaited<ReturnType<NonNullable<Performance['measureUserAgentSpecificMemory']>>>;

  constructor() {
    this.updatePageMemory();
  }

  async updatePageMemory() {
    if (!performance.measureUserAgentSpecificMemory) return;
    this.pageMemory = await performance.measureUserAgentSpecificMemory();
    this.updatePageMemory();
  }

  get summary() {
    if (!this.pageMemory) return '';
    const lines = this.pageMemory.breakdown
      .filter((entry) => entry.bytes > 0)
      // highest usage first
      .sort((a, b) => b.bytes - a.bytes)
      .map(({ bytes, types }) => `${types.join(', ') || 'Unknown'}: ${formatMemory(bytes)}`);
    return `${lines.join('\n')}\nTotal: ${formatMemory(this.pageMemory.bytes)}`;
  }

  get supported() {
    return !!performance.measureUserAgentSpecificMemory;
  }
}
