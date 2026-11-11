// Sheet recipes by hero id. A hero without a recipe keeps its baked costume.
import kilnNinja from './oath-01-ninja.js';
import kilnSorcerer from './oath-01-sorcerer.js';
import courtNinja from './oath-11-ninja.js';
import courtSorcerer from './oath-11-sorcerer.js';
import sanguineNinja from './oath-12-ninja.js';
import sanguineSorcerer from './oath-12-sorcerer.js';
import theatreNinja from './oath-13-ninja.js';
import theatreSorcerer from './oath-13-sorcerer.js';
import escapementNinja from './oath-14-ninja.js';
import escapementSorcerer from './oath-14-sorcerer.js';
import foundryNinja from './oath-15-ninja.js';
import foundrySorcerer from './oath-15-sorcerer.js';

export const RECIPES = Object.fromEntries([
  kilnNinja, kilnSorcerer,
  courtNinja, courtSorcerer, sanguineNinja, sanguineSorcerer, theatreNinja, theatreSorcerer, escapementNinja, escapementSorcerer, foundryNinja, foundrySorcerer,
].map((recipe) => [recipe.id, recipe]));
export const recipeFor = (id) => RECIPES[id] ?? null;
