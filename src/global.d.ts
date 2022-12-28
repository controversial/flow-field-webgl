declare module '*.glsl' {
  const value: string;
  export default value;
}

interface Performance {
  measureUserAgentSpecificMemory?(): Promise<{
    bytes: number,
    breakdown: ({
      types: string[],
      bytes: number,
    })[],
  }>;
}
