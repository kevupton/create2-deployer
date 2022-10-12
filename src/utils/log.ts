export function debug(...content: any[]) {
  if (process.env.DEBUG?.toLowerCase() === 'true') {
    console.debug('[create2 debug] ' + new Date().toISOString());
    console.debug(...content);
  }
}
