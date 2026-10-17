// Ability-id → recipe table, merged from the per-element recipe modules (one distinct recipe per castable).
import fire from './fire.js';
import frost from './frost.js';
import storm from './storm.js';
import water from './water.js';
import earth from './earth.js';
import wind from './wind.js';
import nature from './nature.js';
import poison from './poison.js';
import light from './light.js';
import cosmic from './cosmic.js';
import shadow from './shadow.js';
import blood from './blood.js';
import arcane from './arcane.js';
import time from './time.js';
import tech from './tech.js';

export const RECIPES = { ...fire, ...frost, ...storm, ...water, ...earth, ...wind, ...nature, ...poison, ...light, ...cosmic, ...shadow, ...blood, ...arcane, ...time, ...tech };
