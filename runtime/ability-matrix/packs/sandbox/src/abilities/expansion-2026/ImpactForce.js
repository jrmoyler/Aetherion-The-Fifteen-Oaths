/** Bounded physical response for expansion-only committed hits. */
export function validImpactForce(force){
  return !!force&&typeof force==='object'&&!Array.isArray(force)&&
    Number.isFinite(force.impulse)&&force.impulse>=0&&force.impulse<=24&&
    Number.isFinite(force.lift)&&force.lift>=0&&force.lift<=20&&
    Number.isFinite(force.spin)&&force.spin>=0&&force.spin<=8;
}
/** Scale impulse and lift like established casts, without exceeding the bridge bounds. */
export function impactForce(config,intensity=1){
  const force={impulse:config.hitImpulse??6,lift:config.hitLift??3.4,spin:config.hitSpin??1.4};
  // Preserve invalid authored input for the bridge to reject rather than silently repairing it.
  if(!validImpactForce(force))return force;
  const scale=Number.isFinite(intensity)?Math.max(0,Math.min(3,intensity)):1;
  return {impulse:Math.min(24,force.impulse*scale),lift:Math.min(20,force.lift*scale),spin:force.spin};
}
