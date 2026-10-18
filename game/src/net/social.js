// Client mirror of the server's social state (parties, invitations, duels, trades, PvP flag, war zones,
// honor) built from welcome / you / ev messages, plus relation queries used by combat targeting,
// nameplates and the social UI. The server stays authoritative: this only decides what to *show* and
// what to *offer* (e.g. never auto-target a friendly player); every action is re-validated server side.
//
// Bus events: social:party (roster|null), social:invite ({kind, from, name, until, state}), social:duel (duel|null),
//             social:trade (trade|null, plus {state:'done'|'cancelled'} payloads), social:pvp ({on, eff, cd}),
//             social:warzone (zone|null), social:honor (event), social:change ({what}).

const REL_PARTY = 'party', REL_DUEL = 'duel', REL_HOSTILE = 'hostile', REL_NEUTRAL = 'neutral', REL_SELF = 'self';

export function createSocialStore(bus, { selfId, entities }) {
  const st = {
    party: null, invites: new Map(), duel: null, trade: null,
    pvp: false, pvpEff: 0, pvpCd: 0, honor: 0, pvpKills: 0, war: null, warZones: [], rules: null,
  };
  const emit = (what, payload) => { bus.emit(`social:${what}`, payload); bus.emit('social:change', { what }); };

  function myParty() { return st.party?.id ?? null; }
  function duelOpponent() {
    const d = st.duel; const me = selfId();
    if (!d || d.state === 'end' || me == null) return null;
    return d.a === me ? d.b : d.b === me ? d.a : null;
  }

  /** Relation of an entity to the local player: 'self'|'party'|'duel'|'hostile'|'neutral', or null for non-players. */
  function relation(id) {
    if (id == null) return null;
    if (id === selfId()) return REL_SELF;
    const e = entities().get(id);
    const inRoster = st.party?.members?.some((m) => m.id === id);
    if (!e) return inRoster ? REL_PARTY : null;
    if (e.k !== 'p') return null;
    if (duelOpponent() === id) return REL_DUEL;
    const mp = myParty();
    if (inRoster || (mp && e.party === mp)) return REL_PARTY;
    if (st.pvpEff > 0 && (e.pvp ?? 0) > 0) return REL_HOSTILE;
    return REL_NEUTRAL;
  }
  /** May the local player damage this entity (players only; mobs are handled by combat)? */
  function canAttack(id) {
    const r = relation(id);
    if (r === REL_HOSTILE) return true;
    if (r === REL_DUEL) return st.duel?.state === 'fight';
    return false;
  }

  function onWelcome(w) {
    st.warZones = Array.isArray(w?.world?.warZones) ? w.world.warZones : [];
    st.rules = w?.world?.social ?? null;
    if (!w?.resumed) { st.party = null; st.invites.clear(); st.duel = null; st.trade = null; }
    onYou(w?.you);
    bus.emit('social:change', { what: 'welcome' });
  }

  function onYou(y) {
    if (!y) return;
    let pvpChanged = false;
    if (typeof y.pvp === 'boolean' && y.pvp !== st.pvp) { st.pvp = y.pvp; pvpChanged = true; }
    if (Number.isFinite(y.pvpEff) && y.pvpEff !== st.pvpEff) { st.pvpEff = y.pvpEff; pvpChanged = true; }
    if (Number.isFinite(y.pvpCd)) st.pvpCd = y.pvpCd;
    if (Number.isFinite(y.honor)) st.honor = y.honor;
    if (Number.isFinite(y.pvpKills)) st.pvpKills = y.pvpKills;
    st.pvpCombat = !!y.pvpCombat;
    if (y.party === null && st.party) { st.party = null; emit('party', null); }
    if (y.trade === null && st.trade && st.trade.state !== 'closed') { st.trade = null; emit('trade', null); }
    if (y.duel === null && st.duel && st.duel.state !== 'end') { st.duel = null; emit('duel', null); }
    if (pvpChanged) emit('pvp', { on: st.pvp, eff: st.pvpEff, cd: st.pvpCd });
  }

  function onEvent(e) {
    switch (e.type) {
      case 'invite': {
        if (e.state === 'open') { st.invites.set(`${e.kind}|${e.from}`, e); emit('invite', e); }
        else {
          for (const k of [...st.invites.keys()]) if ((e.kind === 'any' || k.startsWith(`${e.kind}|`)) && k.endsWith(`|${e.from}`)) st.invites.delete(k);
          emit('invite', e);
        }
        break;
      }
      case 'party': st.party = e.party ?? null; emit('party', st.party); break;
      case 'duel': {
        const me = selfId();
        if (e.a !== me && e.b !== me) { emit('duelNearby', e); break; } // spectator: ring only
        st.duel = e.state === 'end' ? null : e;
        emit('duel', e);
        break;
      }
      case 'pvp': st.pvp = !!e.on; if (Number.isFinite(e.cd)) st.pvpCd = e.cd; emit('pvp', { on: st.pvp, eff: st.pvpEff, cd: st.pvpCd }); break;
      case 'warzone': st.war = e.zone ?? null; if (e.zone) st.pvpEff = 2; emit('warzone', st.war); break;
      case 'honor': st.honor = e.total ?? st.honor; st.pvpKills = e.kills ?? st.pvpKills; emit('honor', e); break;
      case 'trade': {
        if (e.state === 'open' || e.state === 'update') st.trade = e;
        else st.trade = null;
        emit('trade', e);
        break;
      }
      default: break;
    }
  }

  return {
    state: st, relation, canAttack, onWelcome, onYou, onEvent,
    get party() { return st.party; }, get duel() { return st.duel; }, get trade() { return st.trade; },
    get invites() { return [...st.invites.values()]; }, get warZones() { return st.warZones; },
    duelOpponent, myParty,
  };
}
