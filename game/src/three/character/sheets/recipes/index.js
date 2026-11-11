// Sheet recipes by hero id. A hero without a recipe keeps its baked costume.
import kilnNinja from './oath-01-ninja.js';
import kilnSorcerer from './oath-01-sorcerer.js';
import reedNinja from './oath-06-ninja.js';
import reedSorcerer from './oath-06-sorcerer.js';
import graftNinja from './oath-07-ninja.js';
import graftSorcerer from './oath-07-sorcerer.js';
import glassNinja from './oath-08-ninja.js';
import glassSorcerer from './oath-08-sorcerer.js';
import dawnNinja from './oath-09-ninja.js';
import dawnSorcerer from './oath-09-sorcerer.js';
import tidalNinja from './oath-10-ninja.js';
import tidalSorcerer from './oath-10-sorcerer.js';

export const RECIPES = Object.fromEntries([kilnNinja, kilnSorcerer, reedNinja, reedSorcerer, graftNinja, graftSorcerer, glassNinja, glassSorcerer, dawnNinja, dawnSorcerer, tidalNinja, tidalSorcerer].map((recipe) => [recipe.id, recipe]));
export const recipeFor = (id) => RECIPES[id] ?? null;
