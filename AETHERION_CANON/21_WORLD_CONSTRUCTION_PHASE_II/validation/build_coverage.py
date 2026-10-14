#!/usr/bin/env python3
"""Build an explicit acceptance-scope index; presence alone is not substantive acceptance."""
import json,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
GROUPS=[
 ('Geography','Continental silhouette;mountain systems;coastlines;river basins;watersheds;lakes;wetlands;forests;grasslands;volcanic/glacial regions;crystal formations;canyons;underground networks;distorted gravity zones;temporal anomalies;void-touched territories;Oath borderlands;neutral wilderness;contested regions;neighbor interactions',['CONTINENT_MASTER_PLAN.md','CONTINENT_GEOGRAPHY.md','CONTINENT_MAP_SPECIFICATION.md','WORLD_REGION_GRAPH.json','FIFTEEN_REGION_BLUEPRINTS/','REGIONAL_BIOME_SPECIFICATIONS.md']),
 ('Every region','Regional geography;capital;major settlements;villages;frontier outposts;architectural style;public infrastructure;civilian/commercial districts;military/sacred/institutional structures;underground spaces;landmarks;traversal routes;wildlife habitats;resource nodes;dungeons;worldboss locations;secrets;housing;event sites;PvP objectives;hazards;weather;day/night identity;ambient activity;NPC routines;functional reason for every location',['FIFTEEN_REGION_BLUEPRINTS/','REGION_BLUEPRINT_INDEX.json','WORLD_POI_REGISTRY.json','SETTLEMENT_REGISTRY.json']),
 ('Every capital','15 preserved capital identities;site-adapted spatial organization;civic districts and institutions;public utilities and service routing;ordinary access and safe egress;distinct architecture;meaningful resident life',['CAPITAL_CITY_BLUEPRINTS/','CAPITAL_LAYOUT_REGISTRY.json']),
 ('Transportation','Walkable routes;roads;bridges;mountain passes;climbing paths;rivers;canals;maritime routes;gliding routes;underground passages;mount paths;trade highways;teleportation infrastructure;Storm Relay transportation;Escapement Road vehicles;Observatory gravity traversal;Missing Court void passages;fast-travel costs;fast-travel restrictions;fast-travel lore;meaningful exploration;ordinary exploration to every realm',['TRANSPORTATION_NETWORK.md','TRANSPORT_ROUTE_REGISTRY.json']),
 ('Living systems','Weather;seasons;ecological growth;disasters;wildlife;NPC schedules;markets;caravans;merchant travel;farming;fishing;hunting;construction;settlement maintenance;military patrols;faction conflict;festivals;invasions;public emergencies;environmental recovery;real simulation versus approximation;multiplayer synchronization;performance',['REGIONAL_BIOME_SPECIFICATIONS.md','WORLD_ECOLOGY_SYSTEM.md','DYNAMIC_WEATHER_SYSTEM.md','NPC_CIVILIZATION_SYSTEM.md','REGIONAL_ECOLOGY_PROFILES.json','WORLD_EVENT_REGISTRY.json']),
 ('Every event','Trigger;location;narrative explanation;gameplay phases;NPC participation;player roles;ability interactions;failure;success;rewards;consequences;reset/recovery',['WORLD_EVENT_REGISTRY.json']),
 ('Asset families','Terrain;rock formations;vegetation;architectural kits;bridges/roads;walls;homes;shops;workshops;temples;towers;interiors;dungeons;clutter;vehicles;transit infrastructure;wildlife;environmental VFX;mechanisms;destructibles;housing;lighting/atmosphere',['ARCHITECTURAL_KIT_REGISTRY.json','ENVIRONMENT_ASSET_REGISTRY.json']),
 ('Every asset family','Canonical ID;Oath;production purpose;visual reference or explicit missing;construction;approximate physical scale;materials;variants;collision;animation;LOD;interactions;dependencies;priority;references distinct from production assets;no recolor duplicates',['ARCHITECTURAL_KIT_REGISTRY.json','ENVIRONMENT_ASSET_REGISTRY.json','ENVIRONMENT_REFERENCE_EVIDENCE.json']),
 ('Technical architecture','Terrain generation;chunking;streaming;coordinates;floating origin;LOD/visibility;instancing;occlusion;lighting;weather rendering;foliage;water;interiors;NPC population;navigation;mount navigation;destructibility;persistence;multiplayer replication;saves;cross-platform;existing wrapper is not world-engine selection',['WORLD_STREAMING_ARCHITECTURE.md','STREAMING_PROTOTYPE_CONTRACTS.json']),
 ('Exploration','Beginner routes;midgame;dangerous frontiers;secrets;high-level dungeons;endgame contested zones;rare discoveries;mysteries;environmental puzzles;achievements;treasure/resources;open exploration;no fifteen linear levels',['DUNGEON_AND_EXPLORATION_PLAN.md','WORLD_POI_REGISTRY.json']),
 ('Quality','Geographical coherence;visual distinction;narrative purpose;mechanics;ecology;architecture;traversability;neighbor connectivity;Fifteen Oath compatibility;scalable 3D construction;no arbitrary asset-count inflation;no generic placeholders;no disconnected dioramas;no empty procedural handwaving;no false implementation status',['CANON_ALIGNMENT_AND_GAP_REPORT.md','WORLD_CONSTRUCTION_ROADMAP.md','validation/VALIDATION_REPORT.md'])]

def main():
 rows=[]
 for group,fields,paths in GROUPS:
  for label in fields.split(';'):
   exists=all((ROOT/p).exists() for p in paths)
   rows.append({'requirement_id':f'P2-REQ-{len(rows)+1:03d}','category':group,'requirement':label,'evidence_paths':paths,'status':'EVIDENCE_INDEXED_REVIEW_REQUIRED' if exists else 'MISSING_EVIDENCE','acceptance_limit':'A source map, not automatic semantic approval; see substantive review and machine report.'})
 out={'scope':'Complete owner requirement index; every row names its review evidence. Static presence is not proof of implementation or design approval.','records':rows}
 (ROOT/'validation/REQUIREMENTS_COVERAGE.json').write_text(json.dumps(out,indent=2)+'\n')
 text=['# Requirements coverage matrix','','Status: PROPOSED. This is an acceptance-scope index. Each row identifies the design evidence to review. Machine checks and the substantive review are separate; all design approval and runtime acceptance remain outstanding.','','| ID | Scope | Requirement | Evidence | State |','|---|---|---|---|---|']
 for r in rows:
  links=', '.join(f'[{p}](../{p})' for p in r['evidence_paths'])
  text.append(f"| {r['requirement_id']} | {r['category']} | {r['requirement']} | {links} | {r['status']} |")
 (ROOT/'validation/REQUIREMENTS_COVERAGE.md').write_text('\n'.join(text)+'\n');print(len(rows),'requirement rows')
if __name__=='__main__':main()
