// STUB — replaced by the ui agent.
export async function init(ctx) {
  const p = ctx.params;
  return {
    chooseCharacter: async () => ({ name: p.get('name') || 'Wayfarer', oath: p.get('oath') || 'oath-09', cls: p.get('cls') || 'ninja' }),
    enterGame() {}, toast() {}, log() {}, showDialog: async () => null,
  };
}
