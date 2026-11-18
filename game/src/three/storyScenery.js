import { DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, OctahedronGeometry, RingGeometry, TetrahedronGeometry } from 'three';

const VIEW_DISTANCE = 125;

// A low-cost, terrain-seated silhouette marks where the fighting happened.
export function initStoryScenery(ctx) {
  const sites = [];
  const shards = new TetrahedronGeometry(1);
  const crystal = new OctahedronGeometry(.8);
  const rim = new RingGeometry(2.1, 2.35, 12, 1, .15, Math.PI * 1.6);
  const granite = new MeshStandardMaterial({ color: 0x34303e, roughness: .91, flatShading: true });
  const brass = new MeshStandardMaterial({ color: 0x927852, roughness: .84, flatShading: true });
  const amethyst = new MeshBasicMaterial({ color: 0xb69af1, toneMapped: false });
  const ward = new MeshBasicMaterial({ color: 0xbfa77b, opacity: .65, transparent: true, depthWrite: false, side: DoubleSide });
  const groundAt = (x, z) => ctx.world.heightAt(x, z);

  function markSite(site) {
    const group = new Group();
    group.name = `Story site: ${site.kind}`;
    group.visible = false;
    const breach = site.kind === 'breach';
    const count = breach ? 5 : 4;
    for (let i = 0; i < count; i++) {
      const angle = i / count * Math.PI * 2 + .48;
      const radius = 5.9 + (i % 2) * 1.4;
      const x = site.x + Math.cos(angle) * radius, z = site.z + Math.sin(angle) * radius;
      const rock = new Mesh(shards, breach ? granite : brass);
      rock.scale.set(.8 + (i % 3) * .31, breach ? 1.45 : .71, .8);
      rock.rotation.set(.18 * i, angle, -.17 * i);
      rock.position.set(x, groundAt(x, z) + .14, z);
      group.add(rock);
      if (breach) {
        const glow = new Mesh(crystal, amethyst);
        glow.scale.set(.16, .72 + .22 * (i % 3), .16);
        glow.rotation.set(.23, angle, .34);
        glow.position.set(x, rock.position.y + .83, z);
        group.add(glow);
      } else {
        const split = new Mesh(shards, granite);
        split.scale.set(.53, .34, .61);
        split.rotation.y = angle * .7;
        split.position.set(x + .84, groundAt(x + .84, z) + .13, z);
        group.add(split);
      }
    }
    if (!breach) {
      const circle = new Mesh(rim, ward);
      circle.rotation.x = -Math.PI / 2;
      circle.position.set(site.x, groundAt(site.x, site.z) + .18, site.z);
      group.add(circle);
    }
    ctx.scene.add(group);
    return { x: site.x, z: site.z, group };
  }

  const offWelcome = ctx.bus.on('net:welcome', ({ world }) => {
    sites.forEach(({ group }) => group.removeFromParent());
    sites.length = 0;
    for (const site of world?.storySites ?? []) {
      if ((site.kind === 'ambush' || site.kind === 'breach') && Number.isFinite(site.x) && Number.isFinite(site.z)) sites.push(markSite(site));
    }
  });
  const offUpdate = ctx.addUpdate(() => {
    const player = ctx.actors?.player?.position;
    for (const { x, z, group } of sites) group.visible = !!player && Math.hypot(player.x - x, player.z - z) < VIEW_DISTANCE;
  }, 57);

  return { dispose() {
    offWelcome(); offUpdate();
    sites.forEach(({ group }) => group.removeFromParent());
    for (const resource of [shards, crystal, rim, granite, brass, amethyst, ward]) resource.dispose();
  } };
}
