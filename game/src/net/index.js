// STUB — replaced by the server agent.
export async function init(ctx) {
  return { mode: 'offline', selfId: 'me', connect: async () => ({}), send() {}, rtt: 0, serverTime: () => Date.now() };
}
