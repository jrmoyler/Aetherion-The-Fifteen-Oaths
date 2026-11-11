// Sheet recipes by hero id. A hero without a recipe keeps its baked costume.
import kilnNinja from './oath-01-ninja.js';
import kilnSorcerer from './oath-01-sorcerer.js';

export const RECIPES = Object.fromEntries([kilnNinja, kilnSorcerer].map((recipe) => [recipe.id, recipe]));
export const recipeFor = (id) => RECIPES[id] ?? null;
