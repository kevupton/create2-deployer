export function debug(...content: any[]) {
  if (process.env.CREATE2_DEBUG?.toLowerCase() === 'true') {
    console.debug('[create2 debug] ' + new Date().toISOString());
    console.debug(...content);
  }
}
